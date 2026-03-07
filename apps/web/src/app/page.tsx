'use client';

import { useEffect, useState } from 'react';
import { getTransactions, getTaxSummary, calculateTax } from '@/lib/api';
import type { Transaction, TaxSummary } from '@/lib/api';

function formatUsd(value: number | string | null): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function formatAmount(value: string | null, asset: string | null): string {
  if (!value || !asset) return '—';
  const num = parseFloat(value);
  return `${num.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${asset}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function getBadgeClass(type: string): string {
  if (['BUY', 'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD'].includes(type)) return 'badge badge-buy';
  if (['SELL', 'LIQUIDATION'].includes(type)) return 'badge badge-sell';
  if (['TRADE'].includes(type)) return 'badge badge-trade';
  return 'badge badge-other';
}

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txMeta, setTxMeta] = useState({ total: 0, page: 1, totalPages: 0 });
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [txRes, taxRes] = await Promise.allSettled([
        getTransactions(1, 10),
        getTaxSummary(2025),
      ]);

      if (txRes.status === 'fulfilled') {
        setTransactions(txRes.value.data);
        setTxMeta(txRes.value.meta);
      }
      if (taxRes.status === 'fulfilled') {
        setTaxSummary(taxRes.value.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }

  async function handleCalculate() {
    setCalculating(true);
    try {
      const res = await calculateTax(2025, 'FIFO');
      setTaxSummary(res.data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div className="loading-pulse" style={{ fontSize: '48px' }}>🧮</div>
        <p style={{ color: 'var(--text-muted)', marginTop: '16px' }}>Loading DTax...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <p style={{ color: 'var(--red)' }}>{error}</p>
        <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '14px' }}>
          Make sure the API is running: <code>pnpm --filter @dtax/api dev</code>
        </p>
        <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={loadData}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Tax Year 2025 · FIFO Method</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleCalculate}
          disabled={calculating}
        >
          {calculating ? '⏳ Calculating...' : '🧮 Calculate Tax'}
        </button>
      </div>

      {/* ── Tax Summary Cards ── */}
      <div className="grid-4" style={{ marginBottom: '32px' }}>
        <div className="stat-card">
          <span className="stat-label">Net Gain / Loss</span>
          <span className={`stat-value ${taxSummary && taxSummary.netGainLoss >= 0 ? 'positive' : 'negative'}`}>
            {taxSummary ? formatUsd(taxSummary.netGainLoss) : '—'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Long-Term Gains</span>
          <span className="stat-value positive">
            {taxSummary ? formatUsd(taxSummary.longTermGains) : '—'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Short-Term Gains</span>
          <span className="stat-value positive">
            {taxSummary ? formatUsd(taxSummary.shortTermGains) : '—'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Transactions</span>
          <span className="stat-value neutral">{txMeta.total}</span>
        </div>
      </div>

      {/* ── Transactions Table ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Recent Transactions</h2>
        <a href="/transactions" className="btn btn-secondary" style={{ fontSize: '13px' }}>
          View All →
        </a>
      </div>

      {transactions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <p style={{ color: 'var(--text-muted)' }}>No transactions yet</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>
            Import transactions via CSV or add them manually
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th style={{ textAlign: 'right' }}>Value (USD)</th>
                <th style={{ textAlign: 'right' }}>Gain/Loss</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const asset = tx.receivedAsset || tx.sentAsset || '—';
                const amount = tx.receivedAmount || tx.sentAmount;
                const value = tx.receivedValueUsd || tx.sentValueUsd;
                return (
                  <tr key={tx.id}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatDate(tx.timestamp)}
                    </td>
                    <td>
                      <span className={getBadgeClass(tx.type)}>{tx.type}</span>
                    </td>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{asset}</td>
                    <td className="mono">{formatAmount(amount, asset)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{formatUsd(value)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">
                      {tx.gainLoss ? (
                        <span style={{ color: parseFloat(tx.gainLoss) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {formatUsd(tx.gainLoss)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        marginTop: '48px',
        paddingTop: '24px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '13px',
        color: 'var(--text-muted)',
        paddingBottom: '24px',
      }}>
        <span>DTax v0.1.0 · Open Source Tax Engine (AGPL-3.0)</span>
        <span>
          <a href="https://github.com/Phosmax/dtax" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            GitHub
          </a>
          {' · '}
          <a href="https://dtax.dev" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            Docs
          </a>
        </span>
      </div>
    </div>
  );
}
