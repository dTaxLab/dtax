'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { importCsv } from '@/lib/api';
import type { ImportResult } from '@/lib/api';
import { inputStyle, labelStyle } from './shared';

interface ImportPanelProps {
    onImported: () => void;
}

export function ImportPanel({ onImported }: ImportPanelProps) {
    const t = useTranslations('transactions');
    const fileRef = useRef<HTMLInputElement>(null);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importFormat, setImportFormat] = useState('');
    const [sourceName, setSourceName] = useState('');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

    async function handleImport() {
        if (!importFile) {
            setImportError(t('import.noFile'));
            return;
        }
        setImporting(true);
        setImportError(null);
        setImportResult(null);
        try {
            const res = await importCsv(importFile, importFormat || undefined, sourceName || undefined);
            setImportResult(res.data);
            onImported();
        } catch (e) {
            setImportError(e instanceof Error ? e.message : 'Import failed');
        }
        setImporting(false);
    }

    return (
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
                        style={{ ...inputStyle, padding: '7px 12px', cursor: 'pointer' }}
                    />
                </div>
                <div style={{ minWidth: '160px' }}>
                    <label style={labelStyle}>{t('import.sourceLabel')}</label>
                    <input
                        placeholder={t('import.sourcePlaceholder')}
                        value={sourceName}
                        onChange={e => setSourceName(e.target.value)}
                        style={inputStyle}
                    />
                </div>
                <div style={{ minWidth: '160px' }}>
                    <label style={labelStyle}>{t('import.formatLabel')}</label>
                    <select value={importFormat} onChange={e => setImportFormat(e.target.value)} style={inputStyle}>
                        <option value="">{t('import.autoDetect')}</option>
                        <option value="coinbase">Coinbase</option>
                        <option value="binance">Binance (International)</option>
                        <option value="binance_us">Binance US</option>
                        <option value="etherscan">Etherscan (ETH Transactions)</option>
                        <option value="etherscan_erc20">Etherscan (ERC-20 Tokens)</option>
                        <option value="generic">Generic CSV</option>
                    </select>
                </div>
                <button className="btn btn-primary" onClick={handleImport} disabled={importing || !importFile}>
                    {importing ? t('import.uploading') : t('import.upload')}
                </button>
            </div>

            {importError && (
                <div style={{ marginTop: '12px', padding: '12px 16px', background: 'var(--red-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--red-light)', fontSize: '14px' }}>
                    {importError}
                </div>
            )}

            {importResult && (
                <div style={{ marginTop: '12px', padding: '16px', background: 'var(--green-bg)', borderRadius: 'var(--radius-sm)' }}>
                    <p style={{ color: 'var(--green-light)', fontWeight: 600, fontSize: '14px' }}>
                        {t('import.success', { count: importResult.imported })}
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                        Format: {importResult.summary.format} · {importResult.summary.totalRows} rows · {importResult.summary.parsed} parsed
                        {importResult.skipped ? ` · ${t('import.skipped', { count: importResult.skipped })}` : ''}
                    </p>
                    {importResult.errors.length > 0 && (
                        <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--yellow-bg)', borderRadius: 'var(--radius-sm)' }}>
                            <p style={{ color: 'var(--yellow)', fontSize: '12px', fontWeight: 600 }}>
                                {t('import.errors', { count: importResult.errors.length })}
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
    );
}
