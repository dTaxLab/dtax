'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createConnection, getConnections, syncConnection } from '@/lib/api';
import { inputStyle, labelStyle, formatDate } from './shared';

interface ApiSyncPanelProps {
    onSynced: () => void;
}

export function ApiSyncPanel({ onSynced }: ApiSyncPanelProps) {
    const t = useTranslations('transactions');
    const [connections, setConnections] = useState<{ id: string; name: string; status: string; lastSyncAt: string | null; createdAt: string }[]>([]);
    const [apiForm, setApiForm] = useState({ exchangeId: 'binance', apiKey: '', apiSecret: '', apiPassword: '' });
    const [apiError, setApiError] = useState<string | null>(null);
    const [apiConnecting, setApiConnecting] = useState(false);
    const [apiSyncing, setApiSyncing] = useState<string | null>(null);

    useEffect(() => { loadConnections(); }, []);

    async function loadConnections() {
        try {
            const res = await getConnections();
            setConnections(res.data);
        } catch { /* ignore */ }
    }

    async function handleConnectApi(e: React.FormEvent) {
        e.preventDefault();
        setApiConnecting(true);
        setApiError(null);
        try {
            await createConnection(apiForm);
            setApiForm({ exchangeId: 'binance', apiKey: '', apiSecret: '', apiPassword: '' });
            await loadConnections();
        } catch (e) {
            setApiError(e instanceof Error ? e.message : 'Connection failed');
        }
        setApiConnecting(false);
    }

    async function handleSync(id: string) {
        setApiSyncing(id);
        try {
            await syncConnection(id);
            await loadConnections();
            onSynced();
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Sync failed');
        }
        setApiSyncing(null);
    }

    return (
        <div className="card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '32px' }}>
                {/* Connection Form */}
                <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>{t('apiSync.title')}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>{t('apiSync.description')}</p>

                    <form onSubmit={handleConnectApi} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={labelStyle}>{t('apiSync.exchange')}</label>
                            <select value={apiForm.exchangeId} onChange={e => setApiForm({ ...apiForm, exchangeId: e.target.value })} style={inputStyle}>
                                <option value="binance">Binance</option>
                                <option value="okx">OKX</option>
                                <option value="coinbase">Coinbase</option>
                                <option value="kraken">Kraken</option>
                                <option value="huobi">HTX (Huobi)</option>
                                <option value="kucoin">KuCoin</option>
                                <option value="bybit">Bybit</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>{t('apiSync.apiKey')}</label>
                            <input type="text" required value={apiForm.apiKey} onChange={e => setApiForm({ ...apiForm, apiKey: e.target.value })} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>{t('apiSync.apiSecret')}</label>
                            <input type="password" required value={apiForm.apiSecret} onChange={e => setApiForm({ ...apiForm, apiSecret: e.target.value })} style={inputStyle} />
                        </div>
                        {(apiForm.exchangeId === 'okx' || apiForm.exchangeId === 'kucoin') && (
                            <div>
                                <label style={labelStyle}>{t('apiSync.apiPassword')}</label>
                                <input type="password" required value={apiForm.apiPassword} onChange={e => setApiForm({ ...apiForm, apiPassword: e.target.value })} style={inputStyle} />
                            </div>
                        )}
                        {apiError && <div style={{ color: 'var(--red-light)', fontSize: '13px' }}>{apiError}</div>}
                        <button type="submit" className="btn btn-primary" disabled={apiConnecting}>
                            {apiConnecting ? t('apiSync.connecting') : t('apiSync.connect')}
                        </button>
                    </form>
                </div>

                {/* Connection List */}
                <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{t('apiSync.myConnections')}</h3>
                    {connections.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: '13px' }}>
                            No active connections
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {connections.map(c => (
                                <div key={c.id} style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{c.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {c.lastSyncAt ? t('apiSync.lastSync', { time: formatDate(c.lastSyncAt) }) : 'Never synced'}
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => handleSync(c.id)}
                                        disabled={apiSyncing === c.id}
                                        style={{ fontSize: '12px', padding: '6px 12px' }}
                                    >
                                        {apiSyncing === c.id ? t('apiSync.syncing') : t('apiSync.sync')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
