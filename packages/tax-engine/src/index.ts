/**
 * @dtax/tax-engine
 *
 * Open source crypto tax calculation engine.
 * Supports FIFO, LIFO, HIFO cost basis methods.
 *
 * @license AGPL-3.0
 */

export { calculateFIFO } from './methods/fifo';
export { calculateLIFO } from './methods/lifo';
export { calculateHIFO } from './methods/hifo';
export { CostBasisCalculator } from './calculator';
export type {
  TaxLot,
  TaxableEvent,
  CalculationResult,
  CostBasisMethod,
} from './types';
