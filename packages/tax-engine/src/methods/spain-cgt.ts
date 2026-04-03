/**
 * Spain CGT (Ganancias y Pérdidas Patrimoniales) Method — IRPF/AEAT.
 *
 * Uses FIFO lot ordering (same as standard FIFO). The tiered tax rates
 * (19%/21%/23%/27%) and annual loss carry-forward rules are applied
 * at the UI/reporting layer only.
 *
 * Key rules:
 * - FIFO lot matching (identical to standard FIFO)
 * - No distinction between short-term and long-term holding periods
 *   (all crypto disposals taxed as capital gains regardless of holding)
 * - Annual net gain taxed at progressive rates:
 *     ≤€6,000:         19%
 *     €6,001–€50,000:  21%
 *     €50,001–€200,000: 23%
 *     >€200,000:       27%  (introduced from 2024)
 * - Annual losses may offset same-year capital gains; up to 4-year
 *   carry-forward allowed
 * - Engine layer: returns raw gainLoss (same as FIFO); UI layer displays
 *   the tiered rate calculation table
 *
 * Out of scope (MVP): loss carry-forward tracking across years,
 * €6,000 first-bracket optimisation, regional surcharges (CCAA).
 *
 * Reference: AEAT Ganancias patrimoniales
 *   https://sede.agenciatributaria.gob.es
 *
 * @license AGPL-3.0
 */

import type { TaxLot, TaxableEvent, CalculationResult } from "../types";
import { calculateFIFO } from "./fifo";

/**
 * Calculate capital gains/losses using Spanish IRPF rules.
 *
 * This is a thin wrapper around FIFO that tags results with the
 * ES_CGT method identifier. The tiered 19–27% rates are displayed
 * in the UI layer.
 *
 * @param lots        Available tax lots (mutated: amount/costBasis reduced)
 * @param event       The taxable disposal event
 * @param strictSilo  If true, only match lots from the same source
 */
export function calculateSpainCGT(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  const result = calculateFIFO(lots, event, strictSilo);
  return { ...result, method: "ES_CGT" };
}
