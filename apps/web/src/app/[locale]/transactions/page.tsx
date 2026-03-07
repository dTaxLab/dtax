'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { getTransactions, createTransaction, importCsv } from '@/lib/api';
import type { Transaction, ImportResult } from '@/lib/api';

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

const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
};

const labelStyle = {
    display: 'block' as const, fontSize: '12px', color: 'var(--text-muted)',
    marginBottom: '6px', fontWeight: 500,
};

export default function TransactionsPage() {
    const t = useTranslations('transactions');
    const tt = useTranslations('table');

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 0, limit: 20 });
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        type: 'BUY', timestamp: new Date().toISOString().slice(0, 16),
        asset: '', amount: '', valueUsd: '', feeUsd: '', notes: '',
    });

    // Import state
    const fileRef = useRef<HTMLInputElement>(null);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importFormat, setImportFormat] = useState('');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

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
            type: form.type, timestamp: new Date(form.timestamp).toISOString(), notes: form.notes || undefined,
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

    async function handleImport() {
        if (!importFile) {
            setImportError(t('import.noFile'));
            return;
        }
        setImporting(true);
        setImportError(null);
        setImportResult(null);
        try {
            const res = await importCsv(importFile, importFormat || undefined);
            setImportResult(res.data);
            loadPage(1);
        } catch (e) {
            setImportError(e instanceof Error ? e.message : 'Import failed');
        }
        setImporting(false);
    }

    return (
        <div className="animate-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('title')}</h1>
                    <p className="page-subtitle">{t('totalCount', { count: meta.total })}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={() => { setShowImport(!showImport); setShowForm(false); }}>
                        {showImport ? t('cancel') : t('importCsv')}
                    </button>
                    <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setShowImport(false); }}>
                        {showForm ? t('cancel') : t('addTransaction')}
                    </button>
                </div>
            </div>

            {/* ── Import Panel ── */}
            {showImport && (
                <div className="card" style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>{t('import.title')}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        {t('import.description')}
                    </p>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label style={labelStyle}>{t('import.selectFile')}</label>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv,text/csv"
                                onChange={e => {
                                    setImportFile(e.target.files?.[0] || null);
                                    setImportResult(null);
                                    setImportError(null);
                                }}
                                style={{
                                    ...inputStyle,
                                    padding: '7px 12px',
                                    cursor: 'pointer',
                                }}
                            />
                        </div>
                        <div style={{ minWidth: '160px' }}>
                            <label style={labelStyle}>{t('import.formatLabel')}</label>
                            <select value={importFormat} onChange={e => setImportFormat(e.target.value)} style={inputStyle}>
                                <option value="">{t('import.autoDetect')}</option>
                                <option value="coinbase">Coinbase</option>
                                <option value="binance">Binance (International)</option>
                                <option value="binance_us">Binance US</option>
                                <option value="generic">Generic CSV</option>
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={handleImport} disabled={importing || !importFile}>
                            {importing ? `⏳ ${t('import.uploading')}` : `📤 ${t('import.upload')}`}
                        </button>
                    </div>

                    {importError && (
                        <div style={{ marginTop: '12px', padding: '12px 16px', background: 'var(--red-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--red-light)', fontSize: '14px' }}>
                            ⚠️ {importError}
                        </div>
                    )}

                    {importResult && (
                        <div style={{ marginTop: '12px', padding: '16px', background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)' }}>
                            <p style={{ color: 'var(--green-light)', fontWeight: 600, fontSize: '14px' }}>
                                ✅ {t('import.success', { count: importResult.imported })}
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                                Format: {importResult.summary.format} · {importResult.summary.totalRows} rows · {importResult.summary.parsed} parsed
                            </p>
                            {importResult.errors.length > 0 && (
                                <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--yellow-bg)', borderRadius: 'var(--radius-sm)' }}>
                                    <p style={{ color: 'var(--yellow)', fontSize: '12px', fontWeight: 600 }}>
                                        ⚠️ {t('import.errors', { count: importResult.errors.length })}
                                    </p>
                                    {importResult.errors.slice(0, 5).map((err, i) => (
                                        <p key={i} style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                                            Row {err.row}: {err.message}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Manual Add Form ── */}
            {showForm && (
                <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        <div>
                            <label style={labelStyle}>{t('form.type')}</label>
                            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                                {['BUY', 'SELL', 'TRADE', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST',
                                    'TRANSFER_IN', 'TRANSFER_OUT', 'GIFT_RECEIVED', 'GIFT_SENT'].map(tp => (
                                        <option key={tp} value={tp}>{tp.replace(/_/g, ' ')}</option>
                                    ))}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>{t('form.dateTime')}</label>
                            <input type="datetime-local" value={form.timestamp} onChange={e => setForm({ ...form, timestamp: e.target.value })} required style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>{t('form.asset')}</label>
                            <input placeholder={t('form.assetPlaceholder')} value={form.asset} onChange={e => setForm({ ...form, asset: e.target.value.toUpperCase() })} required style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>{t('form.amount')}</label>
                            <input type="number" step="any" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>{t('form.valueUsd')}</label>
                            <input type="number" step="any" placeholder="0.00" value={form.valueUsd} onChange={e => setForm({ ...form, valueUsd: e.target.value })} required style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>{t('form.feeUsd')}</label>
                            <input type="number" step="any" placeholder="0.00" value={form.feeUsd} onChange={e => setForm({ ...form, feeUsd: e.target.value })} style={inputStyle} />
                        </div>
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? t('saving') : t('save')}
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="card loading-pulse" style={{ textAlign: 'center', padding: '48px' }}>{t('loading')}</div>
            ) : transactions.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                    <p style={{ color: 'var(--text-muted)' }}>{t('noTransactions')}</p>
                </div>
            ) : (
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
                                            <td className="mono">{amount ? parseFloat(amount).toLocaleString('en-US', { maximumFractionDigits: 8 }) : '—'}</td>
                                            <td style={{ textAlign: 'right' }} className="mono">{formatUsd(value)}</td>
                                            <td style={{ textAlign: 'right' }} className="mono">{formatUsd(tx.feeValueUsd)}</td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{tx.notes || '—'}</td>
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
                                    style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => loadPage(i + 1)}>
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
