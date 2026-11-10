/**
 * Fixed texts and limits of the MCP server.
 *
 * Wording rules (from the compliance review, see README "Wording"): no claim of
 * accuracy, approval or filing readiness; no tax owed, rates or form lines; no
 * advice to the user (no "you should"); results are estimates. The words that
 * are forbidden are checked by the tests.
 *
 * @license AGPL-3.0
 */

import type { CsvFormat } from "@dtax/tax-engine";

/** Version of the calculation engine the results come from (checked against its package.json by a test). */
export const ENGINE_VERSION = "0.1.1";
export const SERVER_VERSION = "0.1.0";

/** Shown first in every result. */
export const NOTICE =
  "Informational estimate only; not tax advice. It may be incomplete or incorrect and reflects only your file and the stated rules and tax year. Confirm with a qualified tax professional before relying on it. Provided as is, without warranty.";

/** The server's instructions to the assistant, and the README text. */
export const INSTRUCTIONS =
  "dTax MCP reads transaction files you choose, on your computer, and returns capital gains estimates. Results are for informational purposes only and are not tax advice. They depend on the file's completeness, the prices and cost basis available, and the stated country, tax year and method, and may be incomplete or incorrect. dTax is a calculation tool, not a tax advisory service. Confirm results with a qualified tax professional before relying on them or filing anything. Provided as is, without warranty.";

/** What the assistant is asked to do with a result. A request, not a control. */
export const PRESENTATION_GUIDANCE =
  "Present figures as estimates. Keep the notice and the completeness section with them. Do not state what the user should report or pay.";

export const PRIVACY_NOTE =
  "dTax does not send data anywhere; your AI assistant may send results to its provider.";

export const LEARN_MORE =
  "https://getdtax.com/?utm_source=mcp&utm_medium=local&utm_campaign=dtax-mcp";

/** Countries the rules cover. Others are refused, never defaulted. */
export const COUNTRIES = ["US"] as const;
export const METHODS = ["FIFO", "LIFO", "HIFO"] as const;
export type Method = (typeof METHODS)[number];

/** Not handled by this local tool. May be incomplete. */
export const NOT_MODELED = [
  "Pairing of transfers between your own wallets or accounts (transfers in count as acquisitions and transfers out as disposals at the value in the file)",
  "Looking up prices: a row without a USD value is counted as having none",
  "Wash sale rules, state taxes, tax rates and the amount of tax",
  "Specific treatment of DeFi, NFTs, derivatives, staking or mining income, forks and gifts",
  "Countries other than the United States",
  "Reporting of foreign accounts and any filing",
];

export const SUPPORTED_FORMATS: readonly CsvFormat[] = [
  "generic",
  "coinbase",
  "binance",
  "binance_us",
  "kraken",
  "kraken_trades",
  "etherscan",
  "etherscan_erc20",
  "gemini",
  "crypto_com",
  "kucoin",
  "okx",
  "bybit",
  "gate",
  "bitget",
  "mexc",
  "htx",
  "solscan",
  "solscan_defi",
  "bitfinex",
  "poloniex",
  "koinly",
  "cointracker",
  "cryptact",
  "bitstamp",
  "upbit",
  "robinhood",
  "wazirx",
  "coindcx",
  "zebpay",
];

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 10;
