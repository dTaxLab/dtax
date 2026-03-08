/**
 * CSV Parser — Unified Entry Point
 *
 * Auto-detects exchange format and parses accordingly.
 * Supported: Coinbase, Binance (International + US), Generic
 *
 * @license AGPL-3.0
 */

import { parseGenericCsv } from './generic';
import { parseCoinbaseCsv, isCoinbaseCsv } from './coinbase';
import { parseBinanceCsv, parseBinanceUsCsv, isBinanceCsv, isBinanceUsCsv } from './binance';
import { isEtherscanCsv, isEtherscanErc20Csv } from './etherscan';
import type { CsvParseResult, CsvFormat, GenericColumnMap } from './types';

/**
 * Detect the CSV format based on header contents.
 */
export function detectCsvFormat(csv: string): CsvFormat {
    if (isCoinbaseCsv(csv)) return 'coinbase';
    if (isBinanceCsv(csv)) return 'binance';
    if (isBinanceUsCsv(csv)) return 'binance_us';
    if (isEtherscanErc20Csv(csv)) return 'etherscan_erc20';
    if (isEtherscanCsv(csv)) return 'etherscan';
    return 'generic';
}

/**
 * Parse a CSV string, auto-detecting the format.
 *
 * @param csv - Raw CSV string
 * @param options - Optional format override or column mapping
 * @returns CsvParseResult with parsed transactions and errors
 *
 * @example
 * ```typescript
 * import { parseCsv } from '@dtax/tax-engine';
 *
 * // Auto-detect format
 * const result = parseCsv(csvString);
 * console.log(`Parsed ${result.summary.parsed} transactions`);
 *
 * // Force generic format with custom columns
 * const result2 = parseCsv(csvString, {
 *   format: 'generic',
 *   columnMap: { timestamp: 'Date', sentAsset: 'Currency' }
 * });
 * ```
 */
export function parseCsv(
    csv: string,
    options?: {
        format?: CsvFormat;
        columnMap?: Partial<GenericColumnMap>;
    }
): CsvParseResult {
    const format = options?.format ?? detectCsvFormat(csv);

    switch (format) {
        case 'coinbase':
            return parseCoinbaseCsv(csv);
        case 'binance':
            return parseBinanceCsv(csv);
        case 'binance_us':
            return parseBinanceUsCsv(csv);
        case 'generic':
        default:
            return parseGenericCsv(csv, options?.columnMap);
    }
}

// Re-export everything
export { parseGenericCsv } from './generic';
export { parseCoinbaseCsv, isCoinbaseCsv } from './coinbase';
export { parseBinanceCsv, parseBinanceUsCsv, isBinanceCsv, isBinanceUsCsv } from './binance';
export { parseEtherscanCsv, parseEtherscanErc20Csv, isEtherscanCsv, isEtherscanErc20Csv } from './etherscan';
export { parseCsvRows, parseCsvToObjects } from './csv-core';
export type {
    CsvFormat,
    CsvParseResult,
    CsvParseError,
    ParsedTransaction,
    GenericColumnMap,
} from './types';
