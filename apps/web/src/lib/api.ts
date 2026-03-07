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
