'use client';

import { useEffect, useState } from 'react';
import { getTransactions, createTransaction } from '@/lib/api';
import type { Transaction } from '@/lib/api';

function formatUsd(v: string | null) {
    if (!v) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(v));
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getBadgeClass(type: string) {
    if (['BUY', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD'].includes(type)) return 'badge badge-buy';
    if (['SELL', 'LIQUIDATION'].includes(type)) return 'badge badge-sell';
    if (['TRADE'].includes(type)) return 'badge badge-trade';
    return 'badge badge-other';
}

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 0, limit: 20 });
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [form, setForm] = useState({
        type: 'BUY',
        timestamp: new Date().toISOString().slice(0, 16),
        asset: '',
        amount: '',
        valueUsd: '',
        feeUsd: '',
        notes: '',
    });

    useEffect(() => { loadPage(1); }, []);

    async function loadPage(page: number) {
        setLoading(true);
        try {
            const res = await getTransactions(page, 20);
            setTransactions(res.data);
            setMeta(res.meta);
        } catch { /* ignore */ }
        setLoading(false);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        const isBuy = ['BUY', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST', 'FORK', 'GIFT_RECEIVED'].includes(form.type);

        const body: Record<string, unknown> = {
            type: form.type,
            timestamp: new Date(form.timestamp).toISOString(),
            notes: form.notes || undefined,
        };

        if (isBuy) {
            body.receivedAsset = form.asset;
            body.receivedAmount = parseFloat(form.amount);
            body.receivedValueUsd = parseFloat(form.valueUsd);
        } else {
            body.sentAsset = form.asset;
            body.sentAmount = parseFloat(form.amount);
            body.sentValueUsd = parseFloat(form.valueUsd);
        }

        if (form.feeUsd) body.feeValueUsd = parseFloat(form.feeUsd);

        try {
            await createTransaction(body);
            setShowForm(false);
            setForm({ type: 'BUY', timestamp: new Date().toISOString().slice(0, 16), asset: '', amount: '', valueUsd: '', feeUsd: '', notes: '' });
            loadPage(1);
        } catch { /* ignore */ }
        setSubmitting(false);
    }

    return (
        <div className="animate-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Transactions</h1>
                    <p className="page-subtitle">{meta.total} total transactions</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? '✕ Cancel' : '+ Add Transaction'}
                </button>
            </div>

            {/* ── Add Form ── */}
            {showForm && (
                <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Type</label>
                            <select
                                value={form.type}
                                onChange={e => setForm({ ...form, type: e.target.value })}
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                                }}
                            >
                                {['BUY', 'SELL', 'TRADE', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST', 'TRANSFER_IN', 'TRANSFER_OUT', 'GIFT_RECEIVED', 'GIFT_SENT'].map(t => (
                                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Date & Time</label>
                            <input
                                type="datetime-local"
                                value={form.timestamp}
                                onChange={e => setForm({ ...form, timestamp: e.target.value })}
                                required
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Asset</label>
                            <input
                                placeholder="BTC, ETH, SOL..."
                                value={form.asset}
                                onChange={e => setForm({ ...form, asset: e.target.value.toUpperCase() })}
                                required
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Amount</label>
                            <input
                                type="number" step="any" placeholder="0.00"
                                value={form.amount}
                                onChange={e => setForm({ ...form, amount: e.target.value })}
                                required
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Value (USD)</label>
                            <input
                                type="number" step="any" placeholder="0.00"
                                value={form.valueUsd}
                                onChange={e => setForm({ ...form, valueUsd: e.target.value })}
                                required
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Fee (USD)</label>
                            <input
                                type="number" step="any" placeholder="0.00"
                                value={form.feeUsd}
                                onChange={e => setForm({ ...form, feeUsd: e.target.value })}
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                                }}
                            />
                        </div>
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : 'Save Transaction'}
                        </button>
                    </div>
                </form>
            )}

            {/* ── Table ── */}
            {loading ? (
                <div className="card loading-pulse" style={{ textAlign: 'center', padding: '48px' }}>
                    Loading transactions...
                </div>
            ) : transactions.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                    <p style={{ color: 'var(--text-muted)' }}>No transactions yet</p>
                </div>
            ) : (
                <>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Asset</th>
                                    <th>Amount</th>
                                    <th style={{ textAlign: 'right' }}>Value (USD)</th>
                                    <th style={{ textAlign: 'right' }}>Fee</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((tx) => {
                                    const asset = tx.receivedAsset || tx.sentAsset || '—';
                                    const amount = tx.receivedAmount || tx.sentAmount;
                                    const value = tx.receivedValueUsd || tx.sentValueUsd;
                                    return (
                                        <tr key={tx.id}>
                                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(tx.timestamp)}</td>
                                            <td><span className={getBadgeClass(tx.type)}>{tx.type}</span></td>
                                            <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{asset}</td>
                                            <td className="mono">{amount ? `${parseFloat(amount).toLocaleString('en-US', { maximumFractionDigits: 8 })}` : '—'}</td>
                                            <td style={{ textAlign: 'right' }} className="mono">{formatUsd(value)}</td>
                                            <td style={{ textAlign: 'right' }} className="mono">{formatUsd(tx.feeValueUsd)}</td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{tx.notes || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {meta.totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
                            {Array.from({ length: meta.totalPages }, (_, i) => (
                                <button
                                    key={i + 1}
                                    className={`btn ${meta.page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '6px 14px', fontSize: '13px' }}
                                    onClick={() => loadPage(i + 1)}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
