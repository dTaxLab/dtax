/**
 * @dtax/tax-engine
 *
 * Open source crypto tax calculation engine.
 * Supports FIFO, LIFO, HIFO cost basis methods.
 * Includes CSV parsers for Coinbase and generic formats.
 *
 * @license AGPL-3.0
 */

export { calculateFIFO } from './methods/fifo';
export { calculateLIFO } from './methods/lifo';
export { calculateHIFO } from './methods/hifo';
export { CostBasisCalculator } from './calculator';
export type {
  TaxLot,
  TaxableEvent,
  CalculationResult,
  CostBasisMethod,
} from './types';

// CSV Parsers
export {
  parseCsv,
  parseGenericCsv,
  parseCoinbaseCsv,
  isCoinbaseCsv,
  parseBinanceCsv,
  parseBinanceUsCsv,
  isBinanceCsv,
  isBinanceUsCsv,
  detectCsvFormat,
  parseCsvRows,
  parseCsvToObjects,
} from './parsers';
export type {
  CsvFormat,
  CsvParseResult,
  CsvParseError,
  ParsedTransaction,
  GenericColumnMap,
} from './parsers';

export { matchInternalTransfers } from './normalizers/internal-transfer';
export type {
  TransferRecord,
  InternalTransferMatch,
  MatchResult,
} from './normalizers/internal-transfer';
