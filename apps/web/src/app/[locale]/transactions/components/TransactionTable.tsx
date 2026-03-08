'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { updateTransaction, deleteTransaction } from '@/lib/api';
import type { Transaction, SortField, SortOrder } from '@/lib/api';
import { formatUsd, formatDate, getBadgeClass, inputStyle, TRANSACTION_TYPES, BUY_TYPES } from './shared';

/** Build truncated page numbers: 1 ... 4 5 [6] 7 8 ... 20 */
function getPageNumbers(current: number, total: number): (number | '...')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push('...');
    pages.push(total);
    return pages;
}

interface TransactionTableProps {
    transactions: Transaction[];
    meta: { total: number; page: number; totalPages: number; limit: number };
    onPageChange: (page: number) => void;
    onRefresh: () => void;
    sortField: SortField;
    sortOrder: SortOrder;
    onSort: (field: SortField) => void;
}

export function TransactionTable({ transactions, meta, onPageChange, onRefresh, sortField, sortOrder, onSort }: TransactionTableProps) {
    const t = useTranslations('transactions');
    const tt = useTranslations('table');
    const tType = useTranslations('txTypes');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        type: '', timestamp: '', asset: '', amount: '', valueUsd: '', feeUsd: '', notes: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    function startEdit(tx: Transaction) {
        const isBuy = BUY_TYPES.includes(tx.type);
        setEditingId(tx.id);
        setEditForm({
            type: tx.type,
            timestamp: tx.timestamp.slice(0, 16),
            asset: (isBuy ? tx.receivedAsset : tx.sentAsset) || '',
            amount: String(isBuy ? (tx.receivedAmount || '') : (tx.sentAmount || '')),
            valueUsd: String(isBuy ? (tx.receivedValueUsd || '') : (tx.sentValueUsd || '')),
            feeUsd: tx.feeValueUsd ? String(tx.feeValueUsd) : '',
            notes: tx.notes || '',
        });
    }

    async function handleUpdate() {
        if (!editingId) return;
        setSubmitting(true);
        setActionError(null);
        const isBuy = BUY_TYPES.includes(editForm.type);
        const body: Record<string, unknown> = {
            type: editForm.type,
            timestamp: new Date(editForm.timestamp).toISOString(),
            notes: editForm.notes || undefined,
        };
        if (isBuy) {
            body.receivedAsset = editForm.asset;
            body.receivedAmount = parseFloat(editForm.amount);
            body.receivedValueUsd = parseFloat(editForm.valueUsd);
            body.sentAsset = null; body.sentAmount = null; body.sentValueUsd = null;
        } else {
            body.sentAsset = editForm.asset;
            body.sentAmount = parseFloat(editForm.amount);
            body.sentValueUsd = parseFloat(editForm.valueUsd);
            body.receivedAsset = null; body.receivedAmount = null; body.receivedValueUsd = null;
        }
        if (editForm.feeUsd) body.feeValueUsd = parseFloat(editForm.feeUsd);
        else body.feeValueUsd = null;
        try {
            await updateTransaction(editingId, body);
            setEditingId(null);
            onRefresh();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : 'Update failed');
        }
        setSubmitting(false);
    }

    async function handleDelete(id: string) {
        if (!confirm(t('deleteConfirm'))) return;
        setDeletingId(id);
        setActionError(null);
        try {
            await deleteTransaction(id);
            onRefresh();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : 'Delete failed');
        }
        setDeletingId(null);
    }

    const editInputStyle = { ...inputStyle, padding: '4px 6px', fontSize: '13px' };

    const sortIndicator = (field: SortField) =>
        sortField === field ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '';

    const thSort = (field: SortField, label: string, align?: 'right') => (
        <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: align }}
            onClick={() => onSort(field)}>
            {label}{sortIndicator(field)}
        </th>
    );

    return (
        <>
            {actionError && (
                <div style={{ marginBottom: '12px', padding: '12px 16px', background: 'var(--red-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--red-light)', fontSize: '14px' }}>
                    {actionError}
                </div>
            )}
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            {thSort('timestamp', tt('date'))}
                            {thSort('type', tt('type'))}
                            <th>{tt('asset')}</th>
                            <th>{tt('amount')}</th>
                            {thSort('sentValueUsd', tt('valueUsd'), 'right')}
                            {thSort('feeValueUsd', tt('fee'), 'right')}
                            <th>{tt('notes')}</th>
                            <th style={{ textAlign: 'center' }}>{t('actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map((tx) => {
                            const asset = tx.receivedAsset || tx.sentAsset || '—';
                            const amount = tx.receivedAmount || tx.sentAmount;
                            const value = tx.receivedValueUsd || tx.sentValueUsd;

                            if (editingId === tx.id) {
                                return (
                                    <tr key={tx.id} style={{ background: 'var(--bg-secondary)' }}>
                                        <td>
                                            <input type="datetime-local" value={editForm.timestamp}
                                                onChange={e => setEditForm({ ...editForm, timestamp: e.target.value })}
                                                style={{ ...editInputStyle, width: '160px' }} />
                                        </td>
                                        <td>
                                            <select value={editForm.type}
                                                onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                                                style={{ ...editInputStyle, width: '110px' }}>
                                                {TRANSACTION_TYPES.map(tp => (
                                                    <option key={tp} value={tp}>{tType(tp)}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <input value={editForm.asset}
                                                onChange={e => setEditForm({ ...editForm, asset: e.target.value.toUpperCase() })}
                                                style={{ ...editInputStyle, width: '70px' }} />
                                        </td>
                                        <td>
                                            <input type="number" step="any" value={editForm.amount}
                                                onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                                                style={{ ...editInputStyle, width: '100px' }} />
                                        </td>
                                        <td>
                                            <input type="number" step="any" value={editForm.valueUsd}
                                                onChange={e => setEditForm({ ...editForm, valueUsd: e.target.value })}
                                                style={{ ...editInputStyle, width: '100px' }} />
                                        </td>
                                        <td>
                                            <input type="number" step="any" value={editForm.feeUsd}
                                                onChange={e => setEditForm({ ...editForm, feeUsd: e.target.value })}
                                                style={{ ...editInputStyle, width: '80px' }} />
                                        </td>
                                        <td>
                                            <input value={editForm.notes}
                                                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                                style={{ ...editInputStyle, width: '100px' }} />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                <button className="btn btn-primary" onClick={handleUpdate} disabled={submitting}
                                                    style={{ padding: '3px 8px', fontSize: '12px' }}>
                                                    {submitting ? t('updating') : t('save')}
                                                </button>
                                                <button className="btn btn-secondary" onClick={() => setEditingId(null)}
                                                    style={{ padding: '3px 8px', fontSize: '12px' }}>
                                                    {t('cancel')}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }

                            return (
                                <tr key={tx.id}>
                                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(tx.timestamp)}</td>
                                    <td><span className={getBadgeClass(tx.type)}>{tType(tx.type)}</span></td>
                                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{asset}</td>
                                    <td className="mono">{amount ? parseFloat(amount).toLocaleString('en-US', { maximumFractionDigits: 8 }) : '—'}</td>
                                    <td style={{ textAlign: 'right' }} className="mono">{formatUsd(value)}</td>
                                    <td style={{ textAlign: 'right' }} className="mono">{formatUsd(tx.feeValueUsd)}</td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{tx.notes || '—'}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                            <button className="btn btn-secondary" onClick={() => startEdit(tx)}
                                                style={{ padding: '3px 8px', fontSize: '12px' }}>
                                                {t('edit')}
                                            </button>
                                            <button className="btn btn-secondary" onClick={() => handleDelete(tx.id)}
                                                disabled={deletingId === tx.id}
                                                style={{ padding: '3px 8px', fontSize: '12px', color: 'var(--red)' }}>
                                                {deletingId === tx.id ? t('deleting') : t('delete')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {meta.totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', marginTop: '24px' }}>
                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}
                        disabled={meta.page === 1} onClick={() => onPageChange(meta.page - 1)}>
                        ‹
                    </button>
                    {getPageNumbers(meta.page, meta.totalPages).map((p, i) =>
                        p === '...' ? (
                            <span key={`ellipsis-${i}`} style={{ padding: '6px 4px', color: 'var(--text-muted)' }}>…</span>
                        ) : (
                            <button key={p} className={`btn ${meta.page === p ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => onPageChange(p as number)}>
                                {p}
                            </button>
                        )
                    )}
                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}
                        disabled={meta.page === meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
                        ›
                    </button>
                </div>
            )}
        </>
    );
}
