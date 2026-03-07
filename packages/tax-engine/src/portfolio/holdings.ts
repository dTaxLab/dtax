/**
 * Portfolio Holdings Analyzer
 *
 * Aggregates remaining tax lots into portfolio positions and
 * identifies Tax-Loss Harvesting (TLH) opportunities.
 *
 * @license AGPL-3.0
 */

import type { TaxLot } from '../types';
import type {
    PriceMap,
    LotHolding,
    AssetPosition,
    TlhOpportunity,
    PortfolioAnalysis,
} from './types';

const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Analyze portfolio holdings from remaining tax lots.
 *
 * @param lots - Tax lots with remaining amounts (amount > 0 means still held)
 * @param currentPrices - Optional map of asset → current USD price
 * @param asOfDate - Reference date for holding period (default: now)
 */
export function analyzeHoldings(
    lots: TaxLot[],
    currentPrices?: PriceMap,
    asOfDate: Date = new Date(),
): PortfolioAnalysis {
    // Filter to lots with remaining balance
    const activeLots = lots.filter(l => l.amount > 0);

    // Build per-lot holdings
    const lotHoldings: LotHolding[] = activeLots.map(lot => {
        const costPerUnit = lot.amount > 0 ? lot.costBasisUsd / lot.amount : 0;
        const isLongTerm = (asOfDate.getTime() - lot.acquiredAt.getTime()) > ONE_YEAR_MS;
        const price = currentPrices?.get(lot.asset);

        const holding: LotHolding = {
            lotId: lot.id,
            asset: lot.asset,
            amount: lot.amount,
            costBasisUsd: lot.costBasisUsd,
            costPerUnit,
            acquiredAt: lot.acquiredAt,
            sourceId: lot.sourceId,
            isLongTerm,
        };

        if (price !== undefined) {
            holding.currentValueUsd = lot.amount * price;
            holding.unrealizedGainLoss = holding.currentValueUsd - lot.costBasisUsd;
        }

        return holding;
    });

    // Group by asset
    const byAsset = new Map<string, LotHolding[]>();
    for (const h of lotHoldings) {
        const arr = byAsset.get(h.asset) || [];
        arr.push(h);
        byAsset.set(h.asset, arr);
    }

    // Build positions
    const positions: AssetPosition[] = [];
    for (const [asset, holdings] of byAsset) {
        const totalAmount = holdings.reduce((s, h) => s + h.amount, 0);
        const totalCostBasis = holdings.reduce((s, h) => s + h.costBasisUsd, 0);
        const price = currentPrices?.get(asset);

        const position: AssetPosition = {
            asset,
            totalAmount,
            totalCostBasis,
            avgCostPerUnit: totalAmount > 0 ? totalCostBasis / totalAmount : 0,
            lotCount: holdings.length,
            earliestAcquired: new Date(Math.min(...holdings.map(h => h.acquiredAt.getTime()))),
            latestAcquired: new Date(Math.max(...holdings.map(h => h.acquiredAt.getTime()))),
            lots: holdings,
        };

        if (price !== undefined) {
            position.currentPrice = price;
            position.currentValueUsd = totalAmount * price;
            position.unrealizedGainLoss = position.currentValueUsd - totalCostBasis;
            position.unrealizedPct = totalCostBasis > 0
                ? (position.unrealizedGainLoss / totalCostBasis) * 100
                : 0;
        }

        positions.push(position);
    }

    // Sort by current value desc (or cost basis if no prices)
    positions.sort((a, b) =>
        (b.currentValueUsd ?? b.totalCostBasis) - (a.currentValueUsd ?? a.totalCostBasis)
    );

    // Identify TLH opportunities
    const tlhOpportunities: TlhOpportunity[] = [];
    if (currentPrices && currentPrices.size > 0) {
        for (const pos of positions) {
            const loseLots = pos.lots.filter(
                l => l.unrealizedGainLoss !== undefined && l.unrealizedGainLoss < 0
            );
            if (loseLots.length === 0) continue;

            const unrealizedLoss = loseLots.reduce(
                (s, l) => s + (l.unrealizedGainLoss ?? 0), 0
            );
            const currentValue = loseLots.reduce(
                (s, l) => s + (l.currentValueUsd ?? 0), 0
            );

            tlhOpportunities.push({
                asset: pos.asset,
                unrealizedLoss,
                loseLots,
                totalAmount: loseLots.reduce((s, l) => s + l.amount, 0),
                totalCostBasis: loseLots.reduce((s, l) => s + l.costBasisUsd, 0),
                currentValue,
                hasShortTermLots: loseLots.some(l => !l.isLongTerm),
            });
        }

        // Sort by largest loss first (most negative)
        tlhOpportunities.sort((a, b) => a.unrealizedLoss - b.unrealizedLoss);
    }

    // Totals
    const totalCostBasis = positions.reduce((s, p) => s + p.totalCostBasis, 0);
    const hasPrices = currentPrices && currentPrices.size > 0;
    const totalCurrentValue = hasPrices
        ? positions.reduce((s, p) => s + (p.currentValueUsd ?? 0), 0)
        : undefined;
    const totalUnrealizedGainLoss = hasPrices && totalCurrentValue !== undefined
        ? totalCurrentValue - totalCostBasis
        : undefined;
    const totalTlhAvailable = tlhOpportunities.reduce(
        (s, o) => s + o.unrealizedLoss, 0
    );

    return {
        positions,
        totalCostBasis,
        totalCurrentValue,
        totalUnrealizedGainLoss,
        tlhOpportunities,
        totalTlhAvailable,
        asOfDate,
    };
}
