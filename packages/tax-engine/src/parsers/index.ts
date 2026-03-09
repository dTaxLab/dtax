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
import type { CsvParseResult, CsvFormat, GenericColumnMap } from "./types";

/**
 * Detect the CSV format based on header contents.
 */
export function detectCsvFormat(csv: string): CsvFormat {
  if (isCoinbaseCsv(csv)) return "coinbase";
  if (isBinanceCsv(csv)) return "binance";
  if (isBinanceUsCsv(csv)) return "binance_us";
  if (isKrakenCsv(csv)) return "kraken";
  if (isEtherscanErc20Csv(csv)) return "etherscan_erc20";
  if (isEtherscanCsv(csv)) return "etherscan";
  if (isGeminiCsv(csv)) return "gemini";
  if (isCryptoComCsv(csv)) return "crypto_com";
  if (isKuCoinCsv(csv)) return "kucoin";
  if (isMexcCsv(csv)) return "mexc";
  if (isGateCsv(csv)) return "gate";
  if (isBitgetCsv(csv)) return "bitget";
  if (isHtxCsv(csv)) return "htx";
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
export { parseCsvRows, parseCsvToObjects } from "./csv-core";
export type {
  CsvFormat,
  CsvParseResult,
  CsvParseError,
  ParsedTransaction,
  GenericColumnMap,
} from "./types";
