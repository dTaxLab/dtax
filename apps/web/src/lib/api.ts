/**
 * API client for DTax backend.
 */

import { getStoredToken } from "./auth-context";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const authHeaders: Record<string, string> = {};
  if (token) authHeaders["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || `API Error: ${res.status}`);
  }
  return res.json();
}

// ─── Types ──────────────────────────────────────

export interface Transaction {
  id: string;
  type: string;
  timestamp: string;
  sentAsset: string | null;
  sentAmount: string | null;
  sentValueUsd: string | null;
  receivedAsset: string | null;
  receivedAmount: string | null;
  receivedValueUsd: string | null;
  feeValueUsd: string | null;
  notes: string | null;
  gainLoss: string | null;
  holdingPeriod: string | null;
}

export interface TaxSummary {
  taxYear: number;
  method: string;
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  netGainLoss: number;
  totalTransactions: number;
  totalIncome?: number;
  income?: {
    staking: number;
    mining: number;
    airdrops: number;
    interest: number;
    total: number;
  };
  status: string;
}

// ─── API Methods ────────────────────────────────

export async function getHealth() {
  return apiFetch<{ status: string; timestamp: string }>("/api/health/deep");
}

export interface TransactionFilters {
  asset?: string;
  type?: string;
  from?: string;
  to?: string;
  search?: string;
}

export type SortField =
  | "timestamp"
  | "type"
  | "sentAmount"
  | "receivedAmount"
  | "sentValueUsd"
  | "receivedValueUsd"
  | "feeValueUsd";
export type SortOrder = "asc" | "desc";

export async function getTransactions(
  page = 1,
  limit = 20,
  filters?: TransactionFilters,
  sort?: SortField,
  order?: SortOrder,
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (filters?.asset) params.set("asset", filters.asset);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.search) params.set("search", filters.search);
  if (sort) params.set("sort", sort);
  if (order) params.set("order", order);
  return apiFetch<{
    data: Transaction[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }>(`/api/v1/transactions?${params.toString()}`);
}

export async function calculateTax(taxYear: number, method = "FIFO") {
  return apiFetch<{ data: { report: TaxSummary } }>("/api/v1/tax/calculate", {
    method: "POST",
    body: JSON.stringify({ taxYear, method }),
  });
}

export async function getTaxSummary(year: number, method = "FIFO") {
  return apiFetch<{ data: TaxSummary }>(
    `/api/v1/tax/summary?year=${year}&method=${method}`,
  );
}

export async function createTransaction(tx: Record<string, unknown>) {
  return apiFetch<{ data: Transaction }>("/api/v1/transactions", {
    method: "POST",
    body: JSON.stringify(tx),
  });
}

export function getTransactionExportUrl() {
  return `${API_BASE}/api/v1/transactions/export`;
}

export async function updateTransaction(
  id: string,
  data: Record<string, unknown>,
) {
  return apiFetch<{ data: Transaction }>(`/api/v1/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTransaction(id: string) {
  return apiFetch<void>(`/api/v1/transactions/${id}`, { method: "DELETE" });
}

export async function bulkDeleteTransactions(
  ids: string[],
): Promise<{ data: { deleted: number } }> {
  return apiFetch("/api/v1/transactions/bulk", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

export interface ImportResult {
  imported: number;
  skipped?: number;
  errors: { row: number; message: string }[];
  summary: {
    totalRows: number;
    parsed: number;
    failed: number;
    format: string;
  };
}

export async function importCsv(
  file: File,
  format?: string,
  source?: string,
  userAddress?: string,
  nativeAsset?: string,
): Promise<{ data: ImportResult }> {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  if (format) params.set("format", format);
  if (source) params.set("source", source);
  if (userAddress) params.set("userAddress", userAddress);
  if (nativeAsset) params.set("nativeAsset", nativeAsset);
  const qs = params.toString();
  const url = qs
    ? `${API_BASE}/api/v1/transactions/import?${qs}`
    : `${API_BASE}/api/v1/transactions/import`;

  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || `Import failed: ${res.status}`);
  }

  return res.json();
}
export async function createConnection(data: {
  exchangeId: string;
  apiKey: string;
  apiSecret: string;
  apiPassword?: string;
}) {
  return apiFetch<{ data: { id: string; name: string; status: string } }>(
    "/api/v1/connections",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function getConnections() {
  return apiFetch<{
    data: {
      id: string;
      name: string;
      status: string;
      lastSyncAt: string | null;
      createdAt: string;
    }[];
  }>("/api/v1/connections");
}

export async function syncConnection(id: string) {
  return apiFetch<{ data: { status: string; message: string } }>(
    `/api/v1/connections/${id}/sync`,
    {
      method: "POST",
    },
  );
}

// ─── Data Sources ───────────────────────────────

export interface DataSource {
  id: string;
  name: string;
  type: string;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
  transactionCount: number;
}

export async function getDataSources(): Promise<{ data: DataSource[] }> {
  return apiFetch("/api/v1/data-sources");
}

export async function renameDataSource(id: string, name: string) {
  return apiFetch<{ data: { id: string; name: string } }>(
    `/api/v1/data-sources/${id}`,
    {
      method: "PUT",
      body: JSON.stringify({ name }),
    },
  );
}

export async function deleteDataSource(id: string) {
  return apiFetch<void>(`/api/v1/data-sources/${id}`, { method: "DELETE" });
}

// ─── Form 8949 ─────────────────────────────────

export interface Form8949Line {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: number;
  costBasis: number;
  adjustmentCode: string;
  adjustmentAmount: number;
  gainLoss: number;
  box: string;
  holdingPeriod: string;
  eventId: string;
}

export interface Form8949Report {
  taxYear: number;
  lines: Form8949Line[];
  boxSummaries: {
    box: string;
    totalProceeds: number;
    totalCostBasis: number;
    totalAdjustments: number;
    totalGainLoss: number;
    lineCount: number;
  }[];
  totals: {
    shortTermGainLoss: number;
    longTermGainLoss: number;
    totalGainLoss: number;
    totalProceeds: number;
    totalCostBasis: number;
    lineCount: number;
  };
}

export async function getForm8949(
  year: number,
  method = "FIFO",
  includeWashSales = false,
) {
  const ws = includeWashSales ? "&includeWashSales=true" : "";
  return apiFetch<{
    data: Form8949Report & {
      washSaleSummary?: { totalDisallowed: number; adjustmentCount: number };
    };
  }>(`/api/v1/tax/form8949?year=${year}&method=${method}${ws}`);
}

export function getForm8949CsvUrl(
  year: number,
  method = "FIFO",
  includeWashSales = false,
) {
  const ws = includeWashSales ? "&includeWashSales=true" : "";
  return `${API_BASE}/api/v1/tax/form8949?year=${year}&method=${method}&format=csv${ws}`;
}

export function getForm8949PdfUrl(
  year: number,
  method = "FIFO",
  includeWashSales = false,
) {
  const ws = includeWashSales ? "&includeWashSales=true" : "";
  return `${API_BASE}/api/v1/tax/form8949?year=${year}&method=${method}&format=pdf${ws}`;
}

export async function downloadJsonBackup(): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/v1/transactions/export-json`, {
    headers,
  });
  if (!res.ok) throw new Error("Export failed");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dtax-backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Schedule D ─────────────────────────────────

export interface ScheduleDLine {
  lineNumber: string;
  description: string;
  proceeds: number;
  costBasis: number;
  adjustments: number;
  gainLoss: number;
}

export interface ScheduleDReport {
  taxYear: number;
  partI: ScheduleDLine[];
  partII: ScheduleDLine[];
  netShortTerm: number;
  netLongTerm: number;
  combinedNetGainLoss: number;
  capitalLossDeduction: number;
  carryoverLoss: number;
}

export async function getScheduleD(
  year: number,
  method = "FIFO",
  includeWashSales = false,
) {
  const ws = includeWashSales ? "&includeWashSales=true" : "";
  return apiFetch<{ data: ScheduleDReport }>(
    `/api/v1/tax/schedule-d?year=${year}&method=${method}${ws}`,
  );
}

// ─── 1099-DA Reconciliation ────────────────────

export interface ReconciliationItem {
  status: string;
  brokerEntry: {
    asset: string;
    dateSold: string;
    grossProceeds: number;
    costBasis?: number;
    gainLoss?: number;
  } | null;
  dtaxEntry: {
    eventId: string;
    asset: string;
    dateSold: string;
    proceeds: number;
    costBasis: number;
    gainLoss: number;
  } | null;
  proceedsDiff: number;
  costBasisDiff: number;
  gainLossDiff: number;
  rebuttalSuggestion?: string;
}

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
    netProceedsDiff: number;
    netGainLossDiff: number;
  };
  items: ReconciliationItem[];
  parseErrors: { row: number; message: string }[];
}

export async function reconcile1099DA(
  csvContent: string,
  brokerName: string,
  taxYear: number,
  method = "FIFO",
) {
  return apiFetch<{ data: ReconciliationReport }>("/api/v1/tax/reconcile", {
    method: "POST",
    body: JSON.stringify({ csvContent, brokerName, taxYear, method }),
  });
}

// ─── Prices ────────────────────────────────────

export interface PriceResult {
  prices: Record<string, number>;
  fetchedAt: string;
}

export async function getPrices(assets: string[]) {
  return apiFetch<{ data: PriceResult }>(
    `/api/v1/prices?assets=${encodeURIComponent(assets.join(","))}`,
  );
}

export async function getSupportedTickers() {
  return apiFetch<{ data: { tickers: string[] } }>("/api/v1/prices/supported");
}

export interface BackfillResult {
  message: string;
  updated: number;
  skipped: number;
  total: number;
  errors?: string[];
}

export async function backfillPrices(limit = 50, dryRun = false) {
  return apiFetch<{ data: BackfillResult }>("/api/v1/prices/backfill", {
    method: "POST",
    body: JSON.stringify({ limit, dryRun }),
  });
}

export interface ExchangeRates {
  rates: Record<string, number>;
  baseCurrency: string;
}

export async function getExchangeRates() {
  return apiFetch<{ data: ExchangeRates }>("/api/v1/prices/exchange-rates");
}

// ─── Portfolio Holdings ────────────────────────

export interface LotHolding {
  lotId: string;
  asset: string;
  amount: number;
  costBasisUsd: number;
  costPerUnit: number;
  acquiredAt: string;
  sourceId: string;
  isLongTerm: boolean;
  unrealizedGainLoss?: number;
  currentValueUsd?: number;
}

export interface AssetPosition {
  asset: string;
  totalAmount: number;
  totalCostBasis: number;
  avgCostPerUnit: number;
  currentPrice?: number;
  currentValueUsd?: number;
  unrealizedGainLoss?: number;
  unrealizedPct?: number;
  lotCount: number;
  earliestAcquired: string;
  latestAcquired: string;
  lots: LotHolding[];
}

export interface TlhOpportunity {
  asset: string;
  unrealizedLoss: number;
  loseLots: LotHolding[];
  totalAmount: number;
  totalCostBasis: number;
  currentValue: number;
  hasShortTermLots: boolean;
}

export interface PortfolioAnalysis {
  positions: AssetPosition[];
  totalCostBasis: number;
  totalCurrentValue?: number;
  totalUnrealizedGainLoss?: number;
  tlhOpportunities: TlhOpportunity[];
  totalTlhAvailable: number;
  asOfDate: string;
}

export async function getPortfolioHoldings(prices?: Record<string, number>) {
  const params = prices
    ? `?prices=${encodeURIComponent(JSON.stringify(prices))}`
    : "";
  return apiFetch<{ data: PortfolioAnalysis }>(
    `/api/v1/portfolio/holdings${params}`,
  );
}

// ─── Transfer Matching ─────────────────────────

export interface TransferMatch {
  outTx: {
    id: string;
    sourceId: string;
    asset: string;
    amount: number;
    timestamp: string;
  };
  inTx: {
    id: string;
    sourceId: string;
    asset: string;
    amount: number;
    timestamp: string;
  };
  amountDiff: number;
  timeDiffMs: number;
}

export interface TransferMatchesResult {
  matches: TransferMatch[];
  unmatchedOut: number;
  unmatchedIn: number;
}

export async function getTransferMatches() {
  return apiFetch<{ data: TransferMatchesResult }>("/api/v1/transfers/matches");
}

export async function confirmTransfer(outTxId: string, inTxId: string) {
  return apiFetch<{
    data: { status: string; outTxId: string; inTxId: string };
  }>("/api/v1/transfers/confirm", {
    method: "POST",
    body: JSON.stringify({ outTxId, inTxId }),
  });
}

export async function dismissTransfer(outTxId: string, inTxId: string) {
  return apiFetch<{ data: { status: string } }>("/api/v1/transfers/dismiss", {
    method: "POST",
    body: JSON.stringify({ outTxId, inTxId }),
  });
}

// ─── Specific ID Lot Selection ─────────────────

export interface AvailableLot {
  id: string;
  asset: string;
  amount: number;
  costBasisUsd: number;
  acquiredAt: string;
  sourceId: string;
}

export interface LotSelection {
  lotId: string;
  amount: number;
}

export interface SpecificIdSelection {
  eventId: string;
  lots: LotSelection[];
}

export async function getAvailableLots(year: number, asset?: string) {
  const params = new URLSearchParams({ year: String(year) });
  if (asset) params.set("asset", asset);
  return apiFetch<{ data: { lots: AvailableLot[] } }>(
    `/api/v1/tax/available-lots?${params.toString()}`,
  );
}

export async function calculateSpecific(
  taxYear: number,
  selections: SpecificIdSelection[],
  strictSilo = false,
) {
  return apiFetch<{
    data: {
      results: Array<{
        event: {
          id: string;
          asset: string;
          amount: number;
          date: string;
          proceedsUsd: number;
        };
        matchedLots: Array<{
          lotId: string;
          amount: number;
          costBasisUsd: number;
        }>;
        gainLoss: number;
        holdingPeriod: "SHORT_TERM" | "LONG_TERM";
      }>;
      method: string;
      taxYear: number;
    };
  }>("/api/v1/tax/calculate-specific", {
    method: "POST",
    body: JSON.stringify({ taxYear, selections, strictSilo }),
  });
}
