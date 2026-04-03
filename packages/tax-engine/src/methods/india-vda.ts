/**
 * India VDA (Virtual Digital Asset) Tax Method — Income Tax Act s.115BBH.
 *
 * Uses FIFO lot ordering. Each disposal is taxed independently at a flat 30%
 * rate; losses from one VDA cannot offset gains from another, and losses
 * cannot be carried forward. The engine enforces this by zeroing any negative
 * per-disposal gain: gainLoss = Math.max(rawGain, 0).
 *
 * Key rules:
 * - FIFO lot matching
 * - Flat 30% rate on gains (+ 4% health/education cess = effective 31.2%)
 * - Losses are NOT deductible — each disposal is taxed independently
 * - Engine layer: gainLoss = max(rawFIFOGain, 0); UI layer shows 30% rate
 * - 1% TDS on buyer side (Sec 194S) — not an engine concern
 * - Gift exemptions apply above ₹50,000 threshold — not modeled (MVP)
 *
 * Out of scope (MVP): gift exemption threshold, 194S TDS reconciliation,
 * cross-asset loss netting within same disposal (e.g., multi-asset swap).
 *
 * Reference: Income Tax Act s.115BBH
 *   https://incometaxindia.gov.in/Pages/acts/income-tax-act.aspx
 *
 * @license AGPL-3.0
 */

import type { TaxLot, TaxableEvent, CalculationResult } from "../types";
import { calculateFIFO } from "./fifo";

/**
 * Calculate virtual digital asset income using Indian tax rules.
 *
 * Wraps FIFO and zeroes any loss — under s.115BBH, losses from VDA
 * disposals are not deductible against any income.
 *
 * @param lots        Available tax lots (mutated: amount/costBasis reduced)
 * @param event       The taxable disposal event
 * @param strictSilo  If true, only match lots from the same source
 */
export function calculateIndiaVDA(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  const result = calculateFIFO(lots, event, strictSilo);
  // s.115BBH: VDA losses are not deductible — zero out any negative gain
  return {
    ...result,
    gainLoss: Math.max(result.gainLoss, 0),
    method: "IN_VDA",
  };
}
