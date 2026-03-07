'use client';

import { useState } from 'react';
import { calculateTax } from '@/lib/api';
import type { TaxSummary } from '@/lib/api';

function formatUsd(v: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

export default function TaxPage() {
    const [year, setYear] = useState(2025);
    const [method, setMethod] = useState('FIFO');
    const [report, setReport] = useState<TaxSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCalculate() {
        setLoading(true);
        setError(null);
        try {
            const res = await calculateTax(year, method);
            setReport(res.data.report);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Calculation failed');
        }
        setLoading(false);
    }

    return (
        <div className="animate-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Tax Report</h1>
                    <p className="page-subtitle">Calculate your crypto capital gains</p>
                </div>
            </div>

            {/* ── Controls ── */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Tax Year</label>
                        <select
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value))}
                            style={{
                                padding: '10px 16px', borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                            }}
                        >
                            {[2025, 2024, 2023, 2022].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>Method</label>
                        <select
                            value={method}
                            onChange={e => setMethod(e.target.value)}
                            style={{
                                padding: '10px 16px', borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                            }}
                        >
                            <option value="FIFO">FIFO (First In, First Out)</option>
                            <option value="LIFO">LIFO (Last In, First Out)</option>
                            <option value="HIFO">HIFO (Highest In, First Out)</option>
                        </select>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleCalculate}
                        disabled={loading}
                    >
                        {loading ? '⏳ Calculating...' : '🧮 Calculate'}
                    </button>
                </div>
                {error && <p style={{ color: 'var(--red)', marginTop: '12px', fontSize: '14px' }}>⚠️ {error}</p>}
            </div>

            {/* ── Results ── */}
            {report && (
                <>
                    <div className="grid-3" style={{ marginBottom: '24px' }}>
                        <div className="stat-card">
                            <span className="stat-label">Net Gain / Loss</span>
                            <span className={`stat-value ${report.netGainLoss >= 0 ? 'positive' : 'negative'}`}>
                                {formatUsd(report.netGainLoss)}
                            </span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">Total Dispositions</span>
                            <span className="stat-value neutral">{report.totalTransactions}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">Method</span>
                            <span className="stat-value neutral">{report.method}</span>
                        </div>
                    </div>

                    {/* ── Breakdown ── */}
                    <div className="card">
                        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>Capital Gains Breakdown</h3>
                        <div className="table-container" style={{ border: 'none' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Category</th>
                                        <th style={{ textAlign: 'right' }}>Gains</th>
                                        <th style={{ textAlign: 'right' }}>Losses</th>
                                        <th style={{ textAlign: 'right' }}>Net</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Short-Term (&lt; 1 year)</td>
                                        <td style={{ textAlign: 'right', color: 'var(--green)' }}>{formatUsd(report.shortTermGains)}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--red)' }}>({formatUsd(report.shortTermLosses)})</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">
                                            {formatUsd(report.shortTermGains - report.shortTermLosses)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Long-Term (&gt; 1 year)</td>
                                        <td style={{ textAlign: 'right', color: 'var(--green)' }}>{formatUsd(report.longTermGains)}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--red)' }}>({formatUsd(report.longTermLosses)})</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">
                                            {formatUsd(report.longTermGains - report.longTermLosses)}
                                        </td>
                                    </tr>
                                    <tr style={{ background: 'var(--bg-surface)' }}>
                                        <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>TOTAL</td>
                                        <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>
                                            {formatUsd(report.shortTermGains + report.longTermGains)}
                                        </td>
                                        <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>
                                            ({formatUsd(report.shortTermLosses + report.longTermLosses)})
                                        </td>
                                        <td style={{
                                            textAlign: 'right', fontWeight: 700, fontSize: '16px',
                                            color: report.netGainLoss >= 0 ? 'var(--green)' : 'var(--red)',
                                        }} className="mono">
                                            {formatUsd(report.netGainLoss)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginTop: '20px', padding: '16px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                ⚠️ This is for informational purposes only and does not constitute tax advice.
                                Consult a qualified tax professional for your specific situation.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
