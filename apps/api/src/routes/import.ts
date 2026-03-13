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
import { checkTransactionQuota } from "../plugins/plan-guard";
import { classifyBatch } from "../lib/ai-classifier";
import { logAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notification.js";
import { apiCache } from "../lib/cache.js";

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
    "koinly",
    "cointracker",
    "cryptact",
  ])
  .optional();

export async function importRoutes(app: FastifyInstance) {
  // POST /transactions/import — CSV file upload
  app.post(
    "/transactions/import",
    {
      schema: {
        tags: ["transactions"],
        summary: "Import transactions from CSV file",
        querystring: {
          type: "object" as const,
          additionalProperties: true,
          properties: {
            format: { type: "string" as const },
            source: { type: "string" as const },
            userAddress: { type: "string" as const },
            nativeAsset: { type: "string" as const },
          },
        },
        response: {
          201: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: { type: "object" as const, additionalProperties: true },
              meta: { type: "object" as const, additionalProperties: true },
            },
          },
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
          400: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
          403: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
          413: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
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

      // Enforce FREE plan transaction quota before insert
      const quota = await checkTransactionQuota(request.userId);
      if (!quota.allowed) {
        return reply.status(403).send({
          error: {
            code: "QUOTA_EXCEEDED",
            message: `Free plan limit of ${quota.limit} transactions reached (current: ${quota.current}). Upgrade to Pro for unlimited.`,
            limit: quota.limit,
            current: quota.current,
          },
        });
      }
      if (
        quota.plan === "FREE" &&
        quota.current + newTxs.length > quota.limit
      ) {
        return reply.status(403).send({
          error: {
            code: "QUOTA_EXCEEDED",
            message: `Import would exceed free plan limit of ${quota.limit} transactions (current: ${quota.current}, importing: ${newTxs.length}). Upgrade to Pro for unlimited.`,
            limit: quota.limit,
            current: quota.current,
            importing: newTxs.length,
          },
        });
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

      // AI-classify UNKNOWN transactions (async, best-effort)
      let aiClassified = 0;
      try {
        const unknownTxs = await prisma.transaction.findMany({
          where: {
            userId: request.userId,
            sourceId: dataSource.id,
            type: "UNKNOWN",
          },
        });

        if (unknownTxs.length > 0) {
          const inputs = unknownTxs.map((tx) => ({
            type: tx.type,
            sentAsset: tx.sentAsset || undefined,
            sentAmount: tx.sentAmount ? Number(tx.sentAmount) : undefined,
            receivedAsset: tx.receivedAsset || undefined,
            receivedAmount: tx.receivedAmount
              ? Number(tx.receivedAmount)
              : undefined,
            feeAsset: tx.feeAsset || undefined,
            feeAmount: tx.feeAmount ? Number(tx.feeAmount) : undefined,
            notes: tx.notes || undefined,
            source: parseResult.summary.format,
          }));

          const results = await classifyBatch(inputs);

          for (let i = 0; i < unknownTxs.length; i++) {
            const r = results[i];
            if (r && r.classifiedType !== "UNKNOWN") {
              await prisma.transaction.update({
                where: { id: unknownTxs[i].id },
                data: {
                  originalType: unknownTxs[i].type,
                  type: r.classifiedType,
                  aiClassified: true,
                  aiConfidence: r.confidence,
                },
              });
              aiClassified++;
            }
          }
        }
      } catch (err) {
        request.log.error(err, "AI classification failed (non-blocking)");
      }

      logAudit({
        userId: request.userId,
        action: "IMPORT",
        entityType: "dataSource",
        entityId: dataSource.id,
        details: { format: parseResult.summary.format, count: created.count },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      }).catch(() => {});

      createNotification({
        userId: request.userId,
        type: "IMPORT_COMPLETE",
        title: "Import Complete",
        message: `Successfully imported ${created.count} transactions`,
        data: { transactionCount: created.count },
      }).catch(() => {});

      apiCache.invalidateByPrefix(`user:${request.userId}:`);

      return reply.status(201).send({
        data: {
          imported: created.count,
          skipped,
          aiClassified,
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
    },
  );
}
