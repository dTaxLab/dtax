<p align="center">
  <img src="docs/logo.png" alt="dTax" width="120" height="120">
  <h1 align="center">dTax</h1>
  <p align="center">
    <strong>npm 上唯一完整的 TypeScript 加密貨幣稅務引擎</strong>
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

**23 個交易所解析器** | **FIFO / LIFO / HIFO / Specific ID** | **Form 8949 + Schedule D** | **洗售偵測** | **模擬試算**

## 安裝

```bash
npm install @dtax/tax-engine
```

## 快速範例

```typescript
import {
  parseCsv,
  CostBasisCalculator,
  generateForm8949,
} from "@dtax/tax-engine";

// 1. 解析任何交易所的 CSV（自動偵測格式）
const { lots, events } = parseCsv(csvString);

// 2. 計算損益
const calc = new CostBasisCalculator("FIFO");
calc.addLots(lots);
const results = events.map((e) => calc.calculate(e));

// 3. 產生 IRS Form 8949
const report = generateForm8949(results);
```

## CLI

無需撰寫任何程式碼，直接從命令列計算稅務：

```bash
npx @dtax/cli calculate trades.csv --method FIFO
npx @dtax/cli calculate trades.csv --method LIFO --year 2025 --json
npx @dtax/cli calculate coinbase.csv binance.csv --method HIFO
```

全域安裝以便重複使用：

```bash
npm install -g @dtax/cli
dtax calculate trades.csv --method FIFO --form8949 report.csv
dtax calculate trades.csv --schedule-d --include-wash-sales
```

## 支援的交易所（23 個解析器）

所有解析器皆自動偵測 CSV 格式，無需任何設定。

| 類別     | 交易所                                                                              |
| -------- | ----------------------------------------------------------------------------------- |
| 主流     | Coinbase, Binance, Binance US, Kraken, Gemini                                       |
| 全球     | KuCoin, OKX, Bybit, Gate.io, Bitget, MEXC, HTX (Huobi)                              |
| 其他     | Crypto.com, Bitfinex, Poloniex                                                      |
| 鏈上     | Etherscan (ETH + ERC-20 + BSC/Polygon/Avalanche/Fantom), Solscan (SOL + SPL + DeFi) |
| 遷移匯入 | Koinly, CoinTracker, Cryptact（從競品匯入）                                         |
| 備用     | Generic CSV（自訂欄位對應）                                                         |

## 功能特色

- **4 種成本基礎方法** -- FIFO、LIFO、HIFO、Specific ID（符合 IRS 規範）
- **Form 8949** -- CSV、PDF 及 TXF（TurboTax）匯出，支援 Box A-F 分類
- **Schedule D** -- Part I/II 彙總、$3,000 虧損上限、結轉計算
- **洗售偵測** -- 30 天窗口期、部分不允許扣除、Form 8949 code W
- **模擬試算** -- 出售前預覽稅務影響（`simulateSale()`）
- **方法比較** -- 在 FIFO/LIFO/HIFO 中找出最佳方法（`compareAllMethods()`）
- **DeFi + NFT 支援** -- LP 存取、質押、封裝、跨鏈橋接，12 種 DeFi 交易類型
- **1099-DA 對帳** -- 3 階段與券商申報資料比對
- **投資組合分析** -- 持倉彙總、未實現損益、稅損收割機會
- **錢包隔離記帳** -- 嚴格的逐錢包成本基礎隔離
- **內部轉帳比對** -- 自動偵測您自有錢包之間的轉帳

## 與替代方案的比較

| 功能              |    dTax    |  Rotki   |  RP2   |
| ----------------- | :--------: | :------: | :----: |
| 語言              | TypeScript |  Python  | Python |
| 可透過 npm 安裝   |     是     |    否    |   否   |
| 交易所解析器      |     23     |    15    |   8    |
| 成本基礎方法      |     4      |    3     |   3    |
| Form 8949 PDF     |     是     |    否    |   否   |
| TurboTax TXF 匯出 |     是     |    否    |   否   |
| Schedule D 產生   |     是     |    否    |   否   |
| 洗售偵測          |     是     |    是    |   否   |
| 模擬試算          |     是     |    否    |   否   |
| 方法比較          |     是     |    否    |   否   |
| DeFi/NFT 交易類型 |     12     |    8     |   4    |
| 1099-DA 對帳      |     是     |    否    |   否   |
| 競品 CSV 匯入     |     是     |    否    |   否   |
| CLI 工具          |     是     |    是    |   是   |
| 瀏覽器/Node.js    |  兩者皆可  | 桌面應用 | 僅 CLI |

## 套件

| 套件                                          | 說明                       |
| --------------------------------------------- | -------------------------- |
| [`@dtax/tax-engine`](packages/tax-engine)     | 核心計算引擎、解析器、報表 |
| [`@dtax/cli`](packages/cli)                   | 命令列介面                 |
| [`@dtax/shared-types`](packages/shared-types) | TypeScript 型別定義        |

## API 重點功能

```typescript
// 成本基礎計算
import { calculateFIFO, calculateLIFO, calculateHIFO } from "@dtax/tax-engine";

// 報表
import {
  generateForm8949,
  form8949ToCsv,
  generateForm8949Pdf,
} from "@dtax/tax-engine";
import { generateScheduleD } from "@dtax/tax-engine";
import { form8949ToTxf } from "@dtax/tax-engine"; // TurboTax

// 分析
import { detectWashSales } from "@dtax/tax-engine";
import { simulateSale } from "@dtax/tax-engine"; // 模擬試算
import { compareAllMethods } from "@dtax/tax-engine"; // 最佳化
import { analyzeHoldings } from "@dtax/tax-engine"; // 投資組合

// 解析器（自動偵測或個別使用）
import { parseCsv, detectCsvFormat } from "@dtax/tax-engine";
```

## 貢獻

歡迎貢獻。請參閱 [CONTRIBUTING.md](CONTRIBUTING.md) 了解指引。

```bash
# 前置需求：Node.js >= 20, pnpm >= 9
git clone https://github.com/dTaxLab/dtax.git && cd dtax
pnpm install
pnpm test        # 所有套件共 800+ 項測試
pnpm build       # 建置所有套件
```

## 授權條款

本儲存庫中的所有套件皆以 [AGPL-3.0](LICENSE) 授權。

這代表您可以自由地在專案中使用 dTax。若您修改原始碼並加以散布（包含作為網路服務提供），您必須以 AGPL-3.0 釋出您的修改內容。

商業授權洽詢：[getdtax.com](https://getdtax.com)

## 連結

- 官方網站：[getdtax.com](https://getdtax.com)
- 問題回報：[GitHub Issues](https://github.com/dTaxLab/dtax/issues)
- 討論區：[GitHub Discussions](https://github.com/dTaxLab/dtax/discussions)
