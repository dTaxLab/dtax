<p align="center">
  <img src="apps/web/public/logo-512.png" alt="dTax" width="120" height="120">
  <h1 align="center">dTax</h1>
  <p align="center">
    <strong>The only complete TypeScript crypto tax engine on npm</strong>
  </p>
  <p align="center">
    <a href="https://github.com/dTaxLab/dtax/actions/workflows/ci.yml"><img src="https://github.com/dTaxLab/dtax/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License"></a>
    <a href="https://www.npmjs.com/package/@dtax/tax-engine"><img src="https://img.shields.io/npm/v/@dtax/tax-engine" alt="npm"></a>
    <a href="https://github.com/dTaxLab/dtax"><img src="https://img.shields.io/github/stars/dTaxLab/dtax?style=social" alt="Stars"></a>
  </p>
  <p align="center">
    <a href="README.md">English</a> · <a href="README.zh.md">简体中文</a> · <a href="README.zh-Hant.md">繁體中文</a> · <a href="README.es.md">Español</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.pt.md">Português</a>
  </p>
</p>

---

**23 exchange parsers** | **FIFO / LIFO / HIFO / Specific ID** | **Form 8949 + Schedule D** | **Wash sale detection** | **What-if simulator**

## Install

```bash
npm install @dtax/tax-engine
```

## Quick Example

```typescript
import {
  parseCsv,
  CostBasisCalculator,
  generateForm8949,
} from "@dtax/tax-engine";

// 1. Parse any exchange CSV (auto-detects format)
const { lots, events } = parseCsv(csvString);

// 2. Calculate gains/losses
const calc = new CostBasisCalculator("FIFO");
calc.addLots(lots);
const results = events.map((e) => calc.calculate(e));

// 3. Generate IRS Form 8949
const report = generateForm8949(results);
```

## CLI

Calculate taxes from the command line without writing any code:

```bash
npx @dtax/cli calculate trades.csv --method FIFO
npx @dtax/cli calculate trades.csv --method LIFO --year 2025 --json
npx @dtax/cli calculate coinbase.csv binance.csv --method HIFO
```

Install globally for repeated use:

```bash
npm install -g @dtax/cli
dtax calculate trades.csv --method FIFO --form8949 report.csv
dtax calculate trades.csv --schedule-d --include-wash-sales
```

## Supported Exchanges (23 Parsers)

All parsers auto-detect the CSV format. No configuration required.

| Category  | Exchanges                                                                           |
| --------- | ----------------------------------------------------------------------------------- |
| Major     | Coinbase, Binance, Binance US, Kraken, Gemini                                       |
| Global    | KuCoin, OKX, Bybit, Gate.io, Bitget, MEXC, HTX (Huobi)                              |
| Other     | Crypto.com, Bitfinex, Poloniex                                                      |
| On-chain  | Etherscan (ETH + ERC-20 + BSC/Polygon/Avalanche/Fantom), Solscan (SOL + SPL + DeFi) |
| Migration | Koinly, CoinTracker, Cryptact (import from competitors)                             |
| Fallback  | Generic CSV (map your own columns)                                                  |

## Features

- **4 cost basis methods** -- FIFO, LIFO, HIFO, Specific ID (IRS-compliant)
- **Form 8949** -- CSV, PDF, and TXF (TurboTax) export with Box A-F classification
- **Schedule D** -- Part I/II aggregation, $3,000 loss limit, carryover calculation
- **Wash sale detection** -- 30-day window, partial disallowance, Form 8949 code W
- **What-if simulator** -- Preview tax impact before selling (`simulateSale()`)
- **Method comparison** -- Find the optimal method across FIFO/LIFO/HIFO (`compareAllMethods()`)
- **DeFi + NFT support** -- LP deposits/withdrawals, staking, wraps, bridges, 12 DeFi tx types
- **1099-DA reconciliation** -- 3-phase matching against broker-reported data
- **Portfolio analysis** -- Holdings aggregation, unrealized P&L, tax-loss harvesting opportunities
- **Wallet-siloed accounting** -- Strict per-wallet cost basis isolation
- **Internal transfer matching** -- Auto-detect transfers between your own wallets

## Comparison with Alternatives

| Feature                |    dTax    |  Rotki  |   RP2    |
| ---------------------- | :--------: | :-----: | :------: |
| Language               | TypeScript | Python  |  Python  |
| npm installable        |    Yes     |   No    |    No    |
| Exchange parsers       |     23     |   15    |    8     |
| Cost basis methods     |     4      |    3    |    3     |
| Form 8949 PDF          |    Yes     |   No    |    No    |
| TurboTax TXF export    |    Yes     |   No    |    No    |
| Schedule D generation  |    Yes     |   No    |    No    |
| Wash sale detection    |    Yes     |   Yes   |    No    |
| What-if simulator      |    Yes     |   No    |    No    |
| Method comparison      |    Yes     |   No    |    No    |
| DeFi/NFT tx types      |     12     |    8    |    4     |
| 1099-DA reconciliation |    Yes     |   No    |    No    |
| Competitor CSV import  |    Yes     |   No    |    No    |
| CLI tool               |    Yes     |   Yes   |   Yes    |
| Browser/Node.js        |    Both    | Desktop | CLI only |

## Packages

| Package                                       | Description                               |
| --------------------------------------------- | ----------------------------------------- |
| [`@dtax/tax-engine`](packages/tax-engine)     | Core calculation engine, parsers, reports |
| [`@dtax/cli`](packages/cli)                   | Command-line interface                    |
| [`@dtax/shared-types`](packages/shared-types) | TypeScript type definitions               |

## API Highlights

```typescript
// Cost basis calculation
import { calculateFIFO, calculateLIFO, calculateHIFO } from "@dtax/tax-engine";

// Reports
import {
  generateForm8949,
  form8949ToCsv,
  generateForm8949Pdf,
} from "@dtax/tax-engine";
import { generateScheduleD } from "@dtax/tax-engine";
import { form8949ToTxf } from "@dtax/tax-engine"; // TurboTax

// Analysis
import { detectWashSales } from "@dtax/tax-engine";
import { simulateSale } from "@dtax/tax-engine"; // what-if
import { compareAllMethods } from "@dtax/tax-engine"; // optimizer
import { analyzeHoldings } from "@dtax/tax-engine"; // portfolio

// Parsers (auto-detect or use individually)
import { parseCsv, detectCsvFormat } from "@dtax/tax-engine";
```

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9
git clone https://github.com/dTaxLab/dtax.git && cd dtax
pnpm install
pnpm test        # 800+ tests across all packages
pnpm build       # build all packages
```

## License

All packages in this repository are licensed under [AGPL-3.0](LICENSE).

This means you can use dTax freely in your projects. If you modify the source and distribute it (including as a network service), you must release your modifications under AGPL-3.0.

For commercial licensing inquiries: [getdtax.com](https://getdtax.com)

## Links

- Website: [getdtax.com](https://getdtax.com)
- Issues: [GitHub Issues](https://github.com/dTaxLab/dtax/issues)
- Discussions: [GitHub Discussions](https://github.com/dTaxLab/dtax/discussions)
