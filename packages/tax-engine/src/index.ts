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

// Reports
export { generateForm8949, form8949ToCsv } from './reports/form8949';
export { generateScheduleD } from './reports/schedule-d';
export type { ScheduleDLine, ScheduleDReport } from './reports/schedule-d';
export type {
  Form8949Line,
  Form8949Box,
  Form8949BoxSummary,
  Form8949Report,
  Form8949Options,
  LotDateMap,
} from './reports/form8949';

// Reconciliation
export { parse1099DA, reconcile } from './reconciliation';
export type {
  Form1099DAEntry,
  Parse1099DAResult,
  DtaxDisposition,
  MatchStatus,
  ReconciliationItem,
  ReconciliationReport,
  ReconcileOptions,
} from './reconciliation';

// Portfolio Analysis
export { analyzeHoldings } from './portfolio';
export type {
    PriceMap,
    LotHolding,
    AssetPosition,
    TlhOpportunity,
    PortfolioAnalysis,
} from './portfolio';

export { matchInternalTransfers } from './normalizers/internal-transfer';
export type {
  TransferRecord,
  InternalTransferMatch,
  MatchResult,
} from './normalizers/internal-transfer';

// Wash Sale Detection
export { detectWashSales } from './wash-sale';
export type {
    WashSaleAdjustment,
    WashSaleResult,
    AcquisitionRecord,
} from './wash-sale';

export { isWrapPair, getUnderlyingAsset, processWrapUnwrap } from './normalizers/wrap-unwrap';
export type {
  WrapEvent,
  WrapResult,
} from './normalizers/wrap-unwrap';
