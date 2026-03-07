/**
 * API client for DTax backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
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
    status: string;
}

// ─── API Methods ────────────────────────────────

export async function getHealth() {
    return apiFetch<{ status: string; timestamp: string }>('/api/health/deep');
}

export async function getTransactions(page = 1, limit = 20) {
    return apiFetch<{
        data: Transaction[];
        meta: { total: number; page: number; limit: number; totalPages: number };
    }>(`/api/v1/transactions?page=${page}&limit=${limit}`);
}

export async function calculateTax(taxYear: number, method = 'FIFO') {
    return apiFetch<{ data: { report: TaxSummary } }>('/api/v1/tax/calculate', {
        method: 'POST',
        body: JSON.stringify({ taxYear, method }),
    });
}

export async function getTaxSummary(year: number, method = 'FIFO') {
    return apiFetch<{ data: TaxSummary }>(`/api/v1/tax/summary?year=${year}&method=${method}`);
}

export async function createTransaction(tx: Record<string, unknown>) {
    return apiFetch<{ data: Transaction }>('/api/v1/transactions', {
        method: 'POST',
        body: JSON.stringify(tx),
    });
}

export interface ImportResult {
    imported: number;
    errors: { row: number; message: string }[];
    summary: {
        totalRows: number;
        parsed: number;
        failed: number;
        format: string;
    };
}

export async function importCsv(file: File, format?: string): Promise<{ data: ImportResult }> {
    const formData = new FormData();
    formData.append('file', file);

    const url = format
        ? `${API_BASE}/api/v1/transactions/import?format=${format}`
        : `${API_BASE}/api/v1/transactions/import`;

    const res = await fetch(url, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(error.error?.message || `Import failed: ${res.status}`);
    }

    return res.json();
}
export async function createConnection(data: { exchangeId: string; apiKey: string; apiSecret: string; apiPassword?: string }) {
    return apiFetch<{ data: { id: string; name: string; status: string } }>('/api/v1/connections', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function getConnections() {
    return apiFetch<{ data: { id: string; name: string; status: string; lastSyncAt: string | null; createdAt: string }[] }>('/api/v1/connections');
}

export async function syncConnection(id: string) {
    return apiFetch<{ data: { status: string; message: string } }>(`/api/v1/connections/${id}/sync`, {
        method: 'POST',
    });
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
    boxSummaries: { box: string; totalProceeds: number; totalCostBasis: number; totalAdjustments: number; totalGainLoss: number; lineCount: number }[];
    totals: { shortTermGainLoss: number; longTermGainLoss: number; totalGainLoss: number; totalProceeds: number; totalCostBasis: number; lineCount: number };
}

export async function getForm8949(year: number, method = 'FIFO') {
    return apiFetch<{ data: Form8949Report }>(`/api/v1/tax/form8949?year=${year}&method=${method}`);
}

export function getForm8949CsvUrl(year: number, method = 'FIFO') {
    return `${API_BASE}/api/v1/tax/form8949?year=${year}&method=${method}&format=csv`;
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
    return apiFetch<{ data: TransferMatchesResult }>('/api/v1/transfers/matches');
}

export async function confirmTransfer(outTxId: string, inTxId: string) {
    return apiFetch<{ data: { status: string; outTxId: string; inTxId: string } }>('/api/v1/transfers/confirm', {
        method: 'POST',
        body: JSON.stringify({ outTxId, inTxId }),
    });
}

export async function dismissTransfer(outTxId: string, inTxId: string) {
    return apiFetch<{ data: { status: string } }>('/api/v1/transfers/dismiss', {
        method: 'POST',
        body: JSON.stringify({ outTxId, inTxId }),
    });
}
