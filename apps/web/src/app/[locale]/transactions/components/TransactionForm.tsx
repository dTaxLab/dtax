'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createTransaction } from '@/lib/api';
import { inputStyle, labelStyle, TRANSACTION_TYPES, BUY_TYPES, TWO_SIDED_TYPES, NFT_TYPES } from './shared';

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
        type: 'BUY',
        timestamp: new Date().toISOString().slice(0, 16),
        // Single-sided fields
        asset: '', amount: '', valueUsd: '',
        // Two-sided fields
        sentAsset: '', sentAmount: '', sentValueUsd: '',
        receivedAsset: '', receivedAmount: '', receivedValueUsd: '',
        // NFT fields
        nftCollection: '', nftTokenId: '',
        // Common
        feeUsd: '', notes: '',
    });

    const isTwoSided = TWO_SIDED_TYPES.includes(form.type);
    const isNft = NFT_TYPES.includes(form.type);
    const isBuy = BUY_TYPES.includes(form.type);

    function handleTypeChange(newType: string) {
        setForm({ ...form, type: newType });
    }

    /** Compose NFT asset ID from collection + tokenId */
    function getNftAsset(): string {
        if (form.nftCollection && form.nftTokenId) {
            return `NFT:${form.nftCollection}:${form.nftTokenId}`;
        }
        if (form.nftCollection) return `NFT:${form.nftCollection}`;
        return '';
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setSubmitError(null);

        const body: Record<string, unknown> = {
            type: form.type,
            timestamp: new Date(form.timestamp).toISOString(),
            notes: form.notes || undefined,
        };

        if (isTwoSided) {
            // Two-sided: both sent and received
            body.sentAsset = form.sentAsset;
            body.sentAmount = parseFloat(form.sentAmount);
            body.sentValueUsd = parseFloat(form.sentValueUsd);
            body.receivedAsset = isNft ? getNftAsset() : form.receivedAsset;
            body.receivedAmount = parseFloat(form.receivedAmount);
            body.receivedValueUsd = parseFloat(form.receivedValueUsd);
        } else if (isNft && !isBuy) {
            // NFT_SALE: selling an NFT (sent side)
            body.sentAsset = getNftAsset();
            body.sentAmount = parseFloat(form.amount);
            body.sentValueUsd = parseFloat(form.valueUsd);
        } else if (isNft && isBuy) {
            // NFT_MINT: receiving an NFT (received side)
            body.receivedAsset = getNftAsset();
            body.receivedAmount = parseFloat(form.amount);
            body.receivedValueUsd = parseFloat(form.valueUsd);
        } else if (isBuy) {
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
            {/* Row 1: Type + DateTime */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                    <label style={labelStyle}>{t('form.type')}</label>
                    <select value={form.type} onChange={e => handleTypeChange(e.target.value)} style={inputStyle}>
                        {TRANSACTION_TYPES.map(tp => (
                            <option key={tp} value={tp}>{tType(tp)}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>{t('form.dateTime')}</label>
                    <input type="datetime-local" value={form.timestamp}
                        onChange={e => setForm({ ...form, timestamp: e.target.value })}
                        required style={inputStyle} />
                </div>
            </div>

            {/* Two-sided form (DEX_SWAP, TRADE, NFT_PURCHASE, LP_DEPOSIT, LP_WITHDRAWAL) */}
            {isTwoSided && (
                <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {/* Sent side */}
                    <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--red)', marginBottom: '10px' }}>
                            {t('form.sentAsset')}
                        </div>
                        <div style={{ display: 'grid', gap: '10px' }}>
                            <div>
                                <label style={labelStyle}>{t('form.asset')}</label>
                                <input placeholder={t('form.assetPlaceholder')} value={form.sentAsset}
                                    onChange={e => setForm({ ...form, sentAsset: e.target.value.toUpperCase() })}
                                    required style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>{t('form.amount')}</label>
                                <input type="number" step="any" placeholder="0.00" value={form.sentAmount}
                                    onChange={e => setForm({ ...form, sentAmount: e.target.value })}
                                    required style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>{t('form.valueUsd')}</label>
                                <input type="number" step="any" placeholder="0.00" value={form.sentValueUsd}
                                    onChange={e => setForm({ ...form, sentValueUsd: e.target.value })}
                                    required style={inputStyle} />
                            </div>
                        </div>
                    </div>
                    {/* Received side */}
                    <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--green)', marginBottom: '10px' }}>
                            {t('form.receivedAsset')}
                        </div>
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {isNft ? (
                                <>
                                    <div>
                                        <label style={labelStyle}>{t('form.nftCollection')}</label>
                                        <input placeholder={t('form.nftCollectionPlaceholder')} value={form.nftCollection}
                                            onChange={e => setForm({ ...form, nftCollection: e.target.value.toUpperCase() })}
                                            required style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>{t('form.nftTokenId')}</label>
                                        <input placeholder={t('form.nftTokenIdPlaceholder')} value={form.nftTokenId}
                                            onChange={e => setForm({ ...form, nftTokenId: e.target.value })}
                                            required style={inputStyle} />
                                    </div>
                                </>
                            ) : (
                                <div>
                                    <label style={labelStyle}>{t('form.asset')}</label>
                                    <input placeholder={t('form.assetPlaceholder')} value={form.receivedAsset}
                                        onChange={e => setForm({ ...form, receivedAsset: e.target.value.toUpperCase() })}
                                        required style={inputStyle} />
                                </div>
                            )}
                            <div>
                                <label style={labelStyle}>{t('form.amount')}</label>
                                <input type="number" step="any" placeholder="0.00" value={form.receivedAmount}
                                    onChange={e => setForm({ ...form, receivedAmount: e.target.value })}
                                    required style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>{t('form.valueUsd')}</label>
                                <input type="number" step="any" placeholder="0.00" value={form.receivedValueUsd}
                                    onChange={e => setForm({ ...form, receivedValueUsd: e.target.value })}
                                    required style={inputStyle} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Single-sided form (BUY, SELL, NFT_MINT, NFT_SALE, etc.) */}
            {!isTwoSided && (
                <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    {isNft ? (
                        <>
                            <div>
                                <label style={labelStyle}>{t('form.nftCollection')}</label>
                                <input placeholder={t('form.nftCollectionPlaceholder')} value={form.nftCollection}
                                    onChange={e => setForm({ ...form, nftCollection: e.target.value.toUpperCase() })}
                                    required style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>{t('form.nftTokenId')}</label>
                                <input placeholder={t('form.nftTokenIdPlaceholder')} value={form.nftTokenId}
                                    onChange={e => setForm({ ...form, nftTokenId: e.target.value })}
                                    required style={inputStyle} />
                            </div>
                        </>
                    ) : (
                        <div>
                            <label style={labelStyle}>{t('form.asset')}</label>
                            <input placeholder={t('form.assetPlaceholder')} value={form.asset}
                                onChange={e => setForm({ ...form, asset: e.target.value.toUpperCase() })}
                                required style={inputStyle} />
                        </div>
                    )}
                    <div>
                        <label style={labelStyle}>{t('form.amount')}</label>
                        <input type="number" step="any" placeholder="0.00" value={form.amount}
                            onChange={e => setForm({ ...form, amount: e.target.value })}
                            required style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>{t('form.valueUsd')}</label>
                        <input type="number" step="any" placeholder="0.00" value={form.valueUsd}
                            onChange={e => setForm({ ...form, valueUsd: e.target.value })}
                            required style={inputStyle} />
                    </div>
                </div>
            )}

            {/* Fee + Notes (always shown) */}
            <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                    <label style={labelStyle}>{t('form.feeUsd')}</label>
                    <input type="number" step="any" placeholder="0.00" value={form.feeUsd}
                        onChange={e => setForm({ ...form, feeUsd: e.target.value })}
                        style={inputStyle} />
                </div>
                <div>
                    <label style={labelStyle}>{t('form.notes')}</label>
                    <input placeholder="" value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                        style={inputStyle} />
                </div>
            </div>

            {/* NFT preview */}
            {isNft && form.nftCollection && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Asset ID: <code style={{ color: 'var(--accent)' }}>{getNftAsset()}</code>
                </div>
            )}

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
