'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getTransactions, getTransactionExportUrl } from '@/lib/api';
import type { Transaction } from '@/lib/api';
import { ImportPanel } from './components/ImportPanel';
import { ApiSyncPanel } from './components/ApiSyncPanel';
import { TransactionForm } from './components/TransactionForm';
import { TransactionTable } from './components/TransactionTable';

export default function TransactionsPage() {
    const t = useTranslations('transactions');

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 0, limit: 20 });
    const [loading, setLoading] = useState(true);
    const [activePanel, setActivePanel] = useState<'none' | 'form' | 'import' | 'api'>('none');

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

    function togglePanel(panel: 'form' | 'import' | 'api') {
        setActivePanel(prev => prev === panel ? 'none' : panel);
    }

    return (
        <div className="animate-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('title')}</h1>
                    <p className="page-subtitle">{t('totalCount', { count: meta.total })}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <a href={getTransactionExportUrl()} download className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                        {t('exportCsv')}
                    </a>
                    <button className="btn btn-secondary" onClick={() => togglePanel('api')}>
                        {activePanel === 'api' ? t('cancel') : t('connectApi')}
                    </button>
                    <button className="btn btn-secondary" onClick={() => togglePanel('import')}>
                        {activePanel === 'import' ? t('cancel') : t('importCsv')}
                    </button>
                    <button className="btn btn-primary" onClick={() => togglePanel('form')}>
                        {activePanel === 'form' ? t('cancel') : t('addTransaction')}
                    </button>
                </div>
            </div>

            {activePanel === 'import' && (
                <ImportPanel onImported={() => loadPage(1)} />
            )}

            {activePanel === 'api' && (
                <ApiSyncPanel onSynced={() => loadPage(1)} />
            )}

            {activePanel === 'form' && (
                <TransactionForm
                    onCreated={() => { setActivePanel('none'); loadPage(1); }}
                    onCancel={() => setActivePanel('none')}
                />
            )}

            {loading ? (
                <div className="card loading-pulse" style={{ textAlign: 'center', padding: '48px' }}>{t('loading')}</div>
            ) : transactions.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                    <p style={{ color: 'var(--text-muted)' }}>{t('noTransactions')}</p>
                </div>
            ) : (
                <TransactionTable
                    transactions={transactions}
                    meta={meta}
                    onPageChange={loadPage}
                    onRefresh={() => loadPage(meta.page)}
                />
            )}
        </div>
    );
}
