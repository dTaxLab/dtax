/**
 * API client for DTax backend.
 */

import { getStoredToken } from "./auth-context";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Structured API error with optional error code and metadata. */
export class ApiError extends Error {
  code?: string;
  limit?: number;
  current?: number;

  constructor(
    message: string,
    code?: string,
    limit?: number,
    current?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.limit = limit;
    this.current = current;
  }
}

function throwApiError(errorBody: Record<string, unknown>): never {
  const err = errorBody.error as
    | {
        message?: string;
        code?: string;
        limit?: number;
        current?: number;
      }
    | undefined;
  throw new ApiError(
    err?.message || "Unknown API error",
    err?.code,
    err?.limit,
    err?.current,
  );
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const authHeaders: Record<string, string> = {};
  if (token) authHeaders["Authorization"] = `Bearer ${token}`;

  // Auto-inject clientId for CPA proxy access
  let url = `${API_BASE}${path}`;
  if (typeof window !== "undefined") {
    const clientId = localStorage.getItem("dtax_active_client");
    if (clientId) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}clientId=${clientId}`;
    }
  }

  const res = await fetch(url, {
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
    throwApiError(error);
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
  aiClassified?: boolean;
  aiConfidence?: number;
  originalType?: string;
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
    throwApiError(error);
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

export function getForm8949TxfUrl(
  year: number,
  method = "FIFO",
  includeWashSales = false,
) {
  const ws = includeWashSales ? "&includeWashSales=true" : "";
  return `${API_BASE}/api/v1/tax/form8949?year=${year}&method=${method}&format=txf${ws}`;
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

// ─── Tax Impact Simulator ────────────────────────

export interface SimulatedLot {
  lotId: string;
  amount: number;
  costBasis: number;
  acquiredAt: string;
  holdingPeriod: "SHORT_TERM" | "LONG_TERM";
  gainLoss: number;
}

export interface SimulationResult {
  projectedGainLoss: number;
  holdingPeriod: "SHORT_TERM" | "LONG_TERM" | "MIXED";
  shortTermGainLoss: number;
  longTermGainLoss: number;
  proceeds: number;
  costBasis: number;
  matchedLots: SimulatedLot[];
  washSaleRisk: boolean;
  washSaleDisallowed: number;
  remainingPosition: {
    totalAmount: number;
    totalCostBasis: number;
    avgCostPerUnit: number;
  };
  insufficientLots: boolean;
  availableAmount: number;
}

export async function simulateSale(params: {
  asset: string;
  amount: number;
  pricePerUnit: number;
  method?: string;
  strictSilo?: boolean;
}): Promise<SimulationResult> {
  const res = await apiFetch<{ data: SimulationResult }>(
    "/api/v1/tax/simulate",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
  return res.data;
}

// ─── Method Comparison ──────────────────────────

export interface ComparisonResult {
  fifo: SimulationResult;
  lifo: SimulationResult;
  hifo: SimulationResult;
  recommended: "FIFO" | "LIFO" | "HIFO";
  recommendedReason: string;
  savings: number;
}

export async function compareAllMethods(params: {
  asset: string;
  amount: number;
  pricePerUnit: number;
}): Promise<ComparisonResult> {
  const res = await apiFetch<{ data: ComparisonResult }>(
    "/api/v1/tax/compare-methods",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
  return res.data;
}

// ─── AI Classification ───────────────────────────

export interface AiClassifyResult {
  id: string;
  originalType: string;
  newType: string;
  confidence: number;
}

export async function aiClassifyByIds(ids: string[]) {
  return apiFetch<{
    data: {
      processed: number;
      classified: number;
      results: AiClassifyResult[];
    };
  }>("/api/v1/transactions/ai-classify", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export async function aiClassifyAll() {
  return apiFetch<{
    data: { processed: number; classified: number; remaining?: string };
  }>("/api/v1/transactions/ai-classify-all", {
    method: "POST",
  });
}

export async function getAiStats() {
  return apiFetch<{
    data: {
      total: number;
      aiClassified: number;
      unknownCount: number;
      aiEnabled: boolean;
    };
  }>("/api/v1/transactions/ai-stats");
}

export async function confirmAiClassification(id: string) {
  return apiFetch<{ data: { success: boolean } }>(
    `/api/v1/transactions/${id}`,
    {
      method: "PUT",
      body: JSON.stringify({ aiConfidence: 1.0 }),
    },
  );
}

export async function correctClassification(id: string, type: string) {
  return apiFetch<{ data: { success: boolean } }>(
    `/api/v1/transactions/${id}`,
    {
      method: "PUT",
      body: JSON.stringify({ type, aiClassified: false, aiConfidence: null }),
    },
  );
}

// ─── Risk Scan ───────────────────────────────────

export interface RiskItem {
  category: string;
  severity: "high" | "medium" | "low";
  description: string;
  affectedTransactionIds: string[];
  suggestedAction: string;
  potentialTaxImpact: number;
}

export interface RiskReport {
  taxYear: number;
  generatedAt: string;
  overallScore: number;
  items: RiskItem[];
  summary: {
    high: number;
    medium: number;
    low: number;
    totalPotentialImpact: number;
  };
}

export async function runRiskScan(year: number) {
  return apiFetch<{ data: RiskReport }>("/api/v1/tax/risk-scan", {
    method: "POST",
    body: JSON.stringify({ year }),
  });
}

// ─── Chat ─────────────────────────────────────────

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }> | null;
  createdAt: string;
}

export async function createConversation(title?: string) {
  return apiFetch<{ data: ChatConversation }>("/api/v1/chat/conversations", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function listConversations(page = 1, limit = 20) {
  return apiFetch<{
    data: ChatConversation[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }>(`/api/v1/chat/conversations?page=${page}&limit=${limit}`);
}

export async function getConversation(id: string) {
  return apiFetch<{
    data: {
      id: string;
      title: string;
      messages: ChatMessageData[];
    };
  }>(`/api/v1/chat/conversations/${id}`);
}

export async function deleteConversation(id: string) {
  return apiFetch<{ data: { deleted: boolean } }>(
    `/api/v1/chat/conversations/${id}`,
    { method: "DELETE" },
  );
}

export async function sendChatMessage(conversationId: string, content: string) {
  return apiFetch<{
    data: {
      userMessage: ChatMessageData;
      assistantMessage: ChatMessageData;
    };
  }>(`/api/v1/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export interface StreamCallbacks {
  onUserMessageId?: (id: string) => void;
  onText?: (chunk: string) => void;
  onToolStart?: (name: string) => void;
  onToolEnd?: (name: string) => void;
  onDone?: (
    content: string,
    toolCalls: Array<{ name: string; input: Record<string, unknown> }>,
  ) => void;
  onSaved?: (assistantMessageId: string) => void;
  onError?: (message: string) => void;
}

/**
 * Send a chat message via SSE streaming.
 * Parses Server-Sent Events from the response stream and invokes callbacks.
 */
// ── Account (GDPR) ──

export async function exportAccountData(): Promise<Blob> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}/api/v1/account/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: { message: res.statusText } }));
    throwApiError(error);
  }
  const json = await res.json();
  const blob = new Blob([JSON.stringify(json.data, null, 2)], {
    type: "application/json",
  });
  return blob;
}

export async function requestAccountDeletion(
  password: string,
  reason?: string,
) {
  return apiFetch<{ deletionScheduledAt: string }>("/api/v1/account/delete", {
    method: "POST",
    body: JSON.stringify({ password, reason }),
  });
}

export async function cancelAccountDeletion() {
  return apiFetch<{ cancelled: boolean }>("/api/v1/account/cancel-deletion", {
    method: "POST",
  });
}

// ── Two-Factor Authentication ──

export async function setup2FA() {
  return apiFetch<{ qrCodeUrl: string; secret: string }>(
    "/api/v1/auth/2fa/setup",
    { method: "POST" },
  );
}

export async function verify2FA(token: string) {
  return apiFetch<{ enabled: boolean; recoveryCodes: string[] }>(
    "/api/v1/auth/2fa/verify",
    {
      method: "POST",
      body: JSON.stringify({ token }),
    },
  );
}

export async function disable2FA(token: string) {
  return apiFetch<{ disabled: boolean }>("/api/v1/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function get2FAStatus() {
  return apiFetch<{ enabled: boolean }>("/api/v1/auth/2fa/status");
}

export async function loginWith2FA(
  tempToken: string,
  totpToken?: string,
  recoveryCode?: string,
) {
  const res = await fetch(`${API_BASE}/api/v1/auth/login/2fa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tempToken, totpToken, recoveryCode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(
      (err as Record<string, Record<string, string>>)?.error?.message ||
        "2FA verification failed",
      undefined,
    );
  }
  const json = await res.json();
  return (
    json as {
      data: {
        token: string;
        user: { id: string; email: string; name: string | null; role: string };
      };
    }
  ).data;
}

// ── Client Management (CPA) ──

export async function inviteClient(email: string, name?: string) {
  return apiFetch<{ id: string; inviteToken: string; status: string }>(
    "/clients/invite",
    { method: "POST", body: JSON.stringify({ email, name }) },
  );
}

export async function listClients() {
  return apiFetch<
    Array<{
      id: string;
      email: string;
      name: string | null;
      status: string;
      userId: string | null;
      createdAt: string;
    }>
  >("/clients");
}

export async function getClient(clientId: string) {
  return apiFetch<{
    id: string;
    email: string;
    name: string | null;
    status: string;
    notes: string | null;
  }>(`/clients/${clientId}`);
}

export async function revokeClient(clientId: string) {
  return apiFetch<{ success: boolean }>(`/clients/${clientId}`, {
    method: "DELETE",
  });
}

export async function updateClientNotes(clientId: string, notes: string) {
  return apiFetch<{ success: boolean }>(`/clients/${clientId}`, {
    method: "PUT",
    body: JSON.stringify({ notes }),
  });
}

export async function acceptClientInvite(inviteToken: string) {
  return apiFetch<{ status: string }>("/clients/accept", {
    method: "POST",
    body: JSON.stringify({ inviteToken }),
  });
}

export interface BatchReportItem {
  clientId: string;
  clientName?: string | null;
  clientEmail?: string;
  netGainLoss?: number;
  shortTermGL?: number;
  longTermGL?: number;
  transactionCount?: number;
  totalIncome?: number;
  error?: string;
}

export async function batchReport(
  clientIds: string[],
  taxYear: number,
  method: string,
) {
  return apiFetch<{ data: BatchReportItem[] }>("/clients/batch-report", {
    method: "POST",
    body: JSON.stringify({ clientIds, taxYear, method }),
  });
}

// ── Audit Log ──

export async function getAuditLogs(params?: {
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.action) searchParams.set("action", params.action);
  if (params?.entityType) searchParams.set("entityType", params.entityType);
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const qs = searchParams.toString();
  return apiFetch<{
    data: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      details: Record<string, unknown> | null;
      ipAddress: string | null;
      createdAt: string;
    }>;
    total: number;
  }>(`/api/v1/audit${qs ? `?${qs}` : ""}`);
}

// ── Report History ──

export async function getReportHistory(params?: {
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return apiFetch<{
    data: Array<{
      id: string;
      taxYear: number;
      method: string;
      fileType: string | null;
      fileName: string | null;
      fileSize: number | null;
      generatedAt: string | null;
      status: string;
      shortTermGains: string;
      shortTermLosses: string;
      longTermGains: string;
      longTermLosses: string;
      createdAt: string;
    }>;
    total: number;
  }>(`/api/v1/tax/reports${qs ? `?${qs}` : ""}`);
}

export function getReportDownloadUrl(reportId: string): string {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("dtax_token") : null;
  return `${API_BASE}/api/v1/tax/reports/${reportId}/download${token ? `?token=${token}` : ""}`;
}

export async function deleteReportById(reportId: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/tax/reports/${reportId}`, {
    method: "DELETE",
  });
}

// ── Notifications ──

export async function getNotifications(limit = 20) {
  return apiFetch<{
    data: Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      data: Record<string, unknown> | null;
      readAt: string | null;
      createdAt: string;
    }>;
    unreadCount: number;
  }>(`/api/v1/notifications?limit=${limit}`);
}

export async function markNotificationRead(id: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/notifications/${id}/read`, {
    method: "POST",
  });
}

export async function markAllNotificationsRead() {
  return apiFetch<{ success: boolean }>("/api/v1/notifications/read-all", {
    method: "POST",
  });
}

export async function deleteNotificationById(id: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/notifications/${id}`, {
    method: "DELETE",
  });
}

// ── Wallets ──

export async function connectWallet(
  address: string,
  chain: string,
  label?: string,
) {
  return apiFetch<{ dataSourceId: string; address: string; chain: string }>(
    "/api/v1/wallets/connect",
    {
      method: "POST",
      body: JSON.stringify({ address, chain, label }),
    },
  );
}

export async function listWallets() {
  return apiFetch<
    Array<{
      id: string;
      name: string;
      address: string;
      chain: string;
      status: string;
      lastSyncAt: string | null;
      createdAt: string;
    }>
  >("/api/v1/wallets");
}

export async function syncWallet(id: string) {
  return apiFetch<{ status: string }>(`/api/v1/wallets/${id}/sync`, {
    method: "POST",
  });
}

export async function disconnectWallet(id: string) {
  return apiFetch<{ deleted: boolean }>(`/api/v1/wallets/${id}`, {
    method: "DELETE",
  });
}

export async function sendChatMessageStream(
  conversationId: string,
  content: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(
    `${API_BASE}/api/v1/chat/conversations/${conversationId}/messages/stream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ content }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const err = (errorBody as Record<string, unknown>).error as
      | {
          message?: string;
          code?: string;
        }
      | undefined;
    throw new ApiError(err?.message || `HTTP ${response.status}`, err?.code);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete last line in buffer

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          switch (currentEvent) {
            case "user_message":
              callbacks.onUserMessageId?.(parsed.id);
              break;
            case "text":
              callbacks.onText?.(parsed.chunk);
              break;
            case "tool_start":
              callbacks.onToolStart?.(parsed.name);
              break;
            case "tool_end":
              callbacks.onToolEnd?.(parsed.name);
              break;
            case "done":
              callbacks.onDone?.(parsed.content, parsed.toolCalls);
              break;
            case "saved":
              callbacks.onSaved?.(parsed.assistantMessageId);
              break;
            case "error":
              callbacks.onError?.(parsed.message);
              break;
          }
        } catch {
          // Skip malformed JSON
        }
        currentEvent = "";
      }
    }
  }
}
