'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { getTransactions, getTransactionExportUrl, downloadJsonBackup } from '@/lib/api';
import type { Transaction, TransactionFilters, SortField, SortOrder } from '@/lib/api';
import { ImportPanel } from './components/ImportPanel';
import { ApiSyncPanel } from './components/ApiSyncPanel';
import { TransactionForm } from './components/TransactionForm';
import { TransactionTable } from './components/TransactionTable';
import { FilterBar } from './components/FilterBar';

export default function TransactionsPage() {
    const t = useTranslations('transactions');

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 0, limit: 20 });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activePanel, setActivePanel] = useState<'none' | 'form' | 'import' | 'api'>('none');
    const filtersRef = useRef<TransactionFilters>({});
    const [sortField, setSortField] = useState<SortField>('timestamp');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    useEffect(() => { loadPage(1); }, []);

    async function loadPage(page: number, filters?: TransactionFilters, sort?: SortField, order?: SortOrder) {
        if (filters !== undefined) filtersRef.current = filters;
        const s = sort ?? sortField;
        const o = order ?? sortOrder;
        setLoading(true);
        setLoadError(null);
        try {
            const res = await getTransactions(page, 20, filtersRef.current, s, o);
            setTransactions(res.data);
            setMeta(res.meta);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'Failed to load transactions');
        }
        setLoading(false);
    }

    function togglePanel(panel: 'form' | 'import' | 'api') {
        setActivePanel(prev => prev === panel ? 'none' : panel);
    }

    function handleFilter(filters: TransactionFilters) {
        loadPage(1, filters);
    }

    function handleSort(field: SortField) {
        const newOrder: SortOrder = field === sortField && sortOrder === 'desc' ? 'asc' : 'desc';
        setSortField(field);
        setSortOrder(newOrder);
        loadPage(1, undefined, field, newOrder);
    }

    return (
        <div className="animate-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('title')}</h1>
                    <p className="page-subtitle">{t('totalCount', { count: meta.total })}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={() => downloadJsonBackup().catch(() => {})}>
                        {t('exportJson')}
                    </button>
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

            <FilterBar onApply={handleFilter} />

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

            {loadError && (
                <div className="card" style={{ padding: '16px', marginBottom: '16px', background: 'var(--red-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--red-light)', fontSize: '14px' }}>
                    {loadError}
                </div>
            )}

            {loading ? (
                <div className="card loading-pulse" style={{ textAlign: 'center', padding: '48px' }}>{t('loading')}</div>
            ) : transactions.length === 0 && !loadError ? (
                <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                    <p style={{ color: 'var(--text-muted)' }}>{t('noTransactions')}</p>
                </div>
            ) : (
                <TransactionTable
                    transactions={transactions}
                    meta={meta}
                    onPageChange={(p) => loadPage(p)}
                    onRefresh={() => loadPage(meta.page)}
                    sortField={sortField}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                />
            )}
        </div>
    );
}
