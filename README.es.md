<p align="center">
  <img src="docs/logo.png" alt="dTax" width="120" height="120">
  <h1 align="center">dTax</h1>
  <p align="center">
    <strong>El único motor completo de impuestos cripto en TypeScript disponible en npm</strong>
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

**23 parsers de exchanges** | **8 métodos de base de coste** — FIFO / LIFO / HIFO / UK Share Pooling / +4 más | **Form 8949 + Schedule D** | **Detección de wash sales** | **Simulador de escenarios**

## Instalación

```bash
npm install @dtax/tax-engine
```

## Ejemplo rápido

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

Calcula impuestos desde la línea de comandos sin escribir código:

```bash
npx @dtax/cli calculate trades.csv --method FIFO
npx @dtax/cli calculate trades.csv --method LIFO --year 2025 --json
npx @dtax/cli calculate coinbase.csv binance.csv --method HIFO
```

Instala globalmente para uso frecuente:

```bash
npm install -g @dtax/cli
dtax calculate trades.csv --method FIFO --form8949 report.csv
dtax calculate trades.csv --schedule-d --include-wash-sales
```

## Exchanges soportados (23 parsers)

Todos los parsers detectan automáticamente el formato CSV. No requiere configuración.

| Categoría   | Exchanges                                                                           |
| ----------- | ----------------------------------------------------------------------------------- |
| Principales | Coinbase, Binance, Binance US, Kraken, Gemini                                       |
| Globales    | KuCoin, OKX, Bybit, Gate.io, Bitget, MEXC, HTX (Huobi)                              |
| Otros       | Crypto.com, Bitfinex, Poloniex                                                      |
| On-chain    | Etherscan (ETH + ERC-20 + BSC/Polygon/Avalanche/Fantom), Solscan (SOL + SPL + DeFi) |
| Migración   | Koinly, CoinTracker, Cryptact (importar desde competidores)                         |
| Genérico    | Generic CSV (mapea tus propias columnas)                                            |

## Características

- **8 métodos de base de coste** -- FIFO, LIFO, HIFO, Specific ID, UK Share Pooling, Germany FIFO, PMPA, Total Average (EE.UU. + internacional)
- **Form 8949** -- Exportación en CSV, PDF y TXF (TurboTax) con clasificación Box A-F
- **Schedule D** -- Agregación Part I/II, límite de pérdidas de $3,000, cálculo de arrastre
- **Detección de wash sales** -- Ventana de 30 días, rechazo parcial, código W en Form 8949
- **Simulador de escenarios** -- Previsualiza el impacto fiscal antes de vender (`simulateSale()`)
- **Comparación de métodos** -- Encuentra el método óptimo entre FIFO/LIFO/HIFO (`compareAllMethods()`)
- **Soporte DeFi + NFT** -- Depósitos/retiros de LP, staking, wraps, bridges, 12 tipos de transacciones DeFi
- **Reconciliación 1099-DA** -- Coincidencia en 3 fases contra datos reportados por brokers
- **Análisis de portafolio** -- Agregación de posiciones, P&L no realizado, oportunidades de tax-loss harvesting
- **Contabilidad aislada por wallet** -- Aislamiento estricto de base de costo por wallet
- **Detección de transferencias internas** -- Detección automática de transferencias entre tus propias wallets

## Comparación con alternativas

| Característica                  |    dTax    |  Rotki  |   RP2    |
| ------------------------------- | :--------: | :-----: | :------: |
| Lenguaje                        | TypeScript | Python  |  Python  |
| Instalable vía npm              |    Yes     |   No    |    No    |
| Parsers de exchanges            |     23     |   15    |    8     |
| Métodos de base de costo        |     8      |    3    |    3     |
| Form 8949 PDF                   |    Yes     |   No    |    No    |
| Exportación TXF TurboTax        |    Yes     |   No    |    No    |
| Generación de Schedule D        |    Yes     |   No    |    No    |
| Detección de wash sales         |    Yes     |   Yes   |    No    |
| Simulador de escenarios         |    Yes     |   No    |    No    |
| Comparación de métodos          |    Yes     |   No    |    No    |
| Tipos de tx DeFi/NFT            |     12     |    8    |    4     |
| Reconciliación 1099-DA          |    Yes     |   No    |    No    |
| Importación CSV de competidores |    Yes     |   No    |    No    |
| Herramienta CLI                 |    Yes     |   Yes   |   Yes    |
| Navegador/Node.js               |    Both    | Desktop | CLI only |

## Paquetes

| Paquete                                       | Descripción                                   |
| --------------------------------------------- | --------------------------------------------- |
| [`@dtax/tax-engine`](packages/tax-engine)     | Motor de cálculo principal, parsers, reportes |
| [`@dtax/cli`](packages/cli)                   | Interfaz de línea de comandos                 |
| [`@dtax/shared-types`](packages/shared-types) | Definiciones de tipos TypeScript              |

## Aspectos destacados de la API

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

## Contribuir

Las contribuciones son bienvenidas. Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para las directrices.

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9
git clone https://github.com/dTaxLab/dtax.git && cd dtax
pnpm install
pnpm test        # 980+ tests across all packages
pnpm build       # build all packages
```

## Licencia

Todos los paquetes en este repositorio están licenciados bajo [AGPL-3.0](LICENSE).

Esto significa que puedes usar dTax libremente en tus proyectos. Si modificas el código fuente y lo distribuyes (incluyendo como un servicio en red), debes publicar tus modificaciones bajo AGPL-3.0.

Para consultas sobre licencias comerciales: [getdtax.com](https://getdtax.com)

## Enlaces

- Sitio web: [getdtax.com](https://getdtax.com)
- Problemas: [GitHub Issues](https://github.com/dTaxLab/dtax/issues)
- Discusiones: [GitHub Discussions](https://github.com/dTaxLab/dtax/discussions)
