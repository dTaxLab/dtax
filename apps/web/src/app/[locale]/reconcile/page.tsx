'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { reconcile1099DA } from '@/lib/api';
import type { ReconciliationReport } from '@/lib/api';

function formatUsd(v: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

const STATUS_COLORS: Record<string, string> = {
    matched: 'var(--green)',
    proceeds_mismatch: 'var(--yellow, #eab308)',
    basis_mismatch: 'var(--yellow, #eab308)',
    both_mismatch: 'var(--red)',
    missing_in_dtax: 'var(--red)',
    missing_in_1099da: 'var(--blue, #3b82f6)',
    internal_transfer_misclassified: 'var(--purple, #a855f7)',
};

const selectStyle = {
    padding: '10px 16px', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
};

const labelStyle = {
    display: 'block' as const, fontSize: '12px', color: 'var(--text-muted)',
    marginBottom: '6px', fontWeight: 500,
};

export default function ReconcilePage() {
    const t = useTranslations('reconcile');

    const [year, setYear] = useState(2025);
    const [method, setMethod] = useState('FIFO');
    const [brokerName, setBrokerName] = useState('Coinbase');
    const [csvContent, setCsvContent] = useState('');
    const [report, setReport] = useState<ReconciliationReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        setCsvContent(text);
    }

    async function handleReconcile() {
        if (!csvContent) return;
        setLoading(true);
        setError(null);
        try {
            const res = await reconcile1099DA(csvContent, brokerName, year, method);
            setReport(res.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed');
        }
        setLoading(false);
    }

    return (
        <div className="animate-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('title')}</h1>
                    <p className="page-subtitle">{t('subtitle')}</p>
                </div>
            </div>

            {/* Upload form */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={labelStyle}>{t('taxYear')}</label>
                        <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={selectStyle}>
                            {[2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>{t('method')}</label>
                        <select value={method} onChange={e => setMethod(e.target.value)} style={selectStyle}>
                            <option value="FIFO">FIFO</option>
                            <option value="LIFO">LIFO</option>
                            <option value="HIFO">HIFO</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>{t('broker')}</label>
                        <input
                            type="text" value={brokerName}
                            onChange={e => setBrokerName(e.target.value)}
                            style={{ ...selectStyle, minWidth: '140px' }}
                            placeholder="Coinbase, Binance..."
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>{t('upload1099da')}</label>
                        <input type="file" accept=".csv" onChange={handleFileChange}
                            style={{ fontSize: '13px', color: 'var(--text-muted)' }} />
                    </div>
                    <button className="btn btn-primary" onClick={handleReconcile}
                        disabled={loading || !csvContent}>
                        {loading ? t('reconciling') : t('reconcile')}
                    </button>
                </div>
                {error && <p style={{ color: 'var(--red)', marginTop: '12px', fontSize: '14px' }}>{error}</p>}
            </div>

            {/* Results */}
            {report && (
                <>
                    {/* Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                        <div className="stat-card">
                            <span className="stat-label">{t('matched')}</span>
                            <span className="stat-value" style={{ color: 'var(--green)' }}>{report.summary.matched}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">{t('mismatches')}</span>
                            <span className="stat-value" style={{ color: 'var(--yellow, #eab308)' }}>
                                {report.summary.proceedsMismatch + report.summary.basisMismatch + report.summary.bothMismatch}
                            </span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">{t('missingInDtax')}</span>
                            <span className="stat-value" style={{ color: 'var(--red)' }}>{report.summary.missingInDtax}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">{t('missingIn1099da')}</span>
                            <span className="stat-value neutral">{report.summary.missingIn1099da}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">{t('transferMisclassified')}</span>
                            <span className="stat-value" style={{ color: 'var(--purple, #a855f7)' }}>
                                {report.summary.internalTransferMisclassified}
                            </span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">{t('netDiff')}</span>
                            <span className="stat-value" style={{
                                color: report.summary.netGainLossDiff === 0 ? 'var(--green)'
                                    : report.summary.netGainLossDiff > 0 ? 'var(--red)' : 'var(--yellow, #eab308)',
                            }}>
                                {formatUsd(report.summary.netGainLossDiff)}
                            </span>
                        </div>
                    </div>

                    {/* Items table */}
                    <div className="card">
                        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>
                            {t('details')} ({report.items.length})
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {report.items.map((item, idx) => (
                                <div key={idx} style={{
                                    padding: '16px', background: 'var(--bg-surface)',
                                    borderRadius: 'var(--radius-sm)',
                                    borderLeft: `3px solid ${STATUS_COLORS[item.status] || 'var(--border)'}`,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{
                                            fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
                                            color: STATUS_COLORS[item.status] || 'var(--text-muted)',
                                        }}>
                                            {t(`status.${item.status}`)}
                                        </span>
                                        <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                                            {item.brokerEntry?.asset || item.dtaxEntry?.asset}
                                        </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                                        {/* Broker side */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>1099-DA</div>
                                            {item.brokerEntry ? (
                                                <div style={{ color: 'var(--text-primary)' }}>
                                                    {t('proceeds')}: {formatUsd(item.brokerEntry.grossProceeds)}
                                                    {item.brokerEntry.costBasis !== undefined && (
                                                        <> | {t('basis')}: {formatUsd(item.brokerEntry.costBasis)}</>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</div>
                                            )}
                                        </div>
                                        {/* DTax side */}
                                        <div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>DTax</div>
                                            {item.dtaxEntry ? (
                                                <div style={{ color: 'var(--text-primary)' }}>
                                                    {t('proceeds')}: {formatUsd(item.dtaxEntry.proceeds)}
                                                    {' | '}{t('basis')}: {formatUsd(item.dtaxEntry.costBasis)}
                                                </div>
                                            ) : (
                                                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Rebuttal suggestion */}
                                    {item.rebuttalSuggestion && (
                                        <div style={{
                                            marginTop: '8px', padding: '8px 12px',
                                            background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
                                            fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5,
                                        }}>
                                            {item.rebuttalSuggestion}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
