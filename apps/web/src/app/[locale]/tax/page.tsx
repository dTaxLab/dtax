'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { calculateTax, getForm8949, getForm8949CsvUrl, getScheduleD } from '@/lib/api';
import type { TaxSummary, Form8949Report, ScheduleDReport } from '@/lib/api';
import { getPreferences } from '@/lib/preferences';

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

    const prefs = typeof window !== 'undefined' ? getPreferences() : null;
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(prefs?.defaultYear ?? currentYear - 1);
    const [method, setMethod] = useState<string>(prefs?.defaultMethod ?? 'FIFO');
    const [includeWashSales, setIncludeWashSales] = useState(false);
    const [report, setReport] = useState<TaxSummary | null>(null);
    const [form8949, setForm8949] = useState<Form8949Report | null>(null);
    const [washSaleSummary, setWashSaleSummary] = useState<{ totalDisallowed: number; adjustmentCount: number } | null>(null);
    const [scheduleD, setScheduleD] = useState<ScheduleDReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCalculate() {
        setLoading(true);
        setError(null);
        try {
            const [taxRes, f8949Res, schDRes] = await Promise.all([
                calculateTax(year, method),
                getForm8949(year, method, includeWashSales),
                getScheduleD(year, method, includeWashSales),
            ]);
            setReport(taxRes.data.report);
            setForm8949(f8949Res.data);
            setWashSaleSummary(f8949Res.data.washSaleSummary || null);
            setScheduleD(schDRes.data);
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '2px' }}>
                        <input
                            type="checkbox"
                            id="washSaleToggle"
                            checked={includeWashSales}
                            onChange={e => setIncludeWashSales(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <label htmlFor="washSaleToggle" style={{ fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            {t('includeWashSales')}
                        </label>
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

                    {/* Capital Gains Breakdown */}
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

                    {/* Per-Asset Breakdown */}
                    {form8949 && form8949.lines.length > 0 && (() => {
                        const assetMap = new Map<string, { count: number; proceeds: number; costBasis: number; gainLoss: number }>();
                        for (const line of form8949.lines) {
                            const asset = line.description.replace(/^[\d.,]+\s*/, '');
                            const entry = assetMap.get(asset) || { count: 0, proceeds: 0, costBasis: 0, gainLoss: 0 };
                            entry.count++;
                            entry.proceeds += line.proceeds;
                            entry.costBasis += line.costBasis;
                            entry.gainLoss += line.gainLoss;
                            assetMap.set(asset, entry);
                        }
                        const assets = [...assetMap.entries()].sort((a, b) => Math.abs(b[1].gainLoss) - Math.abs(a[1].gainLoss));
                        return (
                            <div className="card" style={{ marginTop: '24px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>{t('perAsset.title')}</h3>
                                <div className="table-container" style={{ border: 'none' }}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>{t('perAsset.asset')}</th>
                                                <th style={{ textAlign: 'right' }}>{t('perAsset.dispositions')}</th>
                                                <th style={{ textAlign: 'right' }}>{t('perAsset.proceeds')}</th>
                                                <th style={{ textAlign: 'right' }}>{t('perAsset.costBasis')}</th>
                                                <th style={{ textAlign: 'right' }}>{t('perAsset.gainLoss')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {assets.map(([asset, data]) => (
                                                <tr key={asset}>
                                                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{asset}</td>
                                                    <td style={{ textAlign: 'right' }}>{data.count}</td>
                                                    <td style={{ textAlign: 'right', fontSize: '13px' }}>{formatUsd(data.proceeds)}</td>
                                                    <td style={{ textAlign: 'right', fontSize: '13px' }}>{formatUsd(data.costBasis)}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600, color: data.gainLoss >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                        {formatUsd(data.gainLoss)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Wash Sale Summary */}
                    {washSaleSummary && washSaleSummary.adjustmentCount > 0 && (
                        <div className="card" style={{ marginTop: '24px', borderLeft: '3px solid var(--yellow)' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
                                {t('washSale.title')}
                            </h3>
                            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                <div>
                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        {t('washSale.detected', { count: washSaleSummary.adjustmentCount })}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('washSale.totalDisallowed')}: </span>
                                    <span style={{ fontWeight: 600, color: 'var(--yellow)' }}>{formatUsd(washSaleSummary.totalDisallowed)}</span>
                                </div>
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                                {t('washSale.codeW')}
                            </p>
                        </div>
                    )}

                    {/* Schedule D */}
                    {scheduleD && (
                        <div className="card" style={{ marginTop: '24px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '20px' }}>{t('scheduleD.title')}</h3>

                            {/* Part I: Short-term */}
                            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                                {t('scheduleD.partI')}
                            </h4>
                            <div className="table-container" style={{ border: 'none', marginBottom: '20px' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>{t('scheduleD.line')}</th>
                                            <th>{t('form8949.description')}</th>
                                            <th style={{ textAlign: 'right' }}>{t('form8949.proceeds')}</th>
                                            <th style={{ textAlign: 'right' }}>{t('form8949.basis')}</th>
                                            <th style={{ textAlign: 'right' }}>{t('form8949.gainLoss')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {scheduleD.partI.map(line => (
                                            <tr key={line.lineNumber}>
                                                <td style={{ fontWeight: 600, width: '60px' }}>{line.lineNumber}</td>
                                                <td style={{ fontSize: '13px' }}>{line.description}</td>
                                                <td style={{ textAlign: 'right', fontSize: '13px' }}>{line.proceeds ? formatUsd(line.proceeds) : '—'}</td>
                                                <td style={{ textAlign: 'right', fontSize: '13px' }}>{line.costBasis ? formatUsd(line.costBasis) : '—'}</td>
                                                <td style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: line.gainLoss >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {line.gainLoss ? formatUsd(line.gainLoss) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr style={{ background: 'var(--bg-surface)' }}>
                                            <td colSpan={4} style={{ fontWeight: 700 }}>{t('scheduleD.netShortTerm')}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: scheduleD.netShortTerm >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                {formatUsd(scheduleD.netShortTerm)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Part II: Long-term */}
                            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                                {t('scheduleD.partII')}
                            </h4>
                            <div className="table-container" style={{ border: 'none', marginBottom: '20px' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>{t('scheduleD.line')}</th>
                                            <th>{t('form8949.description')}</th>
                                            <th style={{ textAlign: 'right' }}>{t('form8949.proceeds')}</th>
                                            <th style={{ textAlign: 'right' }}>{t('form8949.basis')}</th>
                                            <th style={{ textAlign: 'right' }}>{t('form8949.gainLoss')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {scheduleD.partII.map(line => (
                                            <tr key={line.lineNumber}>
                                                <td style={{ fontWeight: 600, width: '60px' }}>{line.lineNumber}</td>
                                                <td style={{ fontSize: '13px' }}>{line.description}</td>
                                                <td style={{ textAlign: 'right', fontSize: '13px' }}>{line.proceeds ? formatUsd(line.proceeds) : '—'}</td>
                                                <td style={{ textAlign: 'right', fontSize: '13px' }}>{line.costBasis ? formatUsd(line.costBasis) : '—'}</td>
                                                <td style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: line.gainLoss >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {line.gainLoss ? formatUsd(line.gainLoss) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr style={{ background: 'var(--bg-surface)' }}>
                                            <td colSpan={4} style={{ fontWeight: 700 }}>{t('scheduleD.netLongTerm')}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: scheduleD.netLongTerm >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                {formatUsd(scheduleD.netLongTerm)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Combined + Loss deduction */}
                            <div style={{ padding: '16px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontWeight: 600 }}>{t('scheduleD.combined')}</span>
                                    <span style={{ fontWeight: 700, fontSize: '16px', color: scheduleD.combinedNetGainLoss >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                        {formatUsd(scheduleD.combinedNetGainLoss)}
                                    </span>
                                </div>
                                {scheduleD.capitalLossDeduction > 0 && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>{t('scheduleD.lossDeduction')}</span>
                                            <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                                                ({formatUsd(scheduleD.capitalLossDeduction)})
                                            </span>
                                        </div>
                                        {scheduleD.carryoverLoss > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>{t('scheduleD.carryover')}</span>
                                                <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>
                                                    {formatUsd(scheduleD.carryoverLoss)}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Form 8949 Section */}
                    {form8949 && form8949.lines.length > 0 && (
                        <div className="card" style={{ marginTop: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{t('form8949.title')}</h3>
                                <a
                                    href={getForm8949CsvUrl(year, method, includeWashSales)}
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
                                            <tr key={line.eventId} style={line.adjustmentCode.includes('W') ? { background: 'rgba(255,193,7,0.08)' } : undefined}>
                                                <td><span style={{
                                                    display: 'inline-block', width: '24px', height: '24px',
                                                    lineHeight: '24px', textAlign: 'center',
                                                    background: 'var(--bg-surface)', borderRadius: '4px',
                                                    fontSize: '12px', fontWeight: 600,
                                                }}>{line.box}</span></td>
                                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                                                    {line.description}
                                                    {line.adjustmentCode.includes('W') && (
                                                        <span style={{
                                                            marginLeft: '6px', fontSize: '10px', fontWeight: 600,
                                                            padding: '2px 6px', borderRadius: '3px',
                                                            background: 'rgba(255,193,7,0.2)', color: 'var(--yellow)',
                                                        }}>W</span>
                                                    )}
                                                </td>
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
