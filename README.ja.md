<p align="center">
  <img src="docs/logo.png" alt="dTax" width="120" height="120">
  <h1 align="center">dTax</h1>
  <p align="center">
    <strong>npm で利用できる唯一の完全な TypeScript 暗号資産税務エンジン</strong>
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

**23 種の取引所パーサー** | **8つのコスト基準方式 — FIFO / LIFO / HIFO / UK Share Pooling / 他4種** | **Form 8949 + Schedule D** | **ウォッシュセール検出** | **What-if シミュレーター**

## インストール

```bash
npm install @dtax/tax-engine
```

## クイック例

```typescript
import {
  parseCsv,
  CostBasisCalculator,
  generateForm8949,
} from "@dtax/tax-engine";

// 1. 任意の取引所 CSV を解析（フォーマット自動検出）
const { lots, events } = parseCsv(csvString);

// 2. 損益を計算
const calc = new CostBasisCalculator("FIFO");
calc.addLots(lots);
const results = events.map((e) => calc.calculate(e));

// 3. IRS Form 8949 を生成
const report = generateForm8949(results);
```

## CLI

コードを書かずにコマンドラインから税金を計算できます：

```bash
npx @dtax/cli calculate trades.csv --method FIFO
npx @dtax/cli calculate trades.csv --method LIFO --year 2025 --json
npx @dtax/cli calculate coinbase.csv binance.csv --method HIFO
```

グローバルインストールして繰り返し使用：

```bash
npm install -g @dtax/cli
dtax calculate trades.csv --method FIFO --form8949 report.csv
dtax calculate trades.csv --schedule-d --include-wash-sales
```

## 対応取引所（23 パーサー）

すべてのパーサーは CSV フォーマットを自動検出します。設定は不要です。

| カテゴリ       | 取引所                                                                              |
| -------------- | ----------------------------------------------------------------------------------- |
| 主要           | Coinbase, Binance, Binance US, Kraken, Gemini                                       |
| グローバル     | KuCoin, OKX, Bybit, Gate.io, Bitget, MEXC, HTX (Huobi)                              |
| その他         | Crypto.com, Bitfinex, Poloniex                                                      |
| オンチェーン   | Etherscan (ETH + ERC-20 + BSC/Polygon/Avalanche/Fantom), Solscan (SOL + SPL + DeFi) |
| 移行           | Koinly, CoinTracker, Cryptact（競合サービスからのインポート）                       |
| フォールバック | Generic CSV（独自のカラムをマッピング）                                             |

## 機能

- **8つのコスト基準方式** -- FIFO、LIFO、HIFO、Specific ID、UK Share Pooling、Germany FIFO、PMPA、Total Average（米国 + 海外対応）
- **Form 8949** -- CSV、PDF、TXF（TurboTax）エクスポート、Box A-F 分類対応
- **Schedule D** -- Part I/II 集計、$3,000 損失上限、繰越計算
- **ウォッシュセール検出** -- 30 日間ウィンドウ、部分的否認、Form 8949 コード W
- **What-if シミュレーター** -- 売却前に税金への影響をプレビュー（`simulateSale()`）
- **方式比較** -- FIFO/LIFO/HIFO 全方式で最適な方式を検索（`compareAllMethods()`）
- **DeFi + NFT 対応** -- LP 入出金、ステーキング、ラップ、ブリッジ、12 種類の DeFi トランザクションタイプ
- **1099-DA 照合** -- ブローカー報告データとの 3 フェーズマッチング
- **ポートフォリオ分析** -- 保有資産集計、未実現損益、タックスロスハーベスティング機会
- **ウォレット分離会計** -- ウォレットごとの厳密な取得原価分離
- **内部送金マッチング** -- 自分のウォレット間の送金を自動検出

## 代替ツールとの比較

| 機能                            |    dTax    |  Rotki  |   RP2    |
| ------------------------------- | :--------: | :-----: | :------: |
| 言語                            | TypeScript | Python  |  Python  |
| npm インストール可能            |    Yes     |   No    |    No    |
| 取引所パーサー                  |     23     |   15    |    8     |
| 取得原価計算方式                |     8      |    3    |    3     |
| Form 8949 PDF                   |    Yes     |   No    |    No    |
| TurboTax TXF エクスポート       |    Yes     |   No    |    No    |
| Schedule D 生成                 |    Yes     |   No    |    No    |
| ウォッシュセール検出            |    Yes     |   Yes   |    No    |
| What-if シミュレーター          |    Yes     |   No    |    No    |
| 方式比較                        |    Yes     |   No    |    No    |
| DeFi/NFT トランザクションタイプ |     12     |    8    |    4     |
| 1099-DA 照合                    |    Yes     |   No    |    No    |
| 競合 CSV インポート             |    Yes     |   No    |    No    |
| CLI ツール                      |    Yes     |   Yes   |   Yes    |
| ブラウザ/Node.js                |    Both    | Desktop | CLI only |

## パッケージ

| パッケージ                                    | 説明                                 |
| --------------------------------------------- | ------------------------------------ |
| [`@dtax/tax-engine`](packages/tax-engine)     | コア計算エンジン、パーサー、レポート |
| [`@dtax/cli`](packages/cli)                   | コマンドラインインターフェース       |
| [`@dtax/shared-types`](packages/shared-types) | TypeScript 型定義                    |

## API ハイライト

```typescript
// 取得原価計算
import { calculateFIFO, calculateLIFO, calculateHIFO } from "@dtax/tax-engine";

// レポート
import {
  generateForm8949,
  form8949ToCsv,
  generateForm8949Pdf,
} from "@dtax/tax-engine";
import { generateScheduleD } from "@dtax/tax-engine";
import { form8949ToTxf } from "@dtax/tax-engine"; // TurboTax

// 分析
import { detectWashSales } from "@dtax/tax-engine";
import { simulateSale } from "@dtax/tax-engine"; // what-if
import { compareAllMethods } from "@dtax/tax-engine"; // オプティマイザー
import { analyzeHoldings } from "@dtax/tax-engine"; // ポートフォリオ

// パーサー（自動検出または個別使用）
import { parseCsv, detectCsvFormat } from "@dtax/tax-engine";
```

## コントリビューション

コントリビューションを歓迎します。ガイドラインは [CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

```bash
# 前提条件: Node.js >= 20, pnpm >= 9
git clone https://github.com/dTaxLab/dtax.git && cd dtax
pnpm install
pnpm test        # 全パッケージで 980 以上のテスト
pnpm build       # 全パッケージをビルド
```

## ライセンス

このリポジトリのすべてのパッケージは [AGPL-3.0](LICENSE) の下でライセンスされています。

dTax はプロジェクトで自由にご利用いただけます。ソースコードを改変して配布する場合（ネットワークサービスとしての提供を含む）、改変部分を AGPL-3.0 の下で公開する必要があります。

商用ライセンスに関するお問い合わせ: [getdtax.com](https://getdtax.com)

## リンク

- ウェブサイト: [getdtax.com](https://getdtax.com)
- Issues: [GitHub Issues](https://github.com/dTaxLab/dtax/issues)
- ディスカッション: [GitHub Discussions](https://github.com/dTaxLab/dtax/discussions)
