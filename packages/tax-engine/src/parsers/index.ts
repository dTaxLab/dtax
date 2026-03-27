/**
 * CSV Parser — Unified Entry Point
 *
 * Auto-detects exchange format and parses accordingly.
 * Supported: Coinbase, Binance (International + US), Kraken, Etherscan, Generic
 *
 * @license AGPL-3.0
 */

import { parseGenericCsv } from "./generic";
import { parseCoinbaseCsv, isCoinbaseCsv } from "./coinbase";
import {
  parseBinanceCsv,
  parseBinanceUsCsv,
  isBinanceCsv,
  isBinanceUsCsv,
} from "./binance";
import { parseKrakenCsv, isKrakenCsv } from "./kraken";
import {
  parseEtherscanCsv,
  parseEtherscanErc20Csv,
  isEtherscanCsv,
  isEtherscanErc20Csv,
} from "./etherscan";
import { parseGeminiCsv, isGeminiCsv } from "./gemini";
import { parseCryptoComCsv, isCryptoComCsv } from "./crypto-com";
import { parseKuCoinCsv, isKuCoinCsv } from "./kucoin";
import { parseOkxCsv, isOkxCsv } from "./okx";
import { parseBybitCsv, isBybitCsv } from "./bybit";
import { parseGateCsv, isGateCsv } from "./gate";
import { parseBitgetCsv, isBitgetCsv } from "./bitget";
import { parseMexcCsv, isMexcCsv } from "./mexc";
import { parseHtxCsv, isHtxCsv } from "./htx";
import {
  parseSolscanCsv,
  parseSolscanSplCsv,
  parseSolscanDefiCsv,
  isSolscanCsv,
  isSolscanSplCsv,
  isSolscanDefiCsv,
} from "./solscan";
import { parseBitfinexCsv, isBitfinexCsv } from "./bitfinex";
import { parsePoloniexCsv, isPoloniexCsv } from "./poloniex";
import { parseKoinlyCsv, isKoinlyCsv } from "./koinly";
import { parseCoinTrackerCsv, isCoinTrackerCsv } from "./cointracker";
import { parseCryptactCsv, isCryptactCsv } from "./cryptact";
import { parseBitstampCsv, isBitstampCsv } from "./bitstamp";
import { parseUpbitCsv, isUpbitCsv } from "./upbit";
import { parseRobinhoodCsv, isRobinhoodCsv } from "./robinhood";
import type { CsvParseResult, CsvFormat, GenericColumnMap } from "./types";

/**
 * Detect the CSV format based on header contents.
 */
export function detectCsvFormat(csv: string): CsvFormat {
  if (isCoinbaseCsv(csv)) return "coinbase";
  if (isBinanceCsv(csv)) return "binance";
  if (isBinanceUsCsv(csv)) return "binance_us";
  if (isKrakenCsv(csv)) return "kraken";
  if (isSolscanDefiCsv(csv)) return "solscan_defi";
  if (isSolscanSplCsv(csv)) return "solscan";
  if (isSolscanCsv(csv)) return "solscan";
  if (isEtherscanErc20Csv(csv)) return "etherscan_erc20";
  if (isEtherscanCsv(csv)) return "etherscan";
  if (isGeminiCsv(csv)) return "gemini";
  if (isCryptoComCsv(csv)) return "crypto_com";
  if (isKoinlyCsv(csv)) return "koinly";
  if (isCoinTrackerCsv(csv)) return "cointracker";
  if (isCryptactCsv(csv)) return "cryptact";
  if (isBitstampCsv(csv)) return "bitstamp";
  if (isUpbitCsv(csv)) return "upbit";
  if (isRobinhoodCsv(csv)) return "robinhood";
  if (isKuCoinCsv(csv)) return "kucoin";
  if (isMexcCsv(csv)) return "mexc";
  if (isGateCsv(csv)) return "gate";
  if (isBitgetCsv(csv)) return "bitget";
  if (isHtxCsv(csv)) return "htx";
  if (isBitfinexCsv(csv)) return "bitfinex";
  if (isPoloniexCsv(csv)) return "poloniex";
  if (isOkxCsv(csv)) return "okx";
  if (isBybitCsv(csv)) return "bybit";
  return "generic";
}

/**
 * Parse a CSV string, auto-detecting the format.
 *
 * @param csv - Raw CSV string
 * @param options - Optional format override, column mapping, or userAddress for Etherscan
 * @returns CsvParseResult with parsed transactions and errors
 */
export function parseCsv(
  csv: string,
  options?: {
    format?: CsvFormat;
    columnMap?: Partial<GenericColumnMap>;
    userAddress?: string;
    nativeAsset?: string;
  },
): CsvParseResult {
  const format = options?.format ?? detectCsvFormat(csv);

  switch (format) {
    case "coinbase":
      return parseCoinbaseCsv(csv);
    case "binance":
      return parseBinanceCsv(csv);
    case "binance_us":
      return parseBinanceUsCsv(csv);
    case "kraken":
      return parseKrakenCsv(csv);
    case "etherscan":
      return parseEtherscanCsv(
        csv,
        options?.userAddress || "",
        options?.nativeAsset,
      );
    case "etherscan_erc20":
      return parseEtherscanErc20Csv(csv, options?.userAddress || "");
    case "gemini":
      return parseGeminiCsv(csv);
    case "crypto_com":
      return parseCryptoComCsv(csv);
    case "kucoin":
      return parseKuCoinCsv(csv);
    case "okx":
      return parseOkxCsv(csv);
    case "bybit":
      return parseBybitCsv(csv);
    case "gate":
      return parseGateCsv(csv);
    case "bitget":
      return parseBitgetCsv(csv);
    case "mexc":
      return parseMexcCsv(csv);
    case "htx":
      return parseHtxCsv(csv);
    case "solscan":
      return isSolscanSplCsv(csv)
        ? parseSolscanSplCsv(csv, options?.userAddress || "")
        : parseSolscanCsv(csv, options?.userAddress || "");
    case "solscan_defi":
      return parseSolscanDefiCsv(csv);
    case "bitfinex":
      return parseBitfinexCsv(csv);
    case "poloniex":
      return parsePoloniexCsv(csv);
    case "koinly":
      return parseKoinlyCsv(csv);
    case "cointracker":
      return parseCoinTrackerCsv(csv);
    case "cryptact":
      return parseCryptactCsv(csv);
    case "bitstamp":
      return parseBitstampCsv(csv);
    case "upbit":
      return parseUpbitCsv(csv);
    case "robinhood":
      return parseRobinhoodCsv(csv);
    case "generic":
    default:
      return parseGenericCsv(csv, options?.columnMap);
  }
}

// Re-export everything
export { parseGenericCsv } from "./generic";
export { parseCoinbaseCsv, isCoinbaseCsv } from "./coinbase";
export {
  parseBinanceCsv,
  parseBinanceUsCsv,
  isBinanceCsv,
  isBinanceUsCsv,
} from "./binance";
export { parseKrakenCsv, isKrakenCsv } from "./kraken";
export {
  parseEtherscanCsv,
  parseEtherscanErc20Csv,
  isEtherscanCsv,
  isEtherscanErc20Csv,
} from "./etherscan";
export { parseGeminiCsv, isGeminiCsv } from "./gemini";
export { parseCryptoComCsv, isCryptoComCsv } from "./crypto-com";
export { parseKuCoinCsv, isKuCoinCsv } from "./kucoin";
export { parseOkxCsv, isOkxCsv } from "./okx";
export { parseBybitCsv, isBybitCsv } from "./bybit";
export { parseGateCsv, isGateCsv } from "./gate";
export { parseBitgetCsv, isBitgetCsv } from "./bitget";
export { parseMexcCsv, isMexcCsv } from "./mexc";
export { parseHtxCsv, isHtxCsv } from "./htx";
export {
  parseSolscanCsv,
  parseSolscanSplCsv,
  parseSolscanDefiCsv,
  isSolscanCsv,
  isSolscanSplCsv,
  isSolscanDefiCsv,
} from "./solscan";
export { parseBitfinexCsv, isBitfinexCsv } from "./bitfinex";
export { parsePoloniexCsv, isPoloniexCsv } from "./poloniex";
export { parseKoinlyCsv, isKoinlyCsv } from "./koinly";
export { parseCoinTrackerCsv, isCoinTrackerCsv } from "./cointracker";
export { parseCryptactCsv, isCryptactCsv } from "./cryptact";
export { parseBitstampCsv, isBitstampCsv } from "./bitstamp";
export { parseUpbitCsv, isUpbitCsv } from "./upbit";
export { parseRobinhoodCsv, isRobinhoodCsv } from "./robinhood";
export { parseCsvRows, parseCsvToObjects } from "./csv-core";
export type {
  CsvFormat,
  CsvParseResult,
  CsvParseError,
  ParsedTransaction,
  GenericColumnMap,
} from "./types";
