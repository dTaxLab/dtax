'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createTransaction } from '@/lib/api';
import { inputStyle, labelStyle, TRANSACTION_TYPES, BUY_TYPES } from './shared';

interface TransactionFormProps {
    onCreated: () => void;
    onCancel: () => void;
}

export function TransactionForm({ onCreated, onCancel }: TransactionFormProps) {
    const t = useTranslations('transactions');
    const tType = useTranslations('txTypes');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [form, setForm] = useState({
        type: 'BUY', timestamp: new Date().toISOString().slice(0, 16),
        asset: '', amount: '', valueUsd: '', feeUsd: '', notes: '',
    });

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setSubmitError(null);
        const isBuy = BUY_TYPES.includes(form.type);
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
            onCreated();
        } catch (e) {
            setSubmitError(e instanceof Error ? e.message : 'Failed to save transaction');
        }
        setSubmitting(false);
    }

    return (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                    <label style={labelStyle}>{t('form.type')}</label>
                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                        {TRANSACTION_TYPES.map(tp => (
                            <option key={tp} value={tp}>{tType(tp)}</option>
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
            {submitError && (
                <div style={{ marginTop: '12px', padding: '12px 16px', background: 'var(--red-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--red-light)', fontSize: '14px' }}>
                    {submitError}
                </div>
            )}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? t('saving') : t('save')}
                </button>
            </div>
        </form>
    );
}
