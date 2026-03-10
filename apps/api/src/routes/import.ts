/**
 * CSV Import Route
 * POST /transactions/import — Upload CSV file, parse, and bulk insert
 *
 * Supports: Coinbase, Binance International, Binance US, Kraken, Etherscan, Generic
 * Auto-detects format or accepts ?format= query parameter
 * Deduplication: generates content fingerprints stored in externalId
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "../lib/prisma";
import { DataSourceType, DataSourceStatus } from "@prisma/client";
import { parseCsv } from "@dtax/tax-engine";
import type { CsvFormat, ParsedTransaction } from "@dtax/tax-engine";

/** Generate a deterministic fingerprint for a parsed transaction */
function txFingerprint(tx: ParsedTransaction): string {
  const key = [
    tx.type,
    tx.timestamp,
    tx.sentAsset || "",
    tx.sentAmount?.toString() || "",
    tx.receivedAsset || "",
    tx.receivedAmount?.toString() || "",
    tx.feeAmount?.toString() || "",
  ].join("|");
  return "csv:" + createHash("sha256").update(key).digest("hex").slice(0, 16);
}

const formatSchema = z
  .enum([
    "generic",
    "coinbase",
    "binance",
    "binance_us",
    "kraken",
    "etherscan",
    "etherscan_erc20",
    "gemini",
    "crypto_com",
    "kucoin",
    "okx",
    "bybit",
    "gate",
    "bitget",
    "mexc",
    "htx",
    "solscan",
    "solscan_defi",
    "bitfinex",
    "poloniex",
  ])
  .optional();

export async function importRoutes(app: FastifyInstance) {
  // POST /transactions/import — CSV file upload
  app.post("/transactions/import", async (request, reply) => {
    // Get optional format and source from query
    const query = request.query as Record<string, string>;
    const formatParam = formatSchema.parse(query.format);
    const sourceName = query.source || undefined;
    const userAddress = query.userAddress || undefined;
    const nativeAsset = query.nativeAsset || undefined;

    let csvContent: string;

    // Try multipart file upload first
    const contentType = request.headers["content-type"] || "";

    if (contentType.includes("multipart/form-data")) {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          error: { code: "NO_FILE", message: "No CSV file uploaded" },
        });
      }

      // Read file content
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      csvContent = Buffer.concat(chunks).toString("utf-8");
    } else if (
      contentType.includes("text/csv") ||
      contentType.includes("text/plain")
    ) {
      // Accept raw text body
      csvContent = (await request.body) as string;
    } else {
      return reply.status(400).send({
        error: {
          code: "INVALID_CONTENT_TYPE",
          message: "Expected multipart/form-data, text/csv, or text/plain",
        },
      });
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return reply.status(400).send({
        error: { code: "EMPTY_FILE", message: "CSV file is empty" },
      });
    }

    // Reject excessively large CSV bodies (10MB limit, matching multipart)
    const MAX_CSV_BYTES = 10 * 1024 * 1024;
    if (Buffer.byteLength(csvContent, "utf-8") > MAX_CSV_BYTES) {
      return reply.status(413).send({
        error: {
          code: "FILE_TOO_LARGE",
          message: "CSV file exceeds 10MB limit",
        },
      });
    }

    // Parse CSV
    const parseResult = parseCsv(csvContent, {
      format: formatParam as CsvFormat | undefined,
      userAddress,
      nativeAsset,
    });

    if (parseResult.transactions.length === 0) {
      return reply.status(400).send({
        error: {
          code: "NO_TRANSACTIONS",
          message: "No valid transactions found in CSV",
        },
        data: {
          errors: parseResult.errors.slice(0, 10), // Limit error count
          summary: parseResult.summary,
        },
      });
    }

    // Generate fingerprints for deduplication
    const fingerprints = parseResult.transactions.map((tx) =>
      txFingerprint(tx),
    );

    // Check which fingerprints already exist in DB
    const existing = await prisma.transaction.findMany({
      where: {
        userId: request.userId,
        externalId: { in: fingerprints },
      },
      select: { externalId: true },
    });
    const existingSet = new Set(existing.map((e) => e.externalId));

    // Filter out duplicates
    const newTxs: { tx: ParsedTransaction; fp: string }[] = [];
    let skipped = 0;
    for (let i = 0; i < parseResult.transactions.length; i++) {
      if (existingSet.has(fingerprints[i])) {
        skipped++;
      } else {
        newTxs.push({ tx: parseResult.transactions[i], fp: fingerprints[i] });
      }
    }

    if (newTxs.length === 0) {
      return reply.status(200).send({
        data: {
          imported: 0,
          skipped,
          errors: parseResult.errors.slice(0, 10),
          summary: parseResult.summary,
        },
        meta: {
          requestId: request.id,
          timestamp: new Date().toISOString(),
          format: parseResult.summary.format,
          message: "All transactions already imported",
        },
      });
    }

    // Create a DataSource to track the import origin
    const dsName =
      sourceName || parseResult.summary.format.toUpperCase() + " Import";
    const dataSource = await prisma.dataSource.create({
      data: {
        userId: request.userId,
        type: DataSourceType.CSV_IMPORT,
        name: dsName,
        status: DataSourceStatus.ACTIVE,
      },
    });

    // Bulk insert into database with sourceId and externalId
    const dbRecords = newTxs.map(({ tx, fp }) => ({
      userId: request.userId,
      sourceId: dataSource.id,
      externalId: fp,
      type: tx.type,
      timestamp: new Date(tx.timestamp),
      receivedAsset: tx.receivedAsset || null,
      receivedAmount: tx.receivedAmount || null,
      receivedValueUsd: tx.receivedValueUsd || null,
      sentAsset: tx.sentAsset || null,
      sentAmount: tx.sentAmount || null,
      sentValueUsd: tx.sentValueUsd || null,
      feeAsset: tx.feeAsset || null,
      feeAmount: tx.feeAmount || null,
      feeValueUsd: tx.feeValueUsd || null,
      notes: tx.notes || null,
      tags: [],
    }));

    const created = await prisma.transaction.createMany({
      data: dbRecords,
    });

    return reply.status(201).send({
      data: {
        imported: created.count,
        skipped,
        errors: parseResult.errors.slice(0, 10),
        summary: parseResult.summary,
        sourceId: dataSource.id,
        sourceName: dsName,
      },
      meta: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
        format: parseResult.summary.format,
      },
    });
  });
}
