import { z } from "zod";

export const txTypeEnum = z
  .enum([
    "BUY",
    "SELL",
    "TRADE",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "AIRDROP",
    "STAKING_REWARD",
    "MINING_REWARD",
    "INTEREST",
    "GIFT_RECEIVED",
    "GIFT_SENT",
    "LOST",
    "STOLEN",
    "FORK",
    "MARGIN_TRADE",
    "LIQUIDATION",
    "INTERNAL_TRANSFER",
    "DEX_SWAP",
    "LP_DEPOSIT",
    "LP_WITHDRAWAL",
    "LP_REWARD",
    "WRAP",
    "UNWRAP",
    "BRIDGE_OUT",
    "BRIDGE_IN",
    "CONTRACT_APPROVAL",
    "NFT_MINT",
    "NFT_PURCHASE",
    "NFT_SALE",
    "UNKNOWN",
  ])
  .openapi({ ref: "TxType" });

export const costBasisMethodEnum = z
  .enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"])
  .openapi({ ref: "CostBasisMethod" });

export const planEnum = z.enum(["FREE", "PRO", "CPA"]).openapi({ ref: "Plan" });

export const userRoleEnum = z
  .enum(["USER", "ADMIN"])
  .openapi({ ref: "UserRole" });

export const form8949FormatEnum = z
  .enum(["json", "csv", "pdf", "txf"])
  .openapi({ ref: "Form8949Format" });

export const csvFormatEnum = z
  .enum([
    "generic",
    "coinbase",
    "binance",
    "binance_us",
    "kraken",
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
  ])
  .openapi({ ref: "CsvFormat" });
