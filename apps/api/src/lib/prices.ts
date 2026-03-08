/**
 * CoinGecko Price Service
 *
 * Fetches current crypto prices from CoinGecko free API.
 * Includes in-memory cache to respect rate limits (30 req/min free tier).
 */

/** Map of common asset tickers to CoinGecko IDs */
const TICKER_TO_COINGECKO: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    DOGE: 'dogecoin',
    ADA: 'cardano',
    DOT: 'polkadot',
    XRP: 'ripple',
    LTC: 'litecoin',
    BCH: 'bitcoin-cash',
    ETC: 'ethereum-classic',
    AVAX: 'avalanche-2',
    MATIC: 'matic-network',
    LINK: 'chainlink',
    UNI: 'uniswap',
    ATOM: 'cosmos',
    NEAR: 'near',
    APT: 'aptos',
    ARB: 'arbitrum',
    OP: 'optimism',
    FIL: 'filecoin',
    SHIB: 'shiba-inu',
    USDT: 'tether',
    USDC: 'usd-coin',
    DAI: 'dai',
    BNB: 'binancecoin',
    TRX: 'tron',
    PEPE: 'pepe',
    SUI: 'sui',
    SEI: 'sei-network',
    INJ: 'injective-protocol',
};

const COINGECKO_API = 'https://api.coingecko.com/api/v3';

interface CacheEntry {
    prices: Record<string, number>;
    fetchedAt: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
let priceCache: CacheEntry | null = null;

/**
 * Resolve ticker symbols to CoinGecko IDs.
 * Unknown tickers are returned as-is (lowercase, hyphenated).
 */
export function resolveCoingeckoIds(tickers: string[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const t of tickers) {
        const upper = t.toUpperCase();
        const cgId = TICKER_TO_COINGECKO[upper] || upper.toLowerCase();
        result.set(upper, cgId);
    }
    return result;
}

/**
 * Fetch current USD prices for given asset tickers.
 *
 * @param tickers - Array of asset symbols (e.g., ['BTC', 'ETH'])
 * @returns Map of ticker → USD price
 */
export async function fetchPrices(tickers: string[]): Promise<Record<string, number>> {
    if (tickers.length === 0) return {};

    // Check cache
    if (priceCache && (Date.now() - priceCache.fetchedAt) < CACHE_TTL_MS) {
        const cached: Record<string, number> = {};
        let allCached = true;
        for (const t of tickers) {
            const upper = t.toUpperCase();
            if (priceCache.prices[upper] !== undefined) {
                cached[upper] = priceCache.prices[upper];
            } else {
                allCached = false;
                break;
            }
        }
        if (allCached) return cached;
    }

    // Resolve CoinGecko IDs
    const tickerMap = resolveCoingeckoIds(tickers);
    const cgIds = [...new Set(tickerMap.values())];
    const idsParam = cgIds.join(',');

    const url = `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(idsParam)}&vs_currencies=usd`;

    const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
        throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as Record<string, { usd?: number }>;

    // Map back to tickers
    const prices: Record<string, number> = {};
    for (const [ticker, cgId] of tickerMap) {
        const entry = data[cgId];
        if (entry?.usd !== undefined) {
            prices[ticker] = entry.usd;
        }
    }

    // Update cache (merge with existing)
    priceCache = {
        prices: { ...(priceCache?.prices || {}), ...prices },
        fetchedAt: Date.now(),
    };

    return prices;
}

/**
 * Get the list of supported tickers with CoinGecko IDs.
 */
export function getSupportedTickers(): string[] {
    return Object.keys(TICKER_TO_COINGECKO);
}

/** Clear the price cache (for testing). */
export function clearPriceCache(): void {
    priceCache = null;
}
