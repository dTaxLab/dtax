#!/usr/bin/env node

/**
 * @dtax/cli
 *
 * Command-line interface for DTax crypto tax calculator.
 * Reads CSV files, calculates capital gains, and outputs reports.
 *
 * @license AGPL-3.0
 */

import { readFileSync, writeFileSync } from 'fs';
import {
    CostBasisCalculator,
    parseCsv,
    generateForm8949,
    form8949ToCsv,
} from '@dtax/tax-engine';
import type { TaxLot, TaxableEvent, LotDateMap, CostBasisMethod, CsvFormat } from '@dtax/tax-engine';
import { parseArgs, toTaxLot, toTaxableEvent } from './lib';

const VERSION = '0.1.0';

function printUsage(): void {
    console.log(`DTax CLI v${VERSION}`);
    console.log('');
    console.log('Usage: dtax <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  calculate <csv-file>  Calculate capital gains from a CSV file');
    console.log('  help                  Show this help message');
    console.log('');
    console.log('Options for calculate:');
    console.log('  --method <FIFO|LIFO|HIFO>  Cost basis method (default: FIFO)');
    console.log('  --year <YYYY>              Tax year to report (default: all)');
    console.log('  --format <csv-format>      CSV format hint (default: auto-detect)');
    console.log('  --output <file>            Write Form 8949 CSV to file');
    console.log('  --json                     Output report as JSON');
    console.log('');
    console.log('Examples:');
    console.log('  dtax calculate transactions.csv');
    console.log('  dtax calculate coinbase.csv --method HIFO --year 2025');
    console.log('  dtax calculate trades.csv --output form8949.csv');
    console.log('');
    console.log('https://dtax.dev');
}

function calculate(file: string, flags: Record<string, string>): void {
    const method = (flags.method?.toUpperCase() || 'FIFO') as CostBasisMethod;
    if (!['FIFO', 'LIFO', 'HIFO'].includes(method)) {
        console.error(`Error: Invalid method "${method}". Use FIFO, LIFO, or HIFO.`);
        process.exit(1);
    }

    const yearFilter = flags.year ? parseInt(flags.year) : undefined;
    if (yearFilter && (isNaN(yearFilter) || yearFilter < 2009)) {
        console.error(`Error: Invalid year "${flags.year}".`);
        process.exit(1);
    }

    // Read and parse CSV
    let csvContent: string;
    try {
        csvContent = readFileSync(file, 'utf-8');
    } catch {
        console.error(`Error: Cannot read file "${file}"`);
        process.exit(1);
    }

    const format = flags.format as CsvFormat | undefined;
    const parsed = parseCsv(csvContent, format ? { format } : undefined);

    if (parsed.errors.length > 0) {
        console.error(`${parsed.errors.length} parse errors:`);
        for (const err of parsed.errors.slice(0, 5)) {
            console.error(`   Row ${err.row}: ${err.message}`);
        }
        if (parsed.errors.length > 5) {
            console.error(`   ... and ${parsed.errors.length - 5} more`);
        }
    }

    if (parsed.transactions.length === 0) {
        console.error('Error: No valid transactions found in CSV.');
        process.exit(1);
    }

    console.log(`Parsed ${parsed.transactions.length} transactions (format: ${parsed.summary.format})`);

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

    console.log(`${lots.length} acquisition lots, ${events.length} dispositions${yearFilter ? ` (year ${yearFilter})` : ''}`);
    console.log(`Method: ${method}`);
    console.log('');

    // Calculate
    const calculator = new CostBasisCalculator(method);
    calculator.addLots(lots);

    let shortTermGains = 0, shortTermLosses = 0;
    let longTermGains = 0, longTermLosses = 0;
    const results = [];

    for (const event of events) {
        const result = calculator.calculate(event);
        results.push(result);

        if (result.holdingPeriod === 'SHORT_TERM') {
            if (result.gainLoss >= 0) shortTermGains += result.gainLoss;
            else shortTermLosses += Math.abs(result.gainLoss);
        } else {
            if (result.gainLoss >= 0) longTermGains += result.gainLoss;
            else longTermLosses += Math.abs(result.gainLoss);
        }
    }

    const netGainLoss = (shortTermGains - shortTermLosses) + (longTermGains - longTermLosses);

    // Output
    if (flags.json === 'true') {
        console.log(JSON.stringify({
            method,
            taxYear: yearFilter || 'all',
            shortTermGains,
            shortTermLosses,
            longTermGains,
            longTermLosses,
            netGainLoss,
            totalDispositions: events.length,
            results,
        }, null, 2));
    } else {
        const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

        console.log('='.repeat(39));
        console.log('        DTax Tax Calculation Report');
        console.log('='.repeat(39));
        console.log('');
        console.log(`  Short-Term Gains:   ${fmt(shortTermGains)}`);
        console.log(`  Short-Term Losses:  (${fmt(shortTermLosses)})`);
        console.log(`  Short-Term Net:     ${fmt(shortTermGains - shortTermLosses)}`);
        console.log('');
        console.log(`  Long-Term Gains:    ${fmt(longTermGains)}`);
        console.log(`  Long-Term Losses:   (${fmt(longTermLosses)})`);
        console.log(`  Long-Term Net:      ${fmt(longTermGains - longTermLosses)}`);
        console.log('');
        console.log('-'.repeat(39));
        console.log(`  NET GAIN/LOSS:      ${fmt(netGainLoss)}`);
        console.log(`  Total Dispositions: ${events.length}`);
        console.log('='.repeat(39));
    }

    // Generate Form 8949 CSV if output requested
    if (flags.output) {
        const lotDates: LotDateMap = new Map(lots.map(l => [l.id, l.acquiredAt]));
        const report = generateForm8949(results, {
            taxYear: yearFilter || new Date().getFullYear(),
            lotDates,
            reportingBasis: 'none',
        });
        const csv = form8949ToCsv(report);
        writeFileSync(flags.output, csv, 'utf-8');
        console.log(`\nForm 8949 CSV written to: ${flags.output}`);
    }
}

// Main
const args = process.argv.slice(2);
const { command, file, flags } = parseArgs(args);

if (!command || command === 'help' || flags.help === 'true') {
    printUsage();
    process.exit(0);
}

if (command === 'calculate') {
    if (!file) {
        console.error('Error: Please provide a CSV file path.');
        console.error('Usage: dtax calculate <csv-file> [--method FIFO]');
        process.exit(1);
    }
    calculate(file, flags);
} else {
    console.error(`Unknown command: "${command}"`);
    printUsage();
    process.exit(1);
}
