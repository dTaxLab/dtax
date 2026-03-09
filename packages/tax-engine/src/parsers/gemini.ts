/**
 * Gemini CSV Format Parser
 *
 * Handles Gemini's Transaction History export format:
 * Date, Time (UTC), Type, Symbol, Specification, Liquidity Indicator, Trading Fee Rate (bps),
 * [Currency] Amount ([Currency]), Trading Fee ([Currency]) ([Currency]), [Currency] Balance ([Currency])
 *
 * Gemini transaction types: Buy, Sell, Credit, Debit, Interest Credit, Administrative Credit
 *
 * Dynamic columns: each currency traded gets its own Amount/Fee/Balance columns.
 *
 * @license AGPL-3.0
 */

import { parseCsvToObjects, safeParseNumber, safeParseDateToIso } from './csv-core';
import type { ParsedTransaction, CsvParseResult, CsvParseError } from './types';

const FIAT_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'HKD']);

/**
 * Extract currency symbols from dynamic Gemini column headers.
 * parseCsvToObjects lowercases all headers, so keys look like "btc amount (btc)".
 */
function extractCurrencies(headers: string[]): string[] {
    const currencies: string[] = [];
    for (const h of headers) {
        const match = h.match(/^(.+?)\s+amount\s+\(/i);
        if (match) {
            currencies.push(match[1].trim().toUpperCase());
        }
    }
    return currencies;
}

/**
 * Find the column key for a currency's amount in the parsed row.
 * Keys are lowercased: "usd amount ($)", "btc amount (btc)"
 */
function findAmountKey(row: Record<string, string>, currency: string): string | undefined {
    const prefix = currency.toLowerCase() + ' amount';
    return Object.keys(row).find(k => k.startsWith(prefix));
}

/**
 * Find the column key for a currency's trading fee.
 * Keys are lowercased: "trading fee (usd) ($)", "trading fee (btc) (btc)"
 */
function findFeeKey(row: Record<string, string>, currency: string): string | undefined {
    const prefix = 'trading fee (' + currency.toLowerCase() + ')';
    return Object.keys(row).find(k => k.startsWith(prefix));
}

/** Map Gemini type to DTax type */
function mapGeminiType(type: string): ParsedTransaction['type'] {
    const t = type.toLowerCase().trim();
    if (t === 'buy') return 'BUY';
    if (t === 'sell') return 'SELL';
    if (t === 'credit') return 'TRANSFER_IN';
    if (t === 'debit') return 'TRANSFER_OUT';
    if (t === 'interest credit' || t === 'interest') return 'INTEREST';
    if (t === 'administrative credit') return 'AIRDROP';
    if (t === 'staking reward') return 'STAKING_REWARD';
    return 'UNKNOWN';
}

/**
 * Detect if a CSV is in Gemini format.
 */
export function isGeminiCsv(csv: string): boolean {
    const firstLine = csv.split('\n')[0]?.toLowerCase() || '';
    return firstLine.includes('symbol') &&
        firstLine.includes('specification') &&
        firstLine.includes('liquidity indicator');
}

/**
 * Parse a Gemini Transaction History CSV.
 */
export function parseGeminiCsv(csv: string): CsvParseResult {
    const objects = parseCsvToObjects(csv);
    const errors: CsvParseError[] = [];
    const transactions: ParsedTransaction[] = [];

    if (objects.length === 0) {
        return { transactions, errors, summary: { totalRows: 0, parsed: 0, failed: 0, format: 'gemini' } };
    }

    // Detect available currencies from column headers
    const headerKeys = Object.keys(objects[0]);
    const currencies = extractCurrencies(headerKeys);

    for (let i = 0; i < objects.length; i++) {
        const row = objects[i];
        const rowNum = i + 2;

        try {
            // Parse date — Gemini may have "Date" and "Time (UTC)" as separate columns
            const dateStr = row['date'] || '';
            const timeStr = row['time (utc)'] || row['time(utc)'] || '';
            const tsRaw = timeStr ? `${dateStr} ${timeStr}` : dateStr;
            const timestamp = safeParseDateToIso(tsRaw);
            if (!timestamp) {
                errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
                continue;
            }

            const rawType = row['type'] || '';
            const symbol = (row['symbol'] || '').toUpperCase().trim();
            const txType = mapGeminiType(rawType);

            if (txType === 'BUY' || txType === 'SELL') {
                const tx = parseTradeRow(row, symbol, currencies, timestamp, txType, rowNum, errors);
                if (tx) transactions.push(tx);
            } else {
                const tx = parseSingleRow(row, currencies, timestamp, txType, rowNum, errors);
                if (tx) transactions.push(tx);
            }
        } catch (e) {
            errors.push({ row: rowNum, message: e instanceof Error ? e.message : 'Unknown error' });
        }
    }

    transactions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
        transactions,
        errors,
        summary: {
            totalRows: objects.length,
            parsed: transactions.length,
            failed: errors.length,
            format: 'gemini',
        },
    };
}

/** Parse a Buy/Sell trade row */
function parseTradeRow(
    row: Record<string, string>,
    symbol: string,
    currencies: string[],
    timestamp: string,
    txType: 'BUY' | 'SELL',
    rowNum: number,
    errors: CsvParseError[],
): ParsedTransaction | null {
    // Find currencies with non-zero amounts in this row
    const amountsByCurrency: { currency: string; amount: number }[] = [];
    for (const cur of currencies) {
        const key = findAmountKey(row, cur);
        if (key) {
            const amt = safeParseNumber(row[key]);
            if (amt != null && amt !== 0) {
                amountsByCurrency.push({ currency: cur, amount: amt });
            }
        }
    }

    if (amountsByCurrency.length < 2) {
        // Fallback: try to infer from symbol (e.g., "BTCUSD" → BTC + USD)
        const pair = inferPairFromSymbol(symbol);
        if (pair) {
            for (const cur of [pair.base, pair.quote]) {
                const key = findAmountKey(row, cur);
                if (key) {
                    const amt = safeParseNumber(row[key]);
                    if (amt != null && amt !== 0) {
                        amountsByCurrency.push({ currency: cur, amount: amt });
                    }
                }
            }
        }
    }

    if (amountsByCurrency.length < 2) {
        errors.push({ row: rowNum, message: `Cannot find trade pair amounts for symbol "${symbol}"` });
        return null;
    }

    // Positive = received, Negative = sent
    const received = amountsByCurrency.find(a => a.amount > 0);
    const sent = amountsByCurrency.find(a => a.amount < 0);

    if (!received || !sent) {
        errors.push({ row: rowNum, message: `Cannot determine trade direction for "${symbol}"` });
        return null;
    }

    const tx: ParsedTransaction = {
        type: txType,
        timestamp,
        receivedAsset: received.currency,
        receivedAmount: received.amount,
        sentAsset: sent.currency,
        sentAmount: Math.abs(sent.amount),
    };

    // USD value: if one side is fiat
    if (FIAT_CURRENCIES.has(sent.currency)) {
        tx.receivedValueUsd = Math.abs(sent.amount);
    } else if (FIAT_CURRENCIES.has(received.currency)) {
        tx.sentValueUsd = received.amount;
    }

    // Find fees
    addFees(tx, row, currencies);

    return tx;
}

/** Parse a non-trade row (deposit, withdrawal, interest, etc.) */
function parseSingleRow(
    row: Record<string, string>,
    currencies: string[],
    timestamp: string,
    txType: ParsedTransaction['type'],
    rowNum: number,
    errors: CsvParseError[],
): ParsedTransaction | null {
    // Find the currency with a non-zero amount
    for (const cur of currencies) {
        const key = findAmountKey(row, cur);
        if (!key) continue;
        const amt = safeParseNumber(row[key]);
        if (amt == null || amt === 0) continue;

        const tx: ParsedTransaction = { type: txType, timestamp };

        if (amt > 0) {
            tx.receivedAsset = cur;
            tx.receivedAmount = amt;
        } else {
            tx.sentAsset = cur;
            tx.sentAmount = Math.abs(amt);
        }

        addFees(tx, row, currencies);
        return tx;
    }

    errors.push({ row: rowNum, message: 'No currency amount found' });
    return null;
}

/** Add fee info from dynamic fee columns */
function addFees(tx: ParsedTransaction, row: Record<string, string>, currencies: string[]): void {
    for (const cur of currencies) {
        const feeKey = findFeeKey(row, cur);
        if (!feeKey) continue;
        const fee = safeParseNumber(row[feeKey]);
        if (fee && fee !== 0) {
            tx.feeAmount = Math.abs(fee);
            tx.feeAsset = cur;
            if (FIAT_CURRENCIES.has(cur)) {
                tx.feeValueUsd = Math.abs(fee);
            }
            return;
        }
    }
}

/** Try to infer base/quote currencies from a trading symbol like "BTCUSD" */
function inferPairFromSymbol(symbol: string): { base: string; quote: string } | null {
    // Try known fiat suffixes first
    for (const fiat of ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD']) {
        if (symbol.endsWith(fiat) && symbol.length > fiat.length) {
            return {
                base: symbol.slice(0, -fiat.length),
                quote: fiat,
            };
        }
    }
    // Try known crypto quote currencies
    for (const quote of ['BTC', 'ETH', 'USDT', 'DAI']) {
        if (symbol.endsWith(quote) && symbol.length > quote.length) {
            return {
                base: symbol.slice(0, -quote.length),
                quote,
            };
        }
    }
    return null;
}
