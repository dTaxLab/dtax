'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { updateTransaction, deleteTransaction } from '@/lib/api';
import type { Transaction } from '@/lib/api';
import { formatUsd, formatDate, getBadgeClass, inputStyle, TRANSACTION_TYPES, BUY_TYPES } from './shared';

interface TransactionTableProps {
    transactions: Transaction[];
    meta: { total: number; page: number; totalPages: number; limit: number };
    onPageChange: (page: number) => void;
    onRefresh: () => void;
}

export function TransactionTable({ transactions, meta, onPageChange, onRefresh }: TransactionTableProps) {
    const t = useTranslations('transactions');
    const tt = useTranslations('table');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        type: '', timestamp: '', asset: '', amount: '', valueUsd: '', feeUsd: '', notes: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

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
        } catch { /* ignore */ }
        setSubmitting(false);
    }

    async function handleDelete(id: string) {
        if (!confirm(t('deleteConfirm'))) return;
        setDeletingId(id);
        try {
            await deleteTransaction(id);
            onRefresh();
        } catch { /* ignore */ }
        setDeletingId(null);
    }

    const editInputStyle = { ...inputStyle, padding: '4px 6px', fontSize: '13px' };

    return (
        <>
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>{tt('date')}</th>
                            <th>{tt('type')}</th>
                            <th>{tt('asset')}</th>
                            <th>{tt('amount')}</th>
                            <th style={{ textAlign: 'right' }}>{tt('valueUsd')}</th>
                            <th style={{ textAlign: 'right' }}>{tt('fee')}</th>
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
                                                    <option key={tp} value={tp}>{tp.replace(/_/g, ' ')}</option>
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
                                    <td><span className={getBadgeClass(tx.type)}>{tx.type}</span></td>
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
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
                    {Array.from({ length: meta.totalPages }, (_, i) => (
                        <button key={i + 1} className={`btn ${meta.page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => onPageChange(i + 1)}>
                            {i + 1}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}
