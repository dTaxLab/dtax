/**
 * HTX (formerly Huobi) CSV Format Parser
 *
 * Handles HTX/Huobi's Spot Trade History export.
 * Standard headers: Time, Pair, Side, Price, Amount, Total, Fee, Fee Currency, Role
 * API-style: order-id, symbol, type, price, filled-amount, filled-fees, fee-deduct-currency, role, created-at
 *
 * Symbol format: "btcusdt" (lowercase concatenated) or "BTC/USDT"
 * Side: "Buy"/"Sell" or type: "buy-limit"/"sell-market"/etc.
 * Time: "YYYY-MM-DD HH:mm:ss" or Unix ms
 *
 * @license AGPL-3.0
 */

import { parseCsvToObjects, safeParseNumber, safeParseDateToIso } from './csv-core';
import type { ParsedTransaction, CsvParseResult, CsvParseError } from './types';

const FIAT_CURRENCIES = new Set(['USD', 'USDT', 'USDC', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'BUSD', 'DAI']);

/** Known quote currencies for symbol splitting (longest match first) */
const KNOWN_QUOTES = ['USDT', 'USDC', 'BUSD', 'DAI', 'USD', 'EUR', 'GBP', 'BTC', 'ETH'];

/**
 * Detect if a CSV is in HTX/Huobi trade history format.
 */
export function isHtxCsv(csv: string): boolean {
    const firstLine = csv.split('\n')[0]?.toLowerCase() || '';
    // HTX standard: "pair" + "side" + "fee currency" + exclude other exchanges
    // Exclude: "currency pair" (Gate.io), "pairs" (MEXC), "trading pair" (Bitget),
    //          "trade id"/"order id" (OKX), "filled price" (Gate.io/Bybit)
    if (firstLine.includes('pair') && firstLine.includes('side') &&
        firstLine.includes('fee currency') &&
        !firstLine.includes('currency pair') && !firstLine.includes('currency_pair') &&
        !firstLine.includes('pairs') && !firstLine.includes('trading pair') &&
        !firstLine.includes('trade id') && !firstLine.includes('order id') &&
        !firstLine.includes('filled price')) {
        return true;
    }
    // HTX API-style: "filled-amount" or "filled-fees" (hyphenated — unique to Huobi API)
    if (firstLine.includes('filled-amount') || firstLine.includes('filled-fees')) {
        return true;
    }
    // HTX API-style: "fee-deduct-currency" (unique to Huobi)
    if (firstLine.includes('fee-deduct-currency')) {
        return true;
    }
    return false;
}

/**
 * Split an HTX symbol (e.g., "btcusdt" or "BTC/USDT") into [base, quote].
 */
function splitSymbol(symbol: string): [string, string] | null {
    const s = symbol.toUpperCase().trim();
    // Try common separators first
    const sepParts = s.split(/[-\/]/);
    if (sepParts.length === 2 && sepParts[0] && sepParts[1]) {
        return [sepParts[0], sepParts[1]];
    }
    // Concatenated: try KNOWN_QUOTES from right
    for (const quote of KNOWN_QUOTES) {
        if (s.endsWith(quote) && s.length > quote.length) {
            return [s.slice(0, -quote.length), quote];
        }
    }
    return null;
}

/**
 * Parse HTX's type field (e.g., "buy-limit", "sell-market") into side.
 */
function parseSide(row: Record<string, string>): 'buy' | 'sell' | null {
    const side = (row['side'] || row['direction'] || '').toLowerCase().trim();
    if (side === 'buy' || side === 'sell') return side;

    // API format: type field like "buy-limit", "sell-market", "buy-market", "sell-limit"
    const typeField = (row['type'] || '').toLowerCase().trim();
    if (typeField.startsWith('buy')) return 'buy';
    if (typeField.startsWith('sell')) return 'sell';

    return null;
}

/**
 * Parse an HTX/Huobi Spot Trade History CSV.
 */
export function parseHtxCsv(csv: string): CsvParseResult {
    const objects = parseCsvToObjects(csv);
    const errors: CsvParseError[] = [];
    const transactions: ParsedTransaction[] = [];

    for (let i = 0; i < objects.length; i++) {
        const row = objects[i];
        const rowNum = i + 2;

        try {
            const tx = parseTradeRow(row, rowNum, errors);
            if (tx) transactions.push(tx);
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
            format: 'htx',
        },
    };
}

/** Parse a single HTX trade row */
function parseTradeRow(
    row: Record<string, string>,
    rowNum: number,
    errors: CsvParseError[],
): ParsedTransaction | null {
    // Parse timestamp
    const tsRaw = row['time'] || row['created-at'] || row['created_at'] ||
        row['createdat'] || row['timestamp'] || row['date'] || '';
    let timestamp: string | null = null;

    const tsNum = Number(tsRaw);
    if (!isNaN(tsNum) && tsNum > 1e12) {
        timestamp = new Date(tsNum).toISOString();
    } else {
        timestamp = safeParseDateToIso(tsRaw);
    }

    if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        return null;
    }

    // Parse symbol/pair
    const symbolRaw = (row['pair'] || row['symbol'] || row['trading pair'] || '').trim();
    const parsed = splitSymbol(symbolRaw);
    if (!parsed) {
        errors.push({ row: rowNum, message: `Invalid symbol: "${symbolRaw}"` });
        return null;
    }
    const [base, quote] = parsed;

    // Determine side
    const side = parseSide(row);
    if (!side) {
        errors.push({ row: rowNum, message: 'Missing side/direction' });
        return null;
    }
    const isBuy = side === 'buy';

    const price = safeParseNumber(row['price'] || row['avg price'] || row['average price']);
    const qty = safeParseNumber(row['amount'] || row['filled-amount'] || row['filled amount'] ||
        row['filledamount'] || row['quantity'] || row['qty']);
    const total = safeParseNumber(row['total'] || row['turnover'] || row['filled-cash-amount'] ||
        row['filledcashamount']);
    const fee = safeParseNumber(row['fee'] || row['filled-fees'] || row['filledfees'] ||
        row['filled fees'] || row['trading fee']);
    const feeCurrency = (row['fee currency'] || row['fee-deduct-currency'] || row['feedeductcurrency'] ||
        row['fee ccy'] || '').toUpperCase().trim();

    if (!qty || qty <= 0) {
        errors.push({ row: rowNum, message: 'Invalid quantity' });
        return null;
    }

    const isFiatQuote = FIAT_CURRENCIES.has(quote);
    const computedTotal = total || (price ? price * qty : 0);

    const tx: ParsedTransaction = {
        type: isFiatQuote ? (isBuy ? 'BUY' : 'SELL') : 'TRADE',
        timestamp,
    };

    if (isBuy) {
        tx.receivedAsset = base;
        tx.receivedAmount = qty;
        tx.sentAsset = quote;
        tx.sentAmount = computedTotal;
        if (isFiatQuote && computedTotal) tx.receivedValueUsd = computedTotal;
    } else {
        tx.sentAsset = base;
        tx.sentAmount = qty;
        tx.receivedAsset = quote;
        tx.receivedAmount = computedTotal;
        if (isFiatQuote && computedTotal) tx.sentValueUsd = computedTotal;
    }

    if (fee && Math.abs(fee) > 0) {
        tx.feeAmount = Math.abs(fee);
        tx.feeAsset = feeCurrency || quote;
        if (FIAT_CURRENCIES.has(tx.feeAsset)) {
            tx.feeValueUsd = Math.abs(fee);
        }
    }

    return tx;
}
