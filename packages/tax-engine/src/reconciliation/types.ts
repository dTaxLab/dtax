/**
 * Types for 1099-DA reconciliation.
 *
 * IRS Form 1099-DA fields (digital assets):
 *   Box 1a: Description of digital asset
 *   Box 1d: Date of sale or disposition
 *   Box 2:  Gross proceeds
 *   Box 3:  Cost or other basis (required starting 2027)
 *   Box 4:  Gain or loss
 *
 * @license AGPL-3.0
 */

/** A single entry from a 1099-DA report */
export interface Form1099DAEntry {
  /** Row index for traceability */
  rowIndex: number;
  /** Asset description (e.g., "Bitcoin", "BTC") */
  asset: string;
  /** Date of sale/disposition */
  dateSold: Date;
  /** Date acquired (may be empty on early 1099-DAs) */
  dateAcquired?: Date;
  /** Gross proceeds reported by broker */
  grossProceeds: number;
  /** Cost basis reported by broker (may be 0 or absent before 2027) */
  costBasis?: number;
  /** Gain/loss reported by broker (may be absent) */
  gainLoss?: number;
  /** Transaction ID from broker */
  transactionId?: string;
  /** Broker/exchange name */
  brokerName?: string;
}

/** Result of parsing a 1099-DA file */
export interface Parse1099DAResult {
  entries: Form1099DAEntry[];
  errors: { row: number; message: string }[];
  brokerName: string;
  taxYear: number;
}

/** Disposition from DTax's own calculations (Form 8949 line) */
export interface DtaxDisposition {
  eventId: string;
  asset: string;
  dateSold: Date;
  proceeds: number;
  costBasis: number;
  gainLoss: number;
}

/** Match status between 1099-DA entry and DTax disposition */
export type MatchStatus =
  | "matched" // Found matching entry, amounts agree
  | "proceeds_mismatch" // Same tx found, proceeds differ
  | "basis_mismatch" // Same tx found, cost basis differs
  | "both_mismatch" // Both proceeds and basis differ
  | "missing_in_dtax" // On 1099-DA but not in DTax
  | "missing_in_1099da" // In DTax but not on 1099-DA
  | "internal_transfer_misclassified"; // Exchange reported as sale, DTax classified as internal transfer

/** A single reconciliation result */
export interface ReconciliationItem {
  status: MatchStatus;
  /** 1099-DA entry (null if missing_in_1099da) */
  brokerEntry: Form1099DAEntry | null;
  /** DTax disposition (null if missing_in_dtax) */
  dtaxEntry: DtaxDisposition | null;
  /** Difference in proceeds (broker - dtax) */
  proceedsDiff: number;
  /** Difference in cost basis (broker - dtax) */
  costBasisDiff: number;
  /** Difference in gain/loss */
  gainLossDiff: number;
  /** Suggested action for rebuttal */
  rebuttalSuggestion?: string;
}

/** Complete reconciliation report */
export interface ReconciliationReport {
  taxYear: number;
  brokerName: string;
  summary: {
    totalBrokerEntries: number;
    totalDtaxDispositions: number;
    matched: number;
    proceedsMismatch: number;
    basisMismatch: number;
    bothMismatch: number;
    missingInDtax: number;
    missingIn1099da: number;
    internalTransferMisclassified: number;
    /** Net difference in proceeds (broker - dtax) */
    netProceedsDiff: number;
    /** Net difference in gain/loss */
    netGainLossDiff: number;
  };
  items: ReconciliationItem[];
}
