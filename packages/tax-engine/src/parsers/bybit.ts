/**
 * Bybit CSV Format Parser
 *
 * Handles Bybit's Spot Trade History export.
 * Common headers: Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Total,Fee,Fee Currency,Order Time,Order Type
 * Alt headers: orderId,symbol,side,execPrice,execQty,execValue,execFee,feeCurrency,execTime
 *
 * Symbol format: "BTCUSDT", "ETHBTC" (no separator — CCXT-style concatenation)
 * Side: "Buy" or "Sell"
 *
 * @license AGPL-3.0
 */

import { parseCsvToObjects, safeParseNumber, safeParseDateToIso } from './csv-core';
import type { ParsedTransaction, CsvParseResult, CsvParseError } from './types';

const FIAT_CURRENCIES = new Set(['USD', 'USDT', 'USDC', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'BUSD', 'DAI']);

/** Known quote currencies for symbol splitting (longest match first) */
const KNOWN_QUOTES = ['USDT', 'USDC', 'BUSD', 'DAI', 'USD', 'EUR', 'GBP', 'BTC', 'ETH'];

/**
 * Detect if a CSV is in Bybit trade history format.
 */
export function isBybitCsv(csv: string): boolean {
    const firstLine = csv.split('\n')[0]?.toLowerCase() || '';
    // Bybit-specific: "filled qty" or "execqty" plus "symbol" and ("side" or "direction")
    return firstLine.includes('symbol') &&
        (firstLine.includes('side') || firstLine.includes('direction')) &&
        (firstLine.includes('filled qty') || firstLine.includes('execqty') ||
         firstLine.includes('filled price') || firstLine.includes('execprice') ||
         firstLine.includes('order no'));
}

/**
 * Split a Bybit concatenated symbol (e.g., "BTCUSDT") into [base, quote].
 */
function splitSymbol(symbol: string): [string, string] | null {
    const s = symbol.toUpperCase().trim();
    for (const quote of KNOWN_QUOTES) {
        if (s.endsWith(quote) && s.length > quote.length) {
            return [s.slice(0, -quote.length), quote];
        }
    }
    // Try hyphen or slash separator as fallback
    const parts = s.split(/[-\/]/);
    if (parts.length === 2 && parts[0] && parts[1]) {
        return [parts[0], parts[1]];
    }
    return null;
}

/**
 * Parse a Bybit Spot Trade History CSV.
 */
export function parseBybitCsv(csv: string): CsvParseResult {
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
            format: 'bybit',
        },
    };
}

/** Parse a single Bybit trade row */
function parseTradeRow(
    row: Record<string, string>,
    rowNum: number,
    errors: CsvParseError[],
): ParsedTransaction | null {
    // Parse timestamp — multiple possible column names
    const tsRaw = row['order time'] || row['trade time'] || row['exectime'] ||
        row['exec time'] || row['time'] || row['timestamp'] || '';
    const timestamp = safeParseDateToIso(tsRaw);
    if (!timestamp) {
        errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
        return null;
    }

    // Parse symbol
    const symbolRaw = (row['symbol'] || row['trading pair'] || row['pair'] || '').trim();
    const parsed = splitSymbol(symbolRaw);
    if (!parsed) {
        errors.push({ row: rowNum, message: `Invalid symbol: "${symbolRaw}"` });
        return null;
    }
    const [base, quote] = parsed;

    const side = (row['side'] || row['direction'] || '').toLowerCase().trim();
    const price = safeParseNumber(row['avg. filled price'] || row['filled price'] ||
        row['execprice'] || row['exec price'] || row['price']);
    const qty = safeParseNumber(row['filled qty'] || row['execqty'] || row['exec qty'] ||
        row['qty'] || row['amount'] || row['quantity']);
    const total = safeParseNumber(row['total'] || row['execvalue'] || row['exec value'] ||
        row['filled total'] || row['funds']);
    const fee = safeParseNumber(row['fee'] || row['execfee'] || row['exec fee'] ||
        row['trading fee']);
    const feeCurrency = (row['fee currency'] || row['feecurrency'] || row['fee ccy'] || '').toUpperCase().trim();

    if (!qty || qty <= 0) {
        errors.push({ row: rowNum, message: 'Invalid quantity' });
        return null;
    }

    const isBuy = side === 'buy';
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
