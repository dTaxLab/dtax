<p align="center">
  <img src="apps/web/public/logo-512.png" alt="dTax" width="120" height="120">
  <h1 align="center">dTax</h1>
  <p align="center">
    <strong>O único motor completo de impostos sobre criptomoedas em TypeScript no npm</strong>
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

**23 parsers de exchanges** | **FIFO / LIFO / HIFO / Specific ID** | **Form 8949 + Schedule D** | **Detecção de wash sale** | **Simulador what-if**

## Instalação

```bash
npm install @dtax/tax-engine
```

## Exemplo Rápido

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

Calcule impostos pela linha de comando sem escrever nenhum código:

```bash
npx @dtax/cli calculate trades.csv --method FIFO
npx @dtax/cli calculate trades.csv --method LIFO --year 2025 --json
npx @dtax/cli calculate coinbase.csv binance.csv --method HIFO
```

Instale globalmente para uso frequente:

```bash
npm install -g @dtax/cli
dtax calculate trades.csv --method FIFO --form8949 report.csv
dtax calculate trades.csv --schedule-d --include-wash-sales
```

## Exchanges Suportadas (23 Parsers)

Todos os parsers detectam automaticamente o formato do CSV. Nenhuma configuração necessária.

| Categoria  | Exchanges                                                                           |
| ---------- | ----------------------------------------------------------------------------------- |
| Principais | Coinbase, Binance, Binance US, Kraken, Gemini                                       |
| Globais    | KuCoin, OKX, Bybit, Gate.io, Bitget, MEXC, HTX (Huobi)                              |
| Outras     | Crypto.com, Bitfinex, Poloniex                                                      |
| On-chain   | Etherscan (ETH + ERC-20 + BSC/Polygon/Avalanche/Fantom), Solscan (SOL + SPL + DeFi) |
| Migração   | Koinly, CoinTracker, Cryptact (importação de concorrentes)                          |
| Genérico   | Generic CSV (mapeie suas próprias colunas)                                          |

## Funcionalidades

- **4 métodos de custo base** -- FIFO, LIFO, HIFO, Specific ID (em conformidade com o IRS)
- **Form 8949** -- Exportação em CSV, PDF e TXF (TurboTax) com classificação Box A-F
- **Schedule D** -- Agregação Parte I/II, limite de perda de $3.000, cálculo de compensação
- **Detecção de wash sale** -- Janela de 30 dias, desqualificação parcial, código W no Form 8949
- **Simulador what-if** -- Visualize o impacto fiscal antes de vender (`simulateSale()`)
- **Comparação de métodos** -- Encontre o método ideal entre FIFO/LIFO/HIFO (`compareAllMethods()`)
- **Suporte a DeFi + NFT** -- Depósitos/retiradas de LP, staking, wraps, bridges, 12 tipos de transação DeFi
- **Reconciliação 1099-DA** -- Correspondência em 3 fases com dados reportados por corretoras
- **Análise de portfólio** -- Agregação de posições, P&L não realizado, oportunidades de tax-loss harvesting
- **Contabilidade isolada por carteira** -- Isolamento estrito do custo base por carteira
- **Correspondência de transferências internas** -- Detecção automática de transferências entre suas próprias carteiras

## Comparação com Alternativas

| Funcionalidade              |    dTax    |  Rotki  |    RP2     |
| --------------------------- | :--------: | :-----: | :--------: |
| Linguagem                   | TypeScript | Python  |   Python   |
| Instalável via npm          |    Sim     |   Não   |    Não     |
| Parsers de exchanges        |     23     |   15    |     8      |
| Métodos de custo base       |     4      |    3    |     3      |
| Form 8949 PDF               |    Sim     |   Não   |    Não     |
| Exportação TXF TurboTax     |    Sim     |   Não   |    Não     |
| Geração de Schedule D       |    Sim     |   Não   |    Não     |
| Detecção de wash sale       |    Sim     |   Sim   |    Não     |
| Simulador what-if           |    Sim     |   Não   |    Não     |
| Comparação de métodos       |    Sim     |   Não   |    Não     |
| Tipos de tx DeFi/NFT        |     12     |    8    |     4      |
| Reconciliação 1099-DA       |    Sim     |   Não   |    Não     |
| Importação CSV concorrentes |    Sim     |   Não   |    Não     |
| Ferramenta CLI              |    Sim     |   Sim   |    Sim     |
| Browser/Node.js             |   Ambos    | Desktop | Apenas CLI |

## Pacotes

| Pacote                                        | Descrição                                       |
| --------------------------------------------- | ----------------------------------------------- |
| [`@dtax/tax-engine`](packages/tax-engine)     | Motor de cálculo principal, parsers, relatórios |
| [`@dtax/cli`](packages/cli)                   | Interface de linha de comando                   |
| [`@dtax/shared-types`](packages/shared-types) | Definições de tipos TypeScript                  |

## Destaques da API

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

## Contribuindo

Contribuições são bem-vindas. Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para as diretrizes.

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9
git clone https://github.com/dTaxLab/dtax.git && cd dtax
pnpm install
pnpm test        # 800+ tests across all packages
pnpm build       # build all packages
```

## Licença

Todos os pacotes neste repositório são licenciados sob [AGPL-3.0](LICENSE).

Isso significa que você pode usar o dTax livremente em seus projetos. Se você modificar o código-fonte e distribuí-lo (incluindo como um serviço de rede), você deve disponibilizar suas modificações sob AGPL-3.0.

Para consultas sobre licenciamento comercial: [getdtax.com](https://getdtax.com)

## Links

- Website: [getdtax.com](https://getdtax.com)
- Issues: [GitHub Issues](https://github.com/dTaxLab/dtax/issues)
- Discussões: [GitHub Discussions](https://github.com/dTaxLab/dtax/discussions)
