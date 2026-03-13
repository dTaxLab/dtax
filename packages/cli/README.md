# @dtax/cli

[![npm version](https://img.shields.io/npm/v/@dtax/cli.svg)](https://www.npmjs.com/package/@dtax/cli)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Command-line crypto tax calculator. Reads CSV exports from 23+ exchanges, calculates capital gains, and generates IRS Form 8949 reports.

## Install

```bash
npm install -g @dtax/cli
```

## Usage

```
dtax <command> [options]

Commands:
  calculate <csv-file>  Calculate capital gains from a CSV file
  help                  Show help message
  version               Show version number
```

## Options

| Flag                          | Description                                 | Default     |
| ----------------------------- | ------------------------------------------- | ----------- |
| `--method <FIFO\|LIFO\|HIFO>` | Cost basis method                           | `FIFO`      |
| `--year <YYYY>`               | Filter to a specific tax year               | all years   |
| `--format <csv-format>`       | Force CSV format (skip auto-detection)      | auto-detect |
| `--output <file>`             | Write Form 8949 CSV to a file               | stdout only |
| `--include-wash-sales`        | Detect and report wash sales                | off         |
| `--schedule-d`                | Show Schedule D summary                     | off         |
| `--compare`                   | Compare FIFO, LIFO, and HIFO side by side   | off         |
| `--currency <CODE>`           | Display currency code                       | `USD`       |
| `--rate <number>`             | Exchange rate vs USD (e.g., `0.92` for EUR) | `1`         |
| `--json`                      | Output the full report as JSON              | off         |
| `--help`                      | Show help for a command                     | --          |
| `--version`                   | Print version number                        | --          |

## Examples

### Basic Calculation

```bash
dtax calculate transactions.csv
```

```
Parsed 42 transactions (format: coinbase)
18 acquisition lots, 24 dispositions
Method: FIFO

=======================================
        DTax Tax Calculation Report
=======================================

  Short-Term Gains:   $1,200.00
  Short-Term Losses:  ($350.00)
  Short-Term Net:     $850.00

  Long-Term Gains:    $5,400.00
  Long-Term Losses:   ($800.00)
  Long-Term Net:      $4,600.00

---------------------------------------
  NET GAIN/LOSS:      $5,450.00
  Total Dispositions: 24
=======================================
```

### Specify Cost Basis Method and Tax Year

```bash
dtax calculate coinbase.csv --method HIFO --year 2025
```

### Export Form 8949 CSV

```bash
dtax calculate trades.csv --output form8949.csv
```

### Wash Sales + Schedule D

```bash
dtax calculate trades.csv --include-wash-sales --schedule-d
```

### Multiple CSV Files

```bash
dtax calculate coinbase.csv binance.csv kraken.csv
```

Transactions from all files are merged and sorted by timestamp before calculation.

### JSON Output

```bash
dtax calculate trades.csv --json > report.json
```

### Non-USD Currency

```bash
dtax calculate trades.csv --currency EUR --rate 0.92
```

### Method Comparison

```bash
dtax calculate trades.csv --compare
```

Outputs a side-by-side table comparing tax outcomes under FIFO, LIFO, and HIFO.

## Supported CSV Formats

The CLI auto-detects the exchange format from CSV headers. You can also force a format with `--format`:

`coinbase`, `binance`, `binance_us`, `kraken`, `gemini`, `crypto_com`, `kucoin`, `okx`, `bybit`, `gate`, `bitget`, `mexc`, `htx`, `bitfinex`, `poloniex`, `etherscan`, `etherscan_erc20`, `solscan`, `solscan_defi`, `koinly`, `cointracker`, `cryptact`, `generic`

## Requirements

- Node.js >= 20.0.0

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) -- see [LICENSE](./LICENSE) for details.

Part of the [DTax](https://github.com/dTaxLab/dtax) project.
