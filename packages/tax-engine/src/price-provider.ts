/**
 * PriceProvider — abstract interface for historical crypto price lookups.
 *
 * Open-source contract: implement this interface to plug in any price source
 * (CoinGecko, Polygon, Binance, custom oracle, etc.).
 *
 * @license AGPL-3.0
 */

/**
 * A single historical price data point.
 * `priceUsd` is the USD fair-market value at the given date.
 * `source` is a human-readable string for audit trail purposes (IRS FAQ 27).
 */
export interface PricePoint {
  priceUsd: number;
  source: string; // e.g. "CoinGecko @ 2019-10-21" or "Polygon.io @ 2025-01-15"
}

/**
 * Contract for any historical price data provider.
 *
 * Implementations should:
 *  - Return null when price data is unavailable (unknown asset, out-of-range date)
 *  - Be idempotent (same inputs → same output)
 *  - Document their rate limits and coverage range
 */
export interface PriceProvider {
  /**
   * The name of this provider, used in audit trail strings.
   * e.g. "CoinGecko", "Polygon.io"
   */
  readonly name: string;

  /**
   * Earliest date this provider has reliable data for.
   * Callers use this to route requests to the appropriate provider.
   */
  readonly supportedFrom: Date;

  /**
   * Fetch the USD price of `asset` on `date`.
   *
   * @param asset - Ticker symbol, e.g. "ETH", "BTC"
   * @param date  - The date to look up (time component is ignored; daily granularity)
   * @returns PricePoint if data is available, null otherwise
   */
  getPrice(asset: string, date: Date): Promise<PricePoint | null>;
}
