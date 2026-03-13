# @dtax/shared-types

[![npm version](https://img.shields.io/npm/v/@dtax/shared-types.svg)](https://www.npmjs.com/package/@dtax/shared-types)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Shared TypeScript type definitions for the DTax crypto tax platform. Provides unified types used across the tax engine, API, web app, and CLI.

## Install

```bash
npm install @dtax/shared-types
```

## Types

### Transaction Types

| Type          | Description                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TxType`      | Union of 27 transaction types: `BUY`, `SELL`, `TRADE`, `TRANSFER_IN`, `TRANSFER_OUT`, `AIRDROP`, `STAKING_REWARD`, `MINING_REWARD`, `INTEREST`, `GIFT_RECEIVED`, `GIFT_SENT`, `LOST`, `STOLEN`, `FORK`, `MARGIN_TRADE`, `LIQUIDATION`, `INTERNAL_TRANSFER`, `DEX_SWAP`, `LP_DEPOSIT`, `LP_WITHDRAWAL`, `LP_REWARD`, `WRAP`, `UNWRAP`, `BRIDGE_OUT`, `BRIDGE_IN`, `CONTRACT_APPROVAL`, `NFT_MINT`, `NFT_PURCHASE`, `NFT_SALE`, `UNKNOWN` |
| `Transaction` | Full transaction record with source, assets, USD values, AI classification fields, tax results, and metadata                                                                                                                                                                                                                                                                                                                            |

### Portfolio Types

| Type               | Description                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `Holding`          | Single asset holding with amount, USD value, cost basis, and unrealized gain/loss           |
| `PortfolioSummary` | Aggregated portfolio with total value, cost basis, unrealized gain/loss, and holdings array |

### Tax Report Types

| Type         | Description                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `TaxSummary` | Annual tax summary: short/long-term gains and losses, net gain/loss, income from staking/mining/airdrops |

### Subscription Types

| Type   | Description                                      |
| ------ | ------------------------------------------------ |
| `Plan` | Subscription tier: `"FREE"`, `"PRO"`, or `"CPA"` |

### API Types

| Type                 | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `ApiResponse<T>`     | Standard success response wrapper with `data` and optional `meta`                            |
| `ApiListResponse<T>` | Paginated list response with `data[]` and pagination `meta` (total, page, limit, totalPages) |
| `ApiError`           | Error response with `code`, `message`, and optional field-level `details`                    |

## Usage

```typescript
import type {
  Transaction,
  TxType,
  Holding,
  PortfolioSummary,
  TaxSummary,
  Plan,
  ApiResponse,
  ApiListResponse,
  ApiError,
} from "@dtax/shared-types";

// Type a transaction
const tx: Transaction = {
  id: "tx-1",
  userId: "user-1",
  source: "coinbase",
  type: "BUY",
  timestamp: new Date("2024-06-15"),
  receivedAsset: "ETH",
  receivedAmount: 2.0,
  receivedValueUsd: 7000,
  sentAsset: "USD",
  sentAmount: 7000,
  feeAsset: "USD",
  feeAmount: 15,
  feeValueUsd: 15,
};

// Type an API response
function handleResponse(res: ApiResponse<TaxSummary>): void {
  console.log(res.data.netGainLoss);
}

// Type a paginated list
function handleList(res: ApiListResponse<Transaction>): void {
  console.log(`Page ${res.meta.page} of ${res.meta.totalPages}`);
  for (const tx of res.data) {
    console.log(tx.type, tx.receivedAsset);
  }
}
```

## Requirements

- TypeScript >= 5.0

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) -- see [LICENSE](./LICENSE) for details.

Part of the [DTax](https://github.com/dTaxLab/dtax) project.
