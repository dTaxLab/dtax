/**
 * CostBasisCalculator — unified entry point for tax calculations.
 * @license AGPL-3.0
 */

import { calculateFIFO } from "./methods/fifo";
import { calculateLIFO } from "./methods/lifo";
import { calculateHIFO } from "./methods/hifo";
import { calculateSpecificId } from "./methods/specific-id";
import type {
  TaxLot,
  TaxableEvent,
  CalculationResult,
  CostBasisMethod,
  LotSelection,
} from "./types";

export class CostBasisCalculator {
  private method: CostBasisMethod;
  private lots: TaxLot[] = [];

  constructor(method: CostBasisMethod = "FIFO") {
    this.method = method;
  }

  /** Add tax lots (acquisitions) */
  addLots(lots: TaxLot[]): void {
    this.lots.push(...lots);
  }

  /** Calculate gains/losses for a taxable event */
  calculate(
    event: TaxableEvent,
    strictSilo: boolean = false,
  ): CalculationResult {
    switch (this.method) {
      case "FIFO":
        return calculateFIFO(this.lots, event, strictSilo);
      case "LIFO":
        return calculateLIFO(this.lots, event, strictSilo);
      case "HIFO":
        return calculateHIFO(this.lots, event, strictSilo);
      case "SPECIFIC_ID":
        throw new Error(
          "SPECIFIC_ID requires lot selections — use calculateSpecificId()",
        );
      default:
        throw new Error(`Unknown method: ${this.method}`);
    }
  }

  /** Calculate using Specific ID with user-selected lots */
  calculateSpecificId(
    event: TaxableEvent,
    selections: LotSelection[],
  ): CalculationResult {
    return calculateSpecificId(this.lots, event, selections);
  }

  /** Get current method */
  getMethod(): CostBasisMethod {
    return this.method;
  }

  /** Set calculation method */
  setMethod(method: CostBasisMethod): void {
    this.method = method;
  }

  /** Get all current lots */
  getLots(): TaxLot[] {
    return [...this.lots];
  }
}
