# @dtax/tax-engine

[![npm version](https://img.shields.io/npm/v/@dtax/tax-engine.svg)](https://www.npmjs.com/package/@dtax/tax-engine)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Open-source crypto tax calculation engine. Computes capital gains using FIFO, LIFO, HIFO, or Specific ID, parses CSV exports from 23+ exchanges, and generates IRS Form 8949, Schedule D, and TXF reports.

## Install

```bash
npm install @dtax/tax-engine
```

## Quick Start

### Calculate Capital Gains (FIFO)

```typescript
import {
  CostBasisCalculator,
  type TaxLot,
  type TaxableEvent,
} from "@dtax/tax-engine";

const lots: TaxLot[] = [
  {
    id: "lot-1",
    asset: "BTC",
    amount: 1.0,
    costBasisUsd: 30000,
    acquiredAt: new Date("2024-01-15"),
    sourceId: "coinbase",
  },
];

const event: TaxableEvent = {
  id: "sale-1",
  asset: "BTC",
  amount: 0.5,
  proceedsUsd: 22000,
  date: new Date("2024-11-20"),
  sourceId: "coinbase",
  feeUsd: 10,
};

const calculator = new CostBasisCalculator("FIFO");
calculator.addLots(lots);

const result = calculator.calculate(event);
console.log(result.gainLoss); // 6990 (proceeds minus cost basis minus fees)
console.log(result.holdingPeriod); // "LONG_TERM"
console.log(result.method); // "FIFO"
```

### Parse Exchange CSV

```typescript
import { parseCsv, detectCsvFormat } from "@dtax/tax-engine";

const csv = `Timestamp (UTC),Transaction Type,Asset,Quantity Transacted,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes
2024-03-01T10:00:00Z,Buy,BTC,0.5,50000.00,25000.00,25050.00,50.00,`;

// Auto-detect format
const format = detectCsvFormat(csv); // "coinbase"

// Parse transactions
const result = parseCsv(csv);
console.log(result.transactions); // ParsedTransaction[]
console.log(result.summary); // { format: "coinbase", totalRows: 1, parsed: 1, failed: 0 }
```

### Generate Form 8949

```typescript
import {
  CostBasisCalculator,
  generateForm8949,
  form8949ToCsv,
  generateForm8949Pdf,
  form8949ToTxf,
  type LotDateMap,
} from "@dtax/tax-engine";

// After calculating results...
const calculator = new CostBasisCalculator("FIFO");
calculator.addLots(lots);
const results = events.map((e) => calculator.calculate(e));

// Build lot date map for holding period classification
const lotDates: LotDateMap = new Map(lots.map((l) => [l.id, l.acquiredAt]));

// Generate Form 8949 report
const report = generateForm8949(results, {
  taxYear: 2024,
  lotDates,
  reportingBasis: "none",
});

// Export as CSV
const csvOutput = form8949ToCsv(report);

// Export as PDF
const pdfBytes = await generateForm8949Pdf(report);

// Export as TXF (TurboTax import)
const txfOutput = form8949ToTxf(report);
```

### Wash Sale Detection

```typescript
import { detectWashSales, type AcquisitionRecord } from "@dtax/tax-engine";

const acquisitions: AcquisitionRecord[] = lots.map((l) => ({
  lotId: l.id,
  asset: l.asset,
  amount: l.amount,
  acquiredAt: l.acquiredAt,
}));

const consumedLotIds = new Set(
  results.flatMap((r) => r.matchedLots.map((m) => m.lotId)),
);

const washResult = detectWashSales(results, acquisitions, consumedLotIds);
console.log(washResult.totalDisallowed); // USD amount of disallowed losses
console.log(washResult.adjustments); // WashSaleAdjustment[]
```

### Compare Cost Basis Methods

```typescript
import { compareAllMethods } from "@dtax/tax-engine";

const comparison = compareAllMethods(
  lots,
  { asset: "BTC", amount: 0.5, pricePerUnit: 44000 },
  acquisitions,
);
// Returns gains/losses for FIFO, LIFO, and HIFO side by side
```

## Supported Exchanges

| Exchange    | Format Key    | Exchange         | Format Key        |
| ----------- | ------------- | ---------------- | ----------------- |
| Binance     | `binance`     | Kraken           | `kraken`          |
| Binance US  | `binance_us`  | KuCoin           | `kucoin`          |
| Bitfinex    | `bitfinex`    | MEXC             | `mexc`            |
| Bitget      | `bitget`      | OKX              | `okx`             |
| Bybit       | `bybit`       | Poloniex         | `poloniex`        |
| Coinbase    | `coinbase`    | Solscan          | `solscan`         |
| CoinTracker | `cointracker` | Solscan DeFi     | `solscan_defi`    |
| Crypto.com  | `crypto_com`  | Etherscan        | `etherscan`       |
| Cryptact    | `cryptact`    | Etherscan ERC-20 | `etherscan_erc20` |
| Gate.io     | `gate`        | Koinly           | `koinly`          |
| Gemini      | `gemini`      | Generic CSV      | `generic`         |
| HTX         | `htx`         |                  |                   |

## Cost Basis Methods

- **FIFO** -- First In, First Out
- **LIFO** -- Last In, First Out
- **HIFO** -- Highest In, First Out (minimizes taxable gains)
- **Specific ID** -- User selects which lots to dispose

## Features

- **Capital Gains Calculation** -- Short-term and long-term gain/loss with lot matching
- **Wash Sale Detection** -- 30-day window detection per IRS rules
- **Form 8949** -- CSV, PDF, and TXF (TurboTax V042) export
- **Schedule D** -- Automatic summary generation from Form 8949 data
- **Tax-Loss Harvesting** -- Portfolio analysis with `analyzeHoldings()`
- **Tax Impact Simulator** -- Preview gains before selling with `simulateSale()`
- **Method Comparison** -- Compare FIFO/LIFO/HIFO outcomes with `compareAllMethods()`
- **Risk Scanner** -- Detect missing cost basis, duplicates, and anomalies with `scanRisks()`
- **1099-DA Reconciliation** -- Match broker-reported data against your calculations
- **Multi-Currency** -- Convert results to any display currency
- **Wallet-Siloed Cost Basis** -- Optional `strictSilo` mode for per-exchange lot isolation
- **DeFi & NFT Support** -- DEX swaps, LP events, wraps, bridges, NFT mints/sales
- **Internal Transfer Matching** -- Detect and match transfers between your own wallets

## API Reference

Full API documentation is available at [https://getdtax.com/docs](https://getdtax.com/docs).

## Requirements

- Node.js >= 20.0.0

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) -- see [LICENSE](./LICENSE) for details.

Part of the [DTax](https://github.com/dTaxLab/dtax) project.
