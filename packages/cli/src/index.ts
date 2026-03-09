#!/usr/bin/env node

/**
 * @dtax/cli
 *
 * Command-line interface for DTax crypto tax calculator.
 * Reads CSV files, calculates capital gains, and outputs reports.
 *
 * @license AGPL-3.0
 */

import { readFileSync, writeFileSync } from "fs";
import {
  CostBasisCalculator,
  parseCsv,
  generateForm8949,
  form8949ToCsv,
  generateScheduleD,
  detectWashSales,
} from "@dtax/tax-engine";
import type {
  TaxLot,
  TaxableEvent,
  LotDateMap,
  CostBasisMethod,
  CsvFormat,
  CsvParseResult,
  ParsedTransaction,
  CsvParseError,
  AcquisitionRecord,
  WashSaleAdjustment,
} from "@dtax/tax-engine";
import { parseArgs, toTaxLot, toTaxableEvent } from "./lib";

const VERSION = "0.1.0";

function printUsage(): void {
  console.log(`DTax CLI v${VERSION}`);
  console.log("");
  console.log("Usage: dtax <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log(
    "  calculate <csv-file>  Calculate capital gains from a CSV file",
  );
  console.log("  help                  Show this help message");
  console.log("  version               Show version number");
  console.log("");
  console.log("Run 'dtax calculate --help' for calculate-specific options.");
  console.log("");
  console.log("https://dtax.dev");
}

function printCalculateHelp(): void {
  console.log(`DTax CLI v${VERSION} — calculate`);
  console.log("");
  console.log("Usage: dtax calculate <csv-file> [csv-file2 ...] [options]");
  console.log("");
  console.log("Options:");
  console.log("  --method <FIFO|LIFO|HIFO>  Cost basis method (default: FIFO)");
  console.log("  --year <YYYY>              Tax year to report (default: all)");
  console.log(
    "  --format <csv-format>      CSV format hint (default: auto-detect)",
  );
  console.log("  --output <file>            Write Form 8949 CSV to file");
  console.log("  --include-wash-sales       Detect and report wash sales");
  console.log("  --schedule-d               Show Schedule D summary");
  console.log("  --json                     Output report as JSON");
  console.log("");
  console.log("Supported formats:");
  console.log("  coinbase, binance, binance_us, kraken, gemini, crypto_com,");
  console.log("  kucoin, okx, bybit, gate, bitget, mexc, htx,");
  console.log("  etherscan, etherscan_erc20, solscan, generic");
  console.log("");
  console.log("Examples:");
  console.log("  dtax calculate transactions.csv");
  console.log("  dtax calculate coinbase.csv --method HIFO --year 2025");
  console.log("  dtax calculate trades.csv --output form8949.csv");
  console.log("  dtax calculate trades.csv --include-wash-sales --schedule-d");
  console.log("  dtax calculate coinbase.csv binance.csv kraken.csv");
}

function calculate(files: string[], flags: Record<string, string>): void {
  const method = (flags.method?.toUpperCase() || "FIFO") as CostBasisMethod;
  if (!["FIFO", "LIFO", "HIFO"].includes(method)) {
    console.error(
      `Error: Invalid method "${method}". Use FIFO, LIFO, or HIFO.`,
    );
    process.exit(1);
  }

  const yearFilter = flags.year ? parseInt(flags.year) : undefined;
  if (yearFilter && (isNaN(yearFilter) || yearFilter < 2009)) {
    console.error(`Error: Invalid year "${flags.year}".`);
    process.exit(1);
  }

  // Read and parse all CSV files, merge transactions
  const format = flags.format as CsvFormat | undefined;
  const allTransactions: ParsedTransaction[] = [];
  const allErrors: CsvParseError[] = [];
  let lastFormat: string = "generic";
  let parsed: CsvParseResult;

  for (const file of files) {
    let csvContent: string;
    try {
      csvContent = readFileSync(file, "utf-8");
    } catch {
      console.error(`Error: Cannot read file "${file}"`);
      process.exit(1);
    }

    const result = parseCsv(csvContent, format ? { format } : undefined);
    allTransactions.push(...result.transactions);
    allErrors.push(...result.errors);
    lastFormat = result.summary.format;

    if (files.length > 1) {
      console.log(
        `  ${file}: ${result.transactions.length} transactions (${result.summary.format})`,
      );
    }
  }

  // Sort by timestamp for correct lot ordering across files
  if (files.length > 1) {
    allTransactions.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  // Build merged parse result
  parsed = {
    transactions: allTransactions,
    errors: allErrors,
    summary: {
      format: (files.length > 1 ? "generic" : lastFormat) as CsvFormat,
      totalRows: allTransactions.length + allErrors.length,
      parsed: allTransactions.length,
      failed: allErrors.length,
    },
  };

  if (allErrors.length > 0) {
    console.error(`${allErrors.length} parse errors:`);
    for (const err of allErrors.slice(0, 5)) {
      console.error(`   Row ${err.row}: ${err.message}`);
    }
    if (allErrors.length > 5) {
      console.error(`   ... and ${allErrors.length - 5} more`);
    }
  }

  if (parsed.transactions.length === 0) {
    console.error("Error: No valid transactions found in CSV.");
    process.exit(1);
  }

  console.log(
    `Parsed ${parsed.transactions.length} transactions${files.length > 1 ? ` from ${files.length} files` : ` (format: ${parsed.summary.format})`}`,
  );

  // Separate into lots (acquisitions) and events (dispositions)
  const lots: TaxLot[] = [];
  const events: TaxableEvent[] = [];

  for (let i = 0; i < parsed.transactions.length; i++) {
    const tx = parsed.transactions[i];

    const lot = toTaxLot(tx, i);
    if (lot) lots.push(lot);

    const event = toTaxableEvent(tx, i, yearFilter);
    if (event) events.push(event);
  }

  console.log(
    `${lots.length} acquisition lots, ${events.length} dispositions${yearFilter ? ` (year ${yearFilter})` : ""}`,
  );
  console.log(`Method: ${method}`);
  console.log("");

  // Calculate
  const calculator = new CostBasisCalculator(method);
  calculator.addLots(lots);

  let shortTermGains = 0,
    shortTermLosses = 0;
  let longTermGains = 0,
    longTermLosses = 0;
  const results = [];

  for (const event of events) {
    const result = calculator.calculate(event);
    results.push(result);

    if (result.holdingPeriod === "SHORT_TERM") {
      if (result.gainLoss >= 0) shortTermGains += result.gainLoss;
      else shortTermLosses += Math.abs(result.gainLoss);
    } else {
      if (result.gainLoss >= 0) longTermGains += result.gainLoss;
      else longTermLosses += Math.abs(result.gainLoss);
    }
  }

  const netGainLoss =
    shortTermGains - shortTermLosses + (longTermGains - longTermLosses);

  // Wash sale detection
  const includeWashSales = flags["include-wash-sales"] === "true";
  let washSaleAdjustments: Map<string, WashSaleAdjustment> | undefined;
  let washSaleSummary:
    | { totalDisallowed: number; adjustmentCount: number }
    | undefined;

  if (includeWashSales) {
    const acqRecords: AcquisitionRecord[] = lots.map((l) => ({
      lotId: l.id,
      asset: l.asset,
      amount: l.amount,
      acquiredAt: l.acquiredAt,
    }));
    const consumedLotIds = new Set(
      results.flatMap((r) => r.matchedLots.map((m) => m.lotId)),
    );
    const washResult = detectWashSales(results, acqRecords, consumedLotIds);
    washSaleAdjustments = new Map(
      washResult.adjustments.map((a) => [a.lossEventId, a]),
    );
    washSaleSummary = {
      totalDisallowed: washResult.totalDisallowed,
      adjustmentCount: washResult.adjustments.length,
    };
  }

  // Form 8949 + Schedule D generation
  const lotDates: LotDateMap = new Map(lots.map((l) => [l.id, l.acquiredAt]));
  const taxYear = yearFilter || new Date().getFullYear();
  const form8949Report = generateForm8949(results, {
    taxYear,
    lotDates,
    reportingBasis: "none",
    washSaleAdjustments,
  });

  const showScheduleD = flags["schedule-d"] === "true";
  const scheduleDReport = showScheduleD
    ? generateScheduleD(form8949Report)
    : undefined;

  // Output
  if (flags.json === "true") {
    const output: Record<string, unknown> = {
      method,
      taxYear: yearFilter || "all",
      shortTermGains,
      shortTermLosses,
      longTermGains,
      longTermLosses,
      netGainLoss,
      totalDispositions: events.length,
      results,
    };
    if (washSaleSummary) output.washSales = washSaleSummary;
    if (scheduleDReport) output.scheduleD = scheduleDReport;
    console.log(JSON.stringify(output, null, 2));
  } else {
    const fmt = (n: number) =>
      n.toLocaleString("en-US", { style: "currency", currency: "USD" });

    console.log("=".repeat(39));
    console.log("        DTax Tax Calculation Report");
    console.log("=".repeat(39));
    console.log("");
    console.log(`  Short-Term Gains:   ${fmt(shortTermGains)}`);
    console.log(`  Short-Term Losses:  (${fmt(shortTermLosses)})`);
    console.log(
      `  Short-Term Net:     ${fmt(shortTermGains - shortTermLosses)}`,
    );
    console.log("");
    console.log(`  Long-Term Gains:    ${fmt(longTermGains)}`);
    console.log(`  Long-Term Losses:   (${fmt(longTermLosses)})`);
    console.log(`  Long-Term Net:      ${fmt(longTermGains - longTermLosses)}`);
    console.log("");
    console.log("-".repeat(39));
    console.log(`  NET GAIN/LOSS:      ${fmt(netGainLoss)}`);
    console.log(`  Total Dispositions: ${events.length}`);
    console.log("=".repeat(39));

    if (washSaleSummary && washSaleSummary.adjustmentCount > 0) {
      console.log("");
      console.log("  WASH SALES DETECTED");
      console.log(
        `  Disallowed Losses:  ${fmt(washSaleSummary.totalDisallowed)}`,
      );
      console.log(`  Wash Sale Events:   ${washSaleSummary.adjustmentCount}`);
    }

    if (scheduleDReport) {
      console.log("");
      console.log("=".repeat(39));
      console.log("          Schedule D Summary");
      console.log("=".repeat(39));
      console.log("");
      console.log(`  Net Short-Term:     ${fmt(scheduleDReport.netShortTerm)}`);
      console.log(`  Net Long-Term:      ${fmt(scheduleDReport.netLongTerm)}`);
      console.log(
        `  Combined Net:       ${fmt(scheduleDReport.combinedNetGainLoss)}`,
      );
      if (scheduleDReport.capitalLossDeduction > 0) {
        console.log(
          `  Loss Deduction:     (${fmt(scheduleDReport.capitalLossDeduction)})`,
        );
        console.log(
          `  Carryover Loss:     (${fmt(scheduleDReport.carryoverLoss)})`,
        );
      }
      console.log("=".repeat(39));
    }
  }

  // Generate Form 8949 CSV if output requested
  if (flags.output) {
    const csv = form8949ToCsv(form8949Report);
    writeFileSync(flags.output, csv, "utf-8");
    console.log(`\nForm 8949 CSV written to: ${flags.output}`);
  }
}

// Graceful Ctrl+C handling
process.on("SIGINT", () => {
  console.log("\nInterrupted.");
  process.exit(130);
});

// Main
const args = process.argv.slice(2);
const { command, files, flags } = parseArgs(args);

if (flags.version === "true" || command === "version") {
  console.log(VERSION);
  process.exit(0);
}

if (
  !command ||
  command === "help" ||
  (flags.help === "true" && command !== "calculate")
) {
  printUsage();
  process.exit(0);
}

if (command === "calculate") {
  if (flags.help === "true") {
    printCalculateHelp();
    process.exit(0);
  }
  if (files.length === 0) {
    console.error("Error: Please provide a CSV file path.");
    console.error(
      "Usage: dtax calculate <csv-file> [csv-file2 ...] [--method FIFO]",
    );
    process.exit(1);
  }
  calculate(files, flags);
} else {
  console.error(`Unknown command: "${command}"`);
  printUsage();
  process.exit(1);
}
