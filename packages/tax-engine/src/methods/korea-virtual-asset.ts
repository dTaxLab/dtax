/**
 * Korea Virtual Asset Income Tax Method (가상자산소득세) — VAIA 2023.
 *
 * Uses FIFO lot ordering. The engine returns the raw capital gain/loss;
 * the ₩2.5M annual exemption and 22% tax rate (20% + 2% local surtax)
 * are applied at the UI/reporting layer.
 *
 * Key rules:
 * - FIFO lot matching (identical to standard FIFO)
 * - Annual losses offset same-year gains; losses do NOT carry forward
 * - Annual net gain ≤ ₩2,500,000 (~$1,875 USD) is exempt
 * - Tax rate on excess: 20% national + 2% local = 22%
 * - Engine layer: returns raw gainLoss (same as FIFO); UI layer applies
 *   the exemption threshold and 22% rate display
 *
 * Out of scope (MVP): KRW conversion rate, multi-year loss aggregation,
 * foreign-sourced income distinction (VAIA Article 87-18).
 *
 * Reference: NTS 가상자산소득
 *   https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=6594&cntntsId=8009
 *
 * @license AGPL-3.0
 */

import type { TaxLot, TaxableEvent, CalculationResult } from "../types";
import { calculateFIFO } from "./fifo";

/**
 * Calculate virtual asset income using Korean FIFO rules.
 *
 * This is a thin wrapper around FIFO that tags results with the
 * KR_VIRTUAL_ASSET method identifier. The 22% tax rate and ₩2.5M
 * exemption are displayed in the UI layer.
 *
 * @param lots        Available tax lots (mutated: amount/costBasis reduced)
 * @param event       The taxable disposal event
 * @param strictSilo  If true, only match lots from the same source
 */
export function calculateKoreaVirtualAsset(
  lots: TaxLot[],
  event: TaxableEvent,
  strictSilo: boolean = false,
): CalculationResult {
  const result = calculateFIFO(lots, event, strictSilo);
  return { ...result, method: "KR_VIRTUAL_ASSET" };
}
