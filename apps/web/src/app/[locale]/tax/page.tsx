'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { calculateTax, getForm8949, getForm8949CsvUrl } from '@/lib/api';
import type { TaxSummary, Form8949Report } from '@/lib/api';

function formatUsd(v: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

const selectStyle = {
    padding: '10px 16px', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
};

const labelStyle = {
    display: 'block' as const, fontSize: '12px', color: 'var(--text-muted)',
    marginBottom: '6px', fontWeight: 500,
};

export default function TaxPage() {
    const t = useTranslations('tax');

    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear - 1);
    const [method, setMethod] = useState('FIFO');
    const [report, setReport] = useState<TaxSummary | null>(null);
    const [form8949, setForm8949] = useState<Form8949Report | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCalculate() {
        setLoading(true);
        setError(null);
        try {
            const [taxRes, f8949Res] = await Promise.all([
                calculateTax(year, method),
                getForm8949(year, method),
            ]);
            setReport(taxRes.data.report);
            setForm8949(f8949Res.data);
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

            <div className="card" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={labelStyle}>{t('taxYear')}</label>
                        <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={selectStyle}>
                            {Array.from({ length: 6 }, (_, i) => currentYear - i).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>{t('method')}</label>
                        <select value={method} onChange={e => setMethod(e.target.value)} style={selectStyle}>
                            <option value="FIFO">{t('fifo')}</option>
                            <option value="LIFO">{t('lifo')}</option>
                            <option value="HIFO">{t('hifo')}</option>
                        </select>
                    </div>
                    <button className="btn btn-primary" onClick={handleCalculate} disabled={loading}>
                        {loading ? `⏳ ${t('calculating')}` : `🧮 ${t('calculate')}`}
                    </button>
                </div>
                {error && <p style={{ color: 'var(--red)', marginTop: '12px', fontSize: '14px' }}>⚠️ {error}</p>}
            </div>

            {report && (
                <>
                    <div className="grid-3" style={{ marginBottom: '24px' }}>
                        <div className="stat-card">
                            <span className="stat-label">{t('netGainLoss')}</span>
                            <span className={`stat-value ${report.netGainLoss >= 0 ? 'positive' : 'negative'}`}>
                                {formatUsd(report.netGainLoss)}
                            </span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">{t('totalDispositions')}</span>
                            <span className="stat-value neutral">{report.totalTransactions}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">{t('methodLabel')}</span>
                            <span className="stat-value neutral">{report.method}</span>
                        </div>
                    </div>

                    <div className="card">
                        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>{t('breakdown')}</h3>
                        <div className="table-container" style={{ border: 'none' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>{t('category')}</th>
                                        <th style={{ textAlign: 'right' }}>{t('gains')}</th>
                                        <th style={{ textAlign: 'right' }}>{t('losses')}</th>
                                        <th style={{ textAlign: 'right' }}>{t('net')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('shortTerm')}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--green)' }}>{formatUsd(report.shortTermGains)}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--red)' }}>({formatUsd(report.shortTermLosses)})</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{formatUsd(report.shortTermGains - report.shortTermLosses)}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('longTerm')}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--green)' }}>{formatUsd(report.longTermGains)}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--red)' }}>({formatUsd(report.longTermLosses)})</td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{formatUsd(report.longTermGains - report.longTermLosses)}</td>
                                    </tr>
                                    <tr style={{ background: 'var(--bg-surface)' }}>
                                        <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{t('total')}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{formatUsd(report.shortTermGains + report.longTermGains)}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>({formatUsd(report.shortTermLosses + report.longTermLosses)})</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '16px', color: report.netGainLoss >= 0 ? 'var(--green)' : 'var(--red)' }} className="mono">{formatUsd(report.netGainLoss)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div style={{ marginTop: '20px', padding: '16px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('disclaimer')}</p>
                        </div>
                    </div>

                    {/* Form 8949 Section */}
                    {form8949 && form8949.lines.length > 0 && (
                        <div className="card" style={{ marginTop: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{t('form8949.title')}</h3>
                                <a
                                    href={getForm8949CsvUrl(year, method)}
                                    download
                                    className="btn btn-primary"
                                    style={{ fontSize: '13px', textDecoration: 'none' }}
                                >
                                    {t('form8949.downloadCsv')}
                                </a>
                            </div>

                            {/* Box summaries */}
                            {form8949.boxSummaries.length > 0 && (
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                                    {form8949.boxSummaries.map(bs => (
                                        <div key={bs.box} style={{
                                            padding: '12px 16px', background: 'var(--bg-surface)',
                                            borderRadius: 'var(--radius-sm)', fontSize: '13px',
                                            border: '1px solid var(--border)',
                                        }}>
                                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                                {t('form8949.box')} {bs.box} ({bs.lineCount} {bs.lineCount === 1 ? 'item' : 'items'})
                                            </div>
                                            <div style={{ color: bs.totalGainLoss >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                {formatUsd(bs.totalGainLoss)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Line items table */}
                            <div className="table-container" style={{ border: 'none' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>{t('form8949.box')}</th>
                                            <th>{t('form8949.description')}</th>
                                            <th>{t('form8949.acquired')}</th>
                                            <th>{t('form8949.sold')}</th>
                                            <th style={{ textAlign: 'right' }}>{t('form8949.proceeds')}</th>
                                            <th style={{ textAlign: 'right' }}>{t('form8949.basis')}</th>
                                            <th style={{ textAlign: 'right' }}>{t('form8949.gainLoss')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {form8949.lines.map((line) => (
                                            <tr key={line.eventId}>
                                                <td><span style={{
                                                    display: 'inline-block', width: '24px', height: '24px',
                                                    lineHeight: '24px', textAlign: 'center',
                                                    background: 'var(--bg-surface)', borderRadius: '4px',
                                                    fontSize: '12px', fontWeight: 600,
                                                }}>{line.box}</span></td>
                                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{line.description}</td>
                                                <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{line.dateAcquired}</td>
                                                <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{line.dateSold}</td>
                                                <td style={{ textAlign: 'right', fontSize: '13px' }}>{formatUsd(line.proceeds)}</td>
                                                <td style={{ textAlign: 'right', fontSize: '13px' }}>{formatUsd(line.costBasis)}</td>
                                                <td style={{
                                                    textAlign: 'right', fontSize: '13px', fontWeight: 600,
                                                    color: line.gainLoss >= 0 ? 'var(--green)' : 'var(--red)',
                                                }}>{formatUsd(line.gainLoss)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
