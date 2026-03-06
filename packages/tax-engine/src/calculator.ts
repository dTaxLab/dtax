/**
 * CostBasisCalculator — unified entry point for tax calculations.
 * @license AGPL-3.0
 */

import { calculateFIFO } from './methods/fifo';
import type {
    TaxLot,
    TaxableEvent,
    CalculationResult,
    CostBasisMethod,
} from './types';

export class CostBasisCalculator {
    private method: CostBasisMethod;
    private lots: TaxLot[] = [];

    constructor(method: CostBasisMethod = 'FIFO') {
        this.method = method;
    }

    /** Add tax lots (acquisitions) */
    addLots(lots: TaxLot[]): void {
        this.lots.push(...lots);
    }

    /** Calculate gains/losses for a taxable event */
    calculate(event: TaxableEvent): CalculationResult {
        switch (this.method) {
            case 'FIFO':
                return calculateFIFO(this.lots, event);
            case 'LIFO':
                throw new Error('LIFO not yet implemented');
            case 'HIFO':
                throw new Error('HIFO not yet implemented');
            default:
                throw new Error(`Unknown method: ${this.method}`);
        }
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
