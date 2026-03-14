<p align="center">
  <img src="apps/web/public/logo-512.png" alt="dTax" width="120" height="120">
  <h1 align="center">dTax</h1>
  <p align="center">
    <strong>npm 上唯一完整的 TypeScript 加密货币税务引擎</strong>
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

**23 个交易所解析器** | **FIFO / LIFO / HIFO / Specific ID** | **Form 8949 + Schedule D** | **洗售检测** | **假设模拟器**

## 安装

```bash
npm install @dtax/tax-engine
```

## 快速示例

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

无需编写任何代码，直接在命令行计算税务：

```bash
npx @dtax/cli calculate trades.csv --method FIFO
npx @dtax/cli calculate trades.csv --method LIFO --year 2025 --json
npx @dtax/cli calculate coinbase.csv binance.csv --method HIFO
```

全局安装以便反复使用：

```bash
npm install -g @dtax/cli
dtax calculate trades.csv --method FIFO --form8949 report.csv
dtax calculate trades.csv --schedule-d --include-wash-sales
```

## 支持的交易所（23 个解析器）

所有解析器自动检测 CSV 格式，无需任何配置。

| 类别     | 交易所                                                                              |
| -------- | ----------------------------------------------------------------------------------- |
| 主流     | Coinbase, Binance, Binance US, Kraken, Gemini                                       |
| 全球     | KuCoin, OKX, Bybit, Gate.io, Bitget, MEXC, HTX (Huobi)                              |
| 其他     | Crypto.com, Bitfinex, Poloniex                                                      |
| 链上     | Etherscan (ETH + ERC-20 + BSC/Polygon/Avalanche/Fantom), Solscan (SOL + SPL + DeFi) |
| 迁移导入 | Koinly, CoinTracker, Cryptact（从竞品导入）                                         |
| 通用     | Generic CSV（自定义列映射）                                                         |

## 功能特性

- **4 种成本基础方法** -- FIFO、LIFO、HIFO、Specific ID（符合 IRS 规定）
- **Form 8949** -- CSV、PDF 和 TXF（TurboTax）导出，支持 Box A-F 分类
- **Schedule D** -- Part I/II 汇总、$3,000 亏损限额、结转计算
- **洗售检测** -- 30 天窗口期、部分不允许扣除、Form 8949 code W
- **假设模拟器** -- 卖出前预览税务影响（`simulateSale()`）
- **方法对比** -- 在 FIFO/LIFO/HIFO 中找到最优方法（`compareAllMethods()`）
- **DeFi + NFT 支持** -- LP 存取、质押、封装、跨链桥、12 种 DeFi 交易类型
- **1099-DA 对账** -- 3 阶段与券商报告数据匹配
- **投资组合分析** -- 持仓汇总、未实现盈亏、税务亏损收割机会
- **钱包隔离核算** -- 严格按钱包隔离成本基础
- **内部转账匹配** -- 自动检测你自己钱包之间的转账

## 与替代方案的对比

| 功能特性          |    dTax    |  Rotki  |   RP2    |
| ----------------- | :--------: | :-----: | :------: |
| 编程语言          | TypeScript | Python  |  Python  |
| 支持 npm 安装     |    Yes     |   No    |    No    |
| 交易所解析器      |     23     |   15    |    8     |
| 成本基础方法      |     4      |    3    |    3     |
| Form 8949 PDF     |    Yes     |   No    |    No    |
| TurboTax TXF 导出 |    Yes     |   No    |    No    |
| Schedule D 生成   |    Yes     |   No    |    No    |
| 洗售检测          |    Yes     |   Yes   |    No    |
| 假设模拟器        |    Yes     |   No    |    No    |
| 方法对比          |    Yes     |   No    |    No    |
| DeFi/NFT 交易类型 |     12     |    8    |    4     |
| 1099-DA 对账      |    Yes     |   No    |    No    |
| 竞品 CSV 导入     |    Yes     |   No    |    No    |
| CLI 工具          |    Yes     |   Yes   |   Yes    |
| 浏览器/Node.js    |    Both    | Desktop | CLI only |

## 包

| 包                                            | 描述                       |
| --------------------------------------------- | -------------------------- |
| [`@dtax/tax-engine`](packages/tax-engine)     | 核心计算引擎、解析器、报表 |
| [`@dtax/cli`](packages/cli)                   | 命令行界面                 |
| [`@dtax/shared-types`](packages/shared-types) | TypeScript 类型定义        |

## API 亮点

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

## 贡献

欢迎贡献。请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解贡献指南。

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9
git clone https://github.com/dTaxLab/dtax.git && cd dtax
pnpm install
pnpm test        # 800+ tests across all packages
pnpm build       # build all packages
```

## 许可证

本仓库中的所有包均采用 [AGPL-3.0](LICENSE) 许可证。

这意味着你可以在项目中自由使用 dTax。如果你修改源代码并分发（包括作为网络服务），你必须在 AGPL-3.0 下发布你的修改。

商业许可咨询：[getdtax.com](https://getdtax.com)

## 链接

- 官网：[getdtax.com](https://getdtax.com)
- 问题反馈：[GitHub Issues](https://github.com/dTaxLab/dtax/issues)
- 讨论：[GitHub Discussions](https://github.com/dTaxLab/dtax/discussions)
