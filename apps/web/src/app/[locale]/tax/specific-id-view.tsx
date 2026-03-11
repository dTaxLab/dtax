"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  getAvailableLots,
  getTransactions,
  calculateSpecific,
} from "@/lib/api";
import type { AvailableLot, SpecificIdSelection, Transaction } from "@/lib/api";
import { useFiatFormatter } from "@/lib/use-fiat";

const DISPOSITION_TYPES = ["SELL", "TRADE", "MARGIN_TRADE", "LIQUIDATION"];

interface Props {
  year: number;
}

interface LotAllocation {
  lotId: string;
  amount: number;
}

interface EventSelection {
  event: Transaction;
  allocations: LotAllocation[];
}

export default function SpecificIdView({ year }: Props) {
  const t = useTranslations("tax");
  const tSid = useTranslations("specificId");
  const { formatFiat } = useFiatFormatter();

  const [lots, setLots] = useState<AvailableLot[]>([]);
  const [events, setEvents] = useState<Transaction[]>([]);
  const [selections, setSelections] = useState<EventSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<
    Array<{
      event: { id: string; asset: string; amount: number; proceedsUsd: number };
      matchedLots: Array<{
        lotId: string;
        amount: number;
        costBasisUsd: number;
      }>;
      gainLoss: number;
      holdingPeriod: "SHORT_TERM" | "LONG_TERM";
    }>
  >([]);

  useEffect(() => {
    loadData();
  }, [year]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [lotsRes, txRes] = await Promise.all([
        getAvailableLots(year),
        getTransactions(1, 500, {
          type: DISPOSITION_TYPES.join(","),
          from: `${year}-01-01`,
          to: `${year}-12-31`,
        }),
      ]);
      setLots(lotsRes.data.lots);
      setEvents(txRes.data);
      setSelections(txRes.data.map((ev) => ({ event: ev, allocations: [] })));
      setResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    }
    setLoading(false);
  }

  function getLotsForAsset(asset: string) {
    return lots.filter((l) => l.asset === asset);
  }

  function addLot(eventIndex: number, lotId: string) {
    setSelections((prev) => {
      const updated = [...prev];
      const sel = { ...updated[eventIndex] };
      if (sel.allocations.some((a) => a.lotId === lotId)) return prev;
      sel.allocations = [...sel.allocations, { lotId, amount: 0 }];
      updated[eventIndex] = sel;
      return updated;
    });
  }

  function updateLotAmount(eventIndex: number, lotId: string, amount: number) {
    setSelections((prev) => {
      const updated = [...prev];
      const sel = { ...updated[eventIndex] };
      sel.allocations = sel.allocations.map((a) =>
        a.lotId === lotId ? { ...a, amount } : a,
      );
      updated[eventIndex] = sel;
      return updated;
    });
  }

  function removeLot(eventIndex: number, lotId: string) {
    setSelections((prev) => {
      const updated = [...prev];
      const sel = { ...updated[eventIndex] };
      sel.allocations = sel.allocations.filter((a) => a.lotId !== lotId);
      updated[eventIndex] = sel;
      return updated;
    });
  }

  function getEventAsset(ev: Transaction) {
    return ev.sentAsset || "";
  }

  function getEventAmount(ev: Transaction) {
    return Number(ev.sentAmount || 0);
  }

  async function handleCalculate() {
    const apiSelections: SpecificIdSelection[] = selections
      .filter((s) => s.allocations.length > 0)
      .map((s) => ({
        eventId: s.event.id,
        lots: s.allocations.filter((a) => a.amount > 0),
      }));

    if (apiSelections.length === 0) {
      setError(tSid("noSelections"));
      return;
    }

    setCalculating(true);
    setError(null);
    try {
      const res = await calculateSpecific(year, apiSelections);
      setResults(res.data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calculation failed");
    }
    setCalculating(false);
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: "32px", textAlign: "center" }}>
        {tSid("loading")}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="card" style={{ padding: "24px" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
          {tSid("noDispositions")}
        </p>
      </div>
    );
  }

  const totalGainLoss = results.reduce((s, r) => s + r.gainLoss, 0);

  return (
    <div>
      {error && (
        <div
          className="card"
          style={{
            padding: "12px 16px",
            marginBottom: "16px",
            borderLeft: "3px solid var(--red)",
            color: "var(--red)",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      <div className="card" style={{ marginBottom: "16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 600 }}>
              {tSid("title")}
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              {tSid("subtitle", { count: events.length })}
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleCalculate}
            disabled={calculating}
          >
            {calculating ? tSid("calculating") : tSid("calculate")}
          </button>
        </div>
      </div>

      {/* Disposition events with lot selectors */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {selections.map((sel, idx) => {
          const asset = getEventAsset(sel.event);
          const needed = getEventAmount(sel.event);
          const allocated = sel.allocations.reduce((s, a) => s + a.amount, 0);
          const availableLots = getLotsForAsset(asset);
          const isComplete = Math.abs(allocated - needed) < 0.000001;

          return (
            <div
              key={sel.event.id}
              className="card"
              style={{
                borderLeft: `3px solid ${isComplete ? "var(--green)" : "var(--border)"}`,
              }}
            >
              {/* Event header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {sel.event.type} {needed} {asset}
                  </span>
                  <span
                    style={{
                      marginLeft: "12px",
                      fontSize: "13px",
                      color: "var(--text-muted)",
                    }}
                  >
                    {new Date(sel.event.timestamp).toLocaleDateString()}
                  </span>
                  {sel.event.sentValueUsd && (
                    <span
                      style={{
                        marginLeft: "12px",
                        fontSize: "13px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {tSid("proceeds")}:{" "}
                      {formatFiat(Number(sel.event.sentValueUsd))}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: isComplete ? "var(--green)" : "var(--yellow)",
                  }}
                >
                  {allocated.toFixed(6)} / {needed.toFixed(6)} {asset}
                </div>
              </div>

              {/* Allocated lots */}
              {sel.allocations.length > 0 && (
                <div
                  style={{
                    marginBottom: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {sel.allocations.map((alloc) => {
                    const lot = lots.find((l) => l.id === alloc.lotId);
                    return (
                      <div
                        key={alloc.lotId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 12px",
                          background: "var(--bg-surface)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "13px",
                        }}
                      >
                        <span
                          style={{
                            color: "var(--text-muted)",
                            minWidth: "120px",
                          }}
                        >
                          {lot
                            ? new Date(lot.acquiredAt).toLocaleDateString()
                            : alloc.lotId.slice(0, 8)}
                        </span>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            minWidth: "100px",
                          }}
                        >
                          {lot ? `${lot.amount} ${asset}` : ""}
                        </span>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            minWidth: "80px",
                          }}
                        >
                          @{" "}
                          {lot
                            ? formatFiat(lot.costBasisUsd / lot.amount)
                            : "—"}
                        </span>
                        <input
                          type="number"
                          value={alloc.amount || ""}
                          onChange={(e) =>
                            updateLotAmount(
                              idx,
                              alloc.lotId,
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          min={0}
                          max={lot?.amount || undefined}
                          step="any"
                          style={{
                            width: "120px",
                            padding: "4px 8px",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            fontSize: "13px",
                          }}
                          placeholder={tSid("amount")}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => removeLot(idx, alloc.lotId)}
                          style={{ padding: "2px 8px", fontSize: "12px" }}
                        >
                          X
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add lot dropdown */}
              {availableLots.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      addLot(idx, e.target.value);
                      e.target.value = "";
                    }
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    {tSid("addLot")}
                  </option>
                  {availableLots
                    .filter(
                      (l) => !sel.allocations.some((a) => a.lotId === l.id),
                    )
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {new Date(l.acquiredAt).toLocaleDateString()} —{" "}
                        {l.amount} {l.asset} @{" "}
                        {formatFiat(l.costBasisUsd / l.amount)}/unit
                      </option>
                    ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card" style={{ marginTop: "24px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "16px",
            }}
          >
            {tSid("results")}
          </h3>
          <div className="table-container" style={{ border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("form8949.description")}</th>
                  <th style={{ textAlign: "right" }}>
                    {t("form8949.proceeds")}
                  </th>
                  <th style={{ textAlign: "right" }}>{t("form8949.basis")}</th>
                  <th style={{ textAlign: "right" }}>
                    {t("form8949.gainLoss")}
                  </th>
                  <th>{tSid("holding")}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.event.id}>
                    <td style={{ fontWeight: 500 }}>
                      {r.event.amount} {r.event.asset}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatFiat(r.event.proceedsUsd)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatFiat(
                        r.matchedLots.reduce((s, l) => s + l.costBasisUsd, 0),
                      )}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 600,
                        color: r.gainLoss >= 0 ? "var(--green)" : "var(--red)",
                      }}
                    >
                      {formatFiat(r.gainLoss)}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "12px",
                          padding: "2px 8px",
                          borderRadius: "3px",
                          background:
                            r.holdingPeriod === "LONG_TERM"
                              ? "rgba(34,197,94,0.1)"
                              : "rgba(59,130,246,0.1)",
                          color:
                            r.holdingPeriod === "LONG_TERM"
                              ? "var(--green)"
                              : "var(--blue)",
                        }}
                      >
                        {r.holdingPeriod === "LONG_TERM"
                          ? t("longTerm")
                          : t("shortTerm")}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "var(--bg-surface)" }}>
                  <td colSpan={3} style={{ fontWeight: 700 }}>
                    {t("total")}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      fontSize: "15px",
                      color: totalGainLoss >= 0 ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {formatFiat(totalGainLoss)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
