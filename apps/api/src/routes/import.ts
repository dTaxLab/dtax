/**
 * CSV Import Route
 * POST /transactions/import — Upload CSV file, parse, and bulk insert
 *
 * Supports: Coinbase, Binance International, Binance US, Kraken, Etherscan, Generic
 * Auto-detects format or accepts ?format= query parameter
 * Deduplication: generates content fingerprints stored in externalId
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "../lib/prisma";
import { DataSourceType, DataSourceStatus } from "@prisma/client";
import { parseCsv } from "@dtax/tax-engine";
import type { CsvFormat, ParsedTransaction } from "@dtax/tax-engine";
import { checkTransactionQuota } from "../plugins/plan-guard";
import { classifyBatch } from "../lib/ai-classifier";
import { errorResponseSchema } from "../schemas/common";
import { csvFormatEnum } from "../schemas/enums";

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

const importResultSchema = z
  .object({
    imported: z.number().int(),
    skipped: z.number().int(),
    aiClassified: z.number().int(),
    errors: z.array(z.any()).optional(),
    summary: z.any(),
    sourceId: z.string().uuid(),
    sourceName: z.string(),
  })
  .openapi({ ref: "ImportResult" });

export async function importRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // POST /transactions/import — CSV file upload
  r.post(
    "/transactions/import",
    {
      schema: {
        tags: ["transactions"],
        operationId: "importTransactions",
        description:
          "Upload CSV file, parse, and bulk insert transactions. Supports multiple exchange formats with auto-detection.",
        querystring: z.object({
          format: csvFormatEnum.optional(),
          source: z
            .string()
            .optional()
            .openapi({ description: "Custom data source name" }),
          userAddress: z
            .string()
            .optional()
            .openapi({
              description: "User wallet address (for blockchain explorers)",
            }),
          nativeAsset: z
            .string()
            .optional()
            .openapi({
              description: "Native asset symbol (for blockchain explorers)",
            }),
        }),
        response: {
          201: z.object({
            data: importResultSchema,
            meta: z.object({
              requestId: z.string(),
              timestamp: z.string().datetime(),
              format: z.string(),
            }),
          }),
          200: z.object({
            data: z.object({
              imported: z.number().int(),
              skipped: z.number().int(),
              errors: z.array(z.any()).optional(),
              summary: z.any(),
            }),
            meta: z.object({
              requestId: z.string(),
              timestamp: z.string().datetime(),
              format: z.string(),
              message: z.string().optional(),
            }),
          }),
          400: z
            .any()
            .openapi({
              description: "Bad request (no transactions, invalid content)",
            }),
          403: errorResponseSchema,
          413: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const query = request.query;
      const formatParam = query.format;
      const sourceName = query.source || undefined;
      const userAddress = query.userAddress || undefined;
      const nativeAsset = query.nativeAsset || undefined;

      let csvContent: string;

      const contentType = request.headers["content-type"] || "";

      if (contentType.includes("multipart/form-data")) {
        const file = await request.file();
        if (!file) {
          return reply.status(400).send({
            error: { code: "NO_FILE", message: "No CSV file uploaded" },
          });
        }

        const chunks: Buffer[] = [];
        for await (const chunk of file.file) {
          chunks.push(chunk);
        }
        csvContent = Buffer.concat(chunks).toString("utf-8");
      } else if (
        contentType.includes("text/csv") ||
        contentType.includes("text/plain")
      ) {
        csvContent = (await request.body) as unknown as string;
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

      const MAX_CSV_BYTES = 10 * 1024 * 1024;
      if (Buffer.byteLength(csvContent, "utf-8") > MAX_CSV_BYTES) {
        return reply.status(413).send({
          error: {
            code: "FILE_TOO_LARGE",
            message: "CSV file exceeds 10MB limit",
          },
        });
      }

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
            errors: parseResult.errors.slice(0, 10),
            summary: parseResult.summary,
          },
        });
      }

      const fingerprints = parseResult.transactions.map((tx) =>
        txFingerprint(tx),
      );

      const existing = await prisma.transaction.findMany({
        where: {
          userId: request.userId,
          externalId: { in: fingerprints },
        },
        select: { externalId: true },
      });
      const existingSet = new Set(existing.map((e) => e.externalId));

      const newTxs: { tx: ParsedTransaction; fp: string }[] = [];
      let skipped = 0;
      for (let i = 0; i < parseResult.transactions.length; i++) {
        if (existingSet.has(fingerprints[i])) {
          skipped++;
        } else {
          newTxs.push({ tx: parseResult.transactions[i], fp: fingerprints[i] });
        }
      }

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
