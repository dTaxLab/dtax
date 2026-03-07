/**
 * Generic CSV Format Parser
 * Handles user-defined column mappings for custom CSV files.
 *
 * @license AGPL-3.0
 */

import { parseCsvToObjects, safeParseNumber, safeParseDateToIso } from './csv-core';
import type {
    ParsedTransaction,
    CsvParseResult,
    CsvParseError,
    GenericColumnMap,
} from './types';

const DEFAULT_COLUMN_MAP: GenericColumnMap = {
    type: 'type',
    timestamp: 'timestamp',
    receivedAsset: 'received asset',
    receivedAmount: 'received amount',
    receivedValueUsd: 'received value usd',
    sentAsset: 'sent asset',
    sentAmount: 'sent amount',
    sentValueUsd: 'sent value usd',
    feeAsset: 'fee asset',
    feeAmount: 'fee amount',
    feeValueUsd: 'fee value usd',
    notes: 'notes',
};

const VALID_TYPES = new Set([
    'BUY', 'SELL', 'TRADE', 'TRANSFER_IN', 'TRANSFER_OUT',
    'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST',
    'GIFT_RECEIVED', 'GIFT_SENT', 'UNKNOWN',
]);

function normalizeType(raw: string): ParsedTransaction['type'] {
    const upper = raw.toUpperCase().trim().replace(/[\s-]+/g, '_');
    if (VALID_TYPES.has(upper)) return upper as ParsedTransaction['type'];

    // Common aliases
    const aliases: Record<string, ParsedTransaction['type']> = {
        'PURCHASE': 'BUY', 'BOUGHT': 'BUY',
        'SALE': 'SELL', 'SOLD': 'SELL',
        'SWAP': 'TRADE', 'EXCHANGE': 'TRADE', 'CONVERT': 'TRADE',
        'DEPOSIT': 'TRANSFER_IN', 'RECEIVE': 'TRANSFER_IN', 'RECEIVED': 'TRANSFER_IN',
        'WITHDRAWAL': 'TRANSFER_OUT', 'WITHDRAW': 'TRANSFER_OUT', 'SEND': 'TRANSFER_OUT', 'SENT': 'TRANSFER_OUT',
        'REWARD': 'STAKING_REWARD', 'STAKE': 'STAKING_REWARD',
        'MINING': 'MINING_REWARD', 'MINE': 'MINING_REWARD',
        'GIFT': 'GIFT_RECEIVED',
    };

    return aliases[upper] || 'UNKNOWN';
}

/**
 * Parse a generic CSV string with configurable column mapping.
 */
export function parseGenericCsv(
    csv: string,
    columnMap: Partial<GenericColumnMap> = {}
): CsvParseResult {
    const map = { ...DEFAULT_COLUMN_MAP, ...columnMap };
    const objects = parseCsvToObjects(csv);
    const transactions: ParsedTransaction[] = [];
    const errors: CsvParseError[] = [];

    for (let i = 0; i < objects.length; i++) {
        const row = objects[i];
        const rowNum = i + 2; // 1-indexed + header row

        try {
            // Timestamp is required
            const tsRaw = row[map.timestamp];
            if (!tsRaw) {
                errors.push({ row: rowNum, message: `Missing timestamp (column: "${map.timestamp}")` });
                continue;
            }

            const timestamp = safeParseDateToIso(tsRaw);
            if (!timestamp) {
                errors.push({ row: rowNum, message: `Invalid date: "${tsRaw}"` });
                continue;
            }

            const type = map.type ? normalizeType(row[map.type] || 'UNKNOWN') : 'UNKNOWN';

            const tx: ParsedTransaction = {
                type,
                timestamp,
                receivedAsset: map.receivedAsset ? row[map.receivedAsset] || undefined : undefined,
                receivedAmount: map.receivedAmount ? safeParseNumber(row[map.receivedAmount]) : undefined,
                receivedValueUsd: map.receivedValueUsd ? safeParseNumber(row[map.receivedValueUsd]) : undefined,
                sentAsset: map.sentAsset ? row[map.sentAsset] || undefined : undefined,
                sentAmount: map.sentAmount ? safeParseNumber(row[map.sentAmount]) : undefined,
                sentValueUsd: map.sentValueUsd ? safeParseNumber(row[map.sentValueUsd]) : undefined,
                feeAsset: map.feeAsset ? row[map.feeAsset] || undefined : undefined,
                feeAmount: map.feeAmount ? safeParseNumber(row[map.feeAmount]) : undefined,
                feeValueUsd: map.feeValueUsd ? safeParseNumber(row[map.feeValueUsd]) : undefined,
                notes: map.notes ? row[map.notes] || undefined : undefined,
            };

            // Must have at least one asset
            if (!tx.receivedAsset && !tx.sentAsset) {
                errors.push({ row: rowNum, message: 'No asset found (need received or sent asset)' });
                continue;
            }

            transactions.push(tx);
        } catch (e) {
            errors.push({
                row: rowNum,
                message: e instanceof Error ? e.message : 'Unknown parse error',
            });
        }
    }

    return {
        transactions,
        errors,
        summary: {
            totalRows: objects.length,
            parsed: transactions.length,
            failed: errors.length,
            format: 'generic',
        },
    };
}
