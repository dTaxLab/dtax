/**
 * Internal Transfer Normalizer
 *
 * This engine detects and matches 'TRANSFER_OUT' and 'TRANSFER_IN' events
 * between the user's isolated wallets/exchanges. This is critical for the
 * IRS 2025/2026 "Wallet-by-Wallet" cost basis requirement.
 * Instead of treating a 'TRANSFER_OUT' as a zero-cost taxable 'SELL',
 * this normalizer ties the origin cost basis directly to the destination.
 *
 * @license AGPL-3.0
 */

export interface TransferRecord {
  id: string;
  sourceId: string;
  type: "TRANSFER_IN" | "TRANSFER_OUT" | "BRIDGE_IN" | "BRIDGE_OUT";
  timestamp: Date;
  asset: string;
  amount: number;
  feeAsset?: string;
  feeAmount?: number;
  originalTx?: any; // To hold the full DB object if needed
}

export interface InternalTransferMatch {
  outTx: TransferRecord;
  inTx: TransferRecord;
}

export interface MatchResult {
  matched: InternalTransferMatch[];
  unmatchedOut: TransferRecord[];
  unmatchedIn: TransferRecord[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOON_MS = 12 * 60 * 60 * 1000;

/**
 * A CSV row that only carries a calendar date has no real time of day. Date-only
 * rows are recognised by sitting exactly on 00:00:00.000 UTC (what the CSV
 * parsers produce on a UTC host) or exactly on 12:00:00.000 UTC (seen on stored
 * Robinhood rows in production; the code path that wrote them is not located,
 * so this marker is observed, not derived). A real exchange timestamp landing on
 * either millisecond is negligible, and the only consequence of mistaking one is
 * a looser same-day suggestion that still needs the user's confirmation.
 */
function isDateOnly(t: TransferRecord): boolean {
  const msOfDay = ((t.timestamp.getTime() % DAY_MS) + DAY_MS) % DAY_MS;
  return msOfDay === 0 || msOfDay === NOON_MS;
}

function utcDay(t: TransferRecord): number {
  return Math.floor(t.timestamp.getTime() / DAY_MS);
}

/**
 * Match transfers between wallets/exchanges to avoid treating them as taxable events.
 *
 * @param transfers - Flat array of all Transfer IN and OUT events.
 * @param maxTimeWindowMs - Maximum delay between an out and an in operation. (Default: 24h)
 */
export function matchInternalTransfers(
  transfers: TransferRecord[],
  maxTimeWindowMs: number = 24 * 60 * 60 * 1000,
): MatchResult {
  // Sort all transfers chronologically (supports both TRANSFER and BRIDGE types)
  const outs = transfers
    .filter((t) => t.type === "TRANSFER_OUT" || t.type === "BRIDGE_OUT")
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const ins = transfers
    .filter((t) => t.type === "TRANSFER_IN" || t.type === "BRIDGE_IN")
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Ins bucketed by asset, each bucket keeps the global time order, so the
  // candidates of an out are one binary-searched slice instead of every in.
  const insByAsset = new Map<string, TransferRecord[]>();
  for (const t of ins) {
    const bucket = insByAsset.get(t.asset);
    if (bucket) bucket.push(t);
    else insByAsset.set(t.asset, [t]);
  }
  const CLOCK_SKEW_MS = 60000;

  const matched: InternalTransferMatch[] = [];
  const usedIns = new Set<string>();

  for (const outTx of outs) {
    let bestMatch: TransferRecord | null = null;
    let smallestAmountDiff = Infinity;
    let smallestTimeDiff = Infinity;

    const bucket = insByAsset.get(outTx.asset) ?? [];
    // A date-only row may really have happened earlier that day, so the search
    // starts at the beginning of the out's UTC day; the loop applies the exact rule.
    const earliest = Math.min(
      outTx.timestamp.getTime() - CLOCK_SKEW_MS,
      utcDay(outTx) * DAY_MS,
    );
    let lo = 0;
    let hi = bucket.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bucket[mid].timestamp.getTime() < earliest) lo = mid + 1;
      else hi = mid;
    }

    for (let i = lo; i < bucket.length; i++) {
      const inTx = bucket[i];
      if (
        inTx.timestamp.getTime() - outTx.timestamp.getTime() >
        maxTimeWindowMs
      )
        break;
      // Skip if already assigned, wrong asset, or same wallet source
      // CSV-6: transfers from the same sourceId are not internal transfers
      if (usedIns.has(inTx.id)) continue;
      if (inTx.asset !== outTx.asset) continue;
      if (inTx.sourceId === outTx.sourceId) continue;

      // Check time bounds: 'IN' usually happens after or very close to 'OUT'
      const timeDiff = inTx.timestamp.getTime() - outTx.timestamp.getTime();
      // Allow up to 1m clock skew backwards. Exception: when either side only
      // has a date (00:00 or 12:00 UTC), an arrival earlier the same UTC day
      // is the same transfer, not a different one.
      const sameDayDateOnly =
        (isDateOnly(outTx) || isDateOnly(inTx)) &&
        utcDay(inTx) === utcDay(outTx);
      if (timeDiff < -CLOCK_SKEW_MS && !sameDayDateOnly) continue;
      if (timeDiff > maxTimeWindowMs) continue; // Too far in the future
      // Closer is better; a same-day arrival before the out ranks by distance.
      const timeRank =
        timeDiff < -CLOCK_SKEW_MS ? Math.abs(timeDiff) : timeDiff;

      // The IN amount should not be strictly greater than OUT amount
      // (Unless it's an error. We allow tiny floating point tolerance)
      const amountDiff = outTx.amount - inTx.amount;
      if (amountDiff >= -0.00000001) {
        // We prefer exact matches (amountDiff == 0),
        // otherwise we prefer the smallest amount diff (deducted network fee)
        // If amount diff is equal (within tolerance), we prefer closer time jump.
        if (
          amountDiff < smallestAmountDiff ||
          (Math.abs(amountDiff - smallestAmountDiff) < 0.00000001 &&
            timeRank < smallestTimeDiff)
        ) {
          smallestAmountDiff = amountDiff;
          smallestTimeDiff = timeRank;
          bestMatch = inTx;
        }
      }
    }

    if (bestMatch) {
      matched.push({ outTx, inTx: bestMatch });
      usedIns.add(bestMatch.id);
    }
  }

  const matchedOutIds = new Set(matched.map((m) => m.outTx.id));
  const unmatchedOut = outs.filter((t) => !matchedOutIds.has(t.id));
  const unmatchedIn = ins.filter((t) => !usedIns.has(t.id));

  return { matched, unmatchedOut, unmatchedIn };
}
