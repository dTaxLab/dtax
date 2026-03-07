/**
 * Coinbase CSV Format Parser
 *
 * Handles Coinbase's standard transaction history export format:
 * Timestamp, Transaction Type, Asset, Quantity Transacted,
 * Spot Price Currency, Spot Price at Transaction, Subtotal,
 * Total (inclusive of fees and/or spread), Fees and/or Spread, Notes
 *
 * @license AGPL-3.0
 */

import { parseCsvRows, safeParseNumber, safeParseDateToIso } from './csv-core';
import type {
    ParsedTransaction,
    CsvParseResult,
    CsvParseError,
} from './types';

/** Coinbase transaction type mapping */
function mapCoinbaseType(raw: string): ParsedTransaction['type'] {
    const map: Record<string, ParsedTransaction['type']> = {
        'buy': 'BUY',
        'sell': 'SELL',
        'send': 'TRANSFER_OUT',
        'receive': 'TRANSFER_IN',
        'convert': 'TRADE',
        'rewards income': 'STAKING_REWARD',
        'staking income': 'STAKING_REWARD',
        'coinbase earn': 'AIRDROP',
        'learning reward': 'AIRDROP',
        'advance trade buy': 'BUY',
        'advance trade sell': 'SELL',
        'interest': 'INTEREST',
    };
    return map[raw.toLowerCase().trim()] || 'UNKNOWN';
}

/**
 * Detect if a CSV is in Coinbase format by checking headers.
 */
export function isCoinbaseCsv(csv: string): boolean {
    const firstLine = csv.split('\n')[0]?.toLowerCase() || '';
    return firstLine.includes('transaction type') &&
        firstLine.includes('quantity transacted') &&
        firstLine.includes('spot price');
}

/**
 * Parse a Coinbase CSV export.
 */
export function parseCoinbaseCsv(csv: string): CsvParseResult {
    // Coinbase CSVs sometimes have metadata rows before the actual CSV header.
    // Look for the line containing "Timestamp" to find the real header.
    const lines = csv.split('\n');
    let headerIndex = -1;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        if (lines[i].toLowerCase().includes('timestamp') &&
            lines[i].toLowerCase().includes('transaction type')) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        return {
            transactions: [],
            errors: [{ row: 0, message: 'Could not find Coinbase CSV header row' }],
            summary: { totalRows: 0, parsed: 0, failed: 1, format: 'coinbase' },
        };
    }

    // Re-parse starting from the actual header
    const csvBody = lines.slice(headerIndex).join('\n');
    const rows = parseCsvRows(csvBody);
    if (rows.length < 2) {
        return {
            transactions: [],
            errors: [],
            summary: { totalRows: 0, parsed: 0, failed: 0, format: 'coinbase' },
        };
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const transactions: ParsedTransaction[] = [];
    const errors: CsvParseError[] = [];

    // Find column indices
    const colIdx = {
        timestamp: headers.indexOf('timestamp'),
        type: headers.indexOf('transaction type'),
        asset: headers.indexOf('asset'),
        quantity: headers.indexOf('quantity transacted'),
        spotPrice: headers.indexOf('spot price at transaction'),
        subtotal: headers.indexOf('subtotal'),
        total: headers.indexOf('total (inclusive of fees and/or spread)'),
        fees: headers.indexOf('fees and/or spread'),
        notes: headers.indexOf('notes'),
    };

    // Fallback for column name variations
    if (colIdx.total === -1) {
        colIdx.total = headers.findIndex(h => h.startsWith('total'));
    }
    if (colIdx.fees === -1) {
        colIdx.fees = headers.findIndex(h => h.startsWith('fees'));
    }

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = headerIndex + i + 1;

        try {
            const tsRaw = colIdx.timestamp >= 0 ? row[colIdx.timestamp] : '';
            const timestamp = safeParseDateToIso(tsRaw);
            if (!timestamp) {
                errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
                continue;
            }

            const rawType = colIdx.type >= 0 ? row[colIdx.type] : '';
            const type = mapCoinbaseType(rawType);
            const asset = colIdx.asset >= 0 ? row[colIdx.asset]?.toUpperCase() : undefined;
            const quantity = colIdx.quantity >= 0 ? safeParseNumber(row[colIdx.quantity]) : undefined;
            const total = colIdx.total >= 0 ? safeParseNumber(row[colIdx.total]) : undefined;
            const fees = colIdx.fees >= 0 ? safeParseNumber(row[colIdx.fees]) : undefined;
            const notes = colIdx.notes >= 0 ? row[colIdx.notes] : undefined;

            if (!asset) {
                errors.push({ row: rowNum, message: 'Missing asset' });
                continue;
            }

            const isBuy = ['BUY', 'TRANSFER_IN', 'STAKING_REWARD', 'AIRDROP', 'INTEREST'].includes(type);

            const tx: ParsedTransaction = {
                type,
                timestamp,
                notes: notes || undefined,
            };

            if (isBuy) {
                tx.receivedAsset = asset;
                tx.receivedAmount = quantity;
                tx.receivedValueUsd = total ? Math.abs(total) : undefined;
            } else {
                tx.sentAsset = asset;
                tx.sentAmount = quantity ? Math.abs(quantity) : undefined;
                tx.sentValueUsd = total ? Math.abs(total) : undefined;
            }

            if (fees && fees > 0) {
                tx.feeAsset = 'USD';
                tx.feeValueUsd = fees;
            }

            transactions.push(tx);
        } catch (e) {
            errors.push({
                row: rowNum,
                message: e instanceof Error ? e.message : 'Unknown error',
            });
        }
    }

    return {
        transactions,
        errors,
        summary: {
            totalRows: rows.length - 1,
            parsed: transactions.length,
            failed: errors.length,
            format: 'coinbase',
        },
    };
}
