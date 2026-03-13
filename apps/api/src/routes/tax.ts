/**
 * Tax calculation routes.
 * POST /tax/calculate            — Run tax calculation for a given year + method
 * GET  /tax/form8949             — Generate Form 8949 report (JSON, CSV, PDF, TXF)
 * GET  /tax/schedule-d           — Generate Schedule D summary
 * GET  /tax/summary              — Get saved tax summary for a year
 * POST /tax/reconcile            — Reconcile 1099-DA against DTax calculations
 * GET  /tax/reports              — List report history
 * GET  /tax/reports/:id/download — Download a report file
 * DELETE /tax/reports/:id        — Delete a report
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { resolveUserId } from "../plugins/resolve-user.js";
import { logAudit } from "../lib/audit.js";
import {
  saveReport,
  getReport,
  deleteReportFile,
} from "../lib/report-storage.js";
import {
  fetchTaxData,
  calculateIncome,
  fetchInternalTransferIds,
  ACQUISITION_TYPES,
} from "../lib/tax-data";
import {
  CostBasisCalculator,
  generateForm8949,
  form8949ToCsv,
  form8949ToTxf,
  generateForm8949Pdf,
  generateScheduleD,
  detectWashSales,
  parse1099DA,
  reconcile,
  simulateSale,
  compareAllMethods,
} from "@dtax/tax-engine";
import type {
  LotDateMap,
  DtaxDisposition,
  AcquisitionRecord,
} from "@dtax/tax-engine";

const calculateSchema = z.object({
  taxYear: z.number().int().min(2009).max(2030),
  method: z.enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"]).default("FIFO"),
  strictSilo: z.boolean().default(false),
});

// ─── OpenAPI/Swagger Schemas (documentation only) ────────────
// These schemas document the API for Swagger UI. Actual validation
// is performed by Zod in each handler. Response schemas use
// additionalProperties to avoid Fastify stripping extra fields.

const errorSchema = {
  type: "object" as const,
  additionalProperties: true,
  properties: {
    error: {
      type: "object" as const,
      additionalProperties: true,
      properties: {
        message: { type: "string" as const },
        code: { type: "string" as const },
      },
    },
  },
};

/** Build wash sale adjustments map from lots + results */
function buildWashSaleAdjustments(
  lots: { id: string; asset: string; amount: number; acquiredAt: Date }[],
  results: ReturnType<CostBasisCalculator["calculate"]>[],
) {
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
  return {
    adjustments: new Map(washResult.adjustments.map((a) => [a.lossEventId, a])),
    summary: {
      totalDisallowed: washResult.totalDisallowed,
      adjustmentCount: washResult.adjustments.length,
    },
  };
}

export async function taxRoutes(app: FastifyInstance) {
  // POST /tax/calculate — Run tax calculation
  app.post(
    "/tax/calculate",
    {
      schema: {
        tags: ["tax"],
        summary: "Run tax calculation for a given year and method",
        body: {
          type: "object" as const,
          additionalProperties: true,

          properties: {
            taxYear: { type: "integer" as const },
            method: {
              type: "string" as const,
              default: "FIFO",
            },
            strictSilo: { type: "boolean" as const, default: false },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  report: {
                    type: "object" as const,
                    additionalProperties: true,
                    properties: {
                      id: { type: "string" as const },
                      taxYear: { type: "integer" as const },
                      method: { type: "string" as const },
                      shortTermGains: { type: "number" as const },
                      shortTermLosses: { type: "number" as const },
                      longTermGains: { type: "number" as const },
                      longTermLosses: { type: "number" as const },
                      netGainLoss: { type: "number" as const },
                      totalTransactions: { type: "integer" as const },
                      income: {
                        type: "object" as const,
                        additionalProperties: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = calculateSchema.parse(request.body);
      const { lots, events } = await fetchTaxData({
        userId: request.userId,
        taxYear: body.taxYear,
      });
      const income = await calculateIncome({
        userId: request.userId,
        taxYear: body.taxYear,
      });

      const calculator = new CostBasisCalculator(body.method);
      calculator.addLots(lots);

      let shortTermGains = 0,
        shortTermLosses = 0,
        longTermGains = 0,
        longTermLosses = 0;
      const results = [];

      for (const event of events) {
        const result = calculator.calculate(event, body.strictSilo);
        results.push(result);
        if (result.holdingPeriod === "SHORT_TERM") {
          if (result.gainLoss >= 0) shortTermGains += result.gainLoss;
          else shortTermLosses += Math.abs(result.gainLoss);
        } else {
          if (result.gainLoss >= 0) longTermGains += result.gainLoss;
          else longTermLosses += Math.abs(result.gainLoss);
        }
      }

      const report = await prisma.taxReport.upsert({
        where: {
          userId_taxYear_method: {
            userId: request.userId,
            taxYear: body.taxYear,
            method: body.method,
          },
        },
        create: {
          userId: request.userId,
          taxYear: body.taxYear,
          method: body.method,
          shortTermGains,
          shortTermLosses,
          longTermGains,
          longTermLosses,
          totalIncome: income.total,
          totalTransactions: events.length,
          reportData: JSON.parse(JSON.stringify({ results, income })),
          status: "COMPLETE",
        },
        update: {
          shortTermGains,
          shortTermLosses,
          longTermGains,
          longTermLosses,
          totalIncome: income.total,
          totalTransactions: events.length,
          reportData: JSON.parse(JSON.stringify({ results, income })),
          status: "COMPLETE",
        },
      });

      logAudit({
        userId: request.userId,
        action: "CALCULATE",
        entityType: "taxReport",
        entityId: report.id,
        details: { year: body.taxYear, method: body.method },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      }).catch(() => {});

      return reply.status(200).send({
        data: {
          report: {
            id: report.id,
            taxYear: report.taxYear,
            method: report.method,
            shortTermGains,
            shortTermLosses,
            longTermGains,
            longTermLosses,
            netGainLoss:
              shortTermGains -
              shortTermLosses +
              (longTermGains - longTermLosses),
            totalTransactions: events.length,
            income,
          },
        },
      });
    },
  );

  // GET /tax/form8949 — Generate Form 8949 report (JSON or CSV)
  app.get(
    "/tax/form8949",
    {
      schema: {
        tags: ["tax"],
        summary: "Generate Form 8949 report (JSON, CSV, PDF, or TXF)",
        querystring: {
          type: "object" as const,
          additionalProperties: true,

          properties: {
            year: { type: "integer" as const },
            method: {
              type: "string" as const,
              default: "FIFO",
            },
            format: {
              type: "string" as const,
              enum: ["json", "csv", "pdf", "txf"],
              default: "json",
            },
            strictSilo: { type: "boolean" as const, default: false },
            includeWashSales: { type: "boolean" as const, default: false },
          },
        },
        response: {
          200: {
            description:
              "JSON response (csv/pdf/txf return file downloads instead)",
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  entries: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,
                    },
                  },
                  taxYear: { type: "integer" as const },
                  washSaleSummary: {
                    type: "object" as const,
                    nullable: true,
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const query = z
        .object({
          year: z.coerce.number().int().min(2009).max(2030),
          method: z
            .enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"])
            .default("FIFO"),
          format: z.enum(["json", "csv", "pdf", "txf"]).default("json"),
          strictSilo: z.coerce.boolean().default(false),
          includeWashSales: z.coerce.boolean().default(false),
        })
        .parse(request.query);

      const { lots, events } = await fetchTaxData({
        userId: request.userId,
        taxYear: query.year,
      });
      const lotDates: LotDateMap = new Map(
        lots.map((l) => [l.id, l.acquiredAt]),
      );

      const calculator = new CostBasisCalculator(query.method);
      calculator.addLots(lots);
      const results = events.map((e) =>
        calculator.calculate(e, query.strictSilo),
      );

      let washSaleAdjustments:
        | Map<string, import("@dtax/tax-engine").WashSaleAdjustment>
        | undefined;
      let washSaleSummary;
      if (query.includeWashSales) {
        const ws = buildWashSaleAdjustments(lots, results);
        washSaleAdjustments = ws.adjustments;
        washSaleSummary = ws.summary;
      }

      const report = generateForm8949(results, {
        taxYear: query.year,
        lotDates,
        reportingBasis: "none",
        washSaleAdjustments,
      });

      logAudit({
        userId: request.userId,
        action: "GENERATE_REPORT",
        entityType: "taxReport",
        details: {
          year: query.year,
          method: query.method,
          format: query.format,
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      }).catch(() => {});

      if (query.format === "csv") {
        const csv = form8949ToCsv(report);
        const csvBuffer = Buffer.from(csv);
        const { path: filePath, size: fileSize } = await saveReport(
          request.userId,
          `form8949-${query.year}-${query.method}`,
          csvBuffer,
          "csv",
        );
        await prisma.taxReport.upsert({
          where: {
            userId_taxYear_method: {
              userId: request.userId,
              taxYear: query.year,
              method: query.method,
            },
          },
          create: {
            userId: request.userId,
            taxYear: query.year,
            method: query.method,
            status: "COMPLETE",
            fileType: "csv",
            fileName: `Form8949-${query.year}-${query.method}.csv`,
            fileSize,
            filePath,
            generatedAt: new Date(),
          },
          update: {
            fileType: "csv",
            fileName: `Form8949-${query.year}-${query.method}.csv`,
            fileSize,
            filePath,
            generatedAt: new Date(),
          },
        });
        return reply
          .header("Content-Type", "text/csv")
          .header(
            "Content-Disposition",
            `attachment; filename="form8949-${query.year}-${query.method}.csv"`,
          )
          .send(csv);
      }

      if (query.format === "txf") {
        const txf = form8949ToTxf(report);
        const txfBuffer = Buffer.from(txf);
        const { path: filePath, size: fileSize } = await saveReport(
          request.userId,
          `form8949-${query.year}-${query.method}`,
          txfBuffer,
          "txf",
        );
        await prisma.taxReport.upsert({
          where: {
            userId_taxYear_method: {
              userId: request.userId,
              taxYear: query.year,
              method: query.method,
            },
          },
          create: {
            userId: request.userId,
            taxYear: query.year,
            method: query.method,
            status: "COMPLETE",
            fileType: "txf",
            fileName: `Form8949-${query.year}-${query.method}.txf`,
            fileSize,
            filePath,
            generatedAt: new Date(),
          },
          update: {
            fileType: "txf",
            fileName: `Form8949-${query.year}-${query.method}.txf`,
            fileSize,
            filePath,
            generatedAt: new Date(),
          },
        });
        reply.header("Content-Type", "text/plain");
        reply.header(
          "Content-Disposition",
          `attachment; filename="form8949-${query.year}.txf"`,
        );
        return reply.send(txf);
      }

      if (query.format === "pdf") {
        const scheduleD = generateScheduleD(report);
        const pdfBuffer = await generateForm8949Pdf(report, { scheduleD });
        const { path: filePath, size: fileSize } = await saveReport(
          request.userId,
          `form8949-${query.year}-${query.method}`,
          pdfBuffer,
          "pdf",
        );
        await prisma.taxReport.upsert({
          where: {
            userId_taxYear_method: {
              userId: request.userId,
              taxYear: query.year,
              method: query.method,
            },
          },
          create: {
            userId: request.userId,
            taxYear: query.year,
            method: query.method,
            status: "COMPLETE",
            fileType: "pdf",
            fileName: `Form8949-${query.year}-${query.method}.pdf`,
            fileSize,
            filePath,
            generatedAt: new Date(),
          },
          update: {
            fileType: "pdf",
            fileName: `Form8949-${query.year}-${query.method}.pdf`,
            fileSize,
            filePath,
            generatedAt: new Date(),
          },
        });
        return reply
          .header("Content-Type", "application/pdf")
          .header(
            "Content-Disposition",
            `attachment; filename="form8949-${query.year}-${query.method}.pdf"`,
          )
          .send(pdfBuffer);
      }

      return { data: { ...report, washSaleSummary } };
    },
  );

  // GET /tax/schedule-d — Generate Schedule D summary from Form 8949
  app.get(
    "/tax/schedule-d",
    {
      schema: {
        tags: ["tax"],
        summary: "Generate Schedule D summary from Form 8949",
        querystring: {
          type: "object" as const,
          additionalProperties: true,

          properties: {
            year: { type: "integer" as const },
            method: {
              type: "string" as const,
              default: "FIFO",
            },
            strictSilo: { type: "boolean" as const, default: false },
            includeWashSales: { type: "boolean" as const, default: false },
            lossLimit: { type: "number" as const, default: 3000 },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  partI: {
                    type: "object" as const,
                    additionalProperties: true,
                  },
                  partII: {
                    type: "object" as const,
                    additionalProperties: true,
                  },
                  netShortTerm: { type: "number" as const },
                  netLongTerm: { type: "number" as const },
                  totalNetGainLoss: { type: "number" as const },
                  allowableLoss: { type: "number" as const },
                  carryoverLoss: { type: "number" as const },
                },
              },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const query = z
        .object({
          year: z.coerce.number().int().min(2009).max(2030),
          method: z
            .enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"])
            .default("FIFO"),
          strictSilo: z.coerce.boolean().default(false),
          includeWashSales: z.coerce.boolean().default(false),
          lossLimit: z.coerce.number().default(3000),
        })
        .parse(request.query);

      const { lots, events } = await fetchTaxData({
        userId: request.userId,
        taxYear: query.year,
      });
      const lotDates: LotDateMap = new Map(
        lots.map((l) => [l.id, l.acquiredAt]),
      );

      const calculator = new CostBasisCalculator(query.method);
      calculator.addLots(lots);
      const results = events.map((e) =>
        calculator.calculate(e, query.strictSilo),
      );

      let washSaleAdjustments:
        | Map<string, import("@dtax/tax-engine").WashSaleAdjustment>
        | undefined;
      if (query.includeWashSales) {
        washSaleAdjustments = buildWashSaleAdjustments(
          lots,
          results,
        ).adjustments;
      }

      const form8949 = generateForm8949(results, {
        taxYear: query.year,
        lotDates,
        reportingBasis: "none",
        washSaleAdjustments,
      });
      const scheduleD = generateScheduleD(form8949, {
        lossLimit: query.lossLimit,
      });

      return { data: scheduleD };
    },
  );

  // GET /tax/summary — Get tax summary for a year
  app.get(
    "/tax/summary",
    {
      schema: {
        tags: ["tax"],
        summary: "Get saved tax summary for a year",
        querystring: {
          type: "object" as const,
          additionalProperties: true,

          properties: {
            year: { type: "integer" as const },
            method: {
              type: "string" as const,
              default: "FIFO",
            },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  taxYear: { type: "integer" as const },
                  method: { type: "string" as const },
                  shortTermGains: { type: "number" as const },
                  shortTermLosses: { type: "number" as const },
                  longTermGains: { type: "number" as const },
                  longTermLosses: { type: "number" as const },
                  netGainLoss: { type: "number" as const },
                  totalIncome: { type: "number" as const },
                  totalTransactions: { type: "integer" as const },
                  status: { type: "string" as const },
                  updatedAt: { type: "string" as const },
                },
              },
            },
          },
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const query = z
        .object({
          year: z.coerce.number().int().min(2009).max(2030),
          method: z
            .enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"])
            .default("FIFO"),
        })
        .parse(request.query);

      const report = await prisma.taxReport.findUnique({
        where: {
          userId_taxYear_method: {
            userId,
            taxYear: query.year,
            method: query.method,
          },
        },
      });

      if (!report) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: `No tax report found for ${query.year} using ${query.method}. Run POST /tax/calculate first.`,
          },
        });
      }

      return {
        data: {
          taxYear: report.taxYear,
          method: report.method,
          shortTermGains: Number(report.shortTermGains),
          shortTermLosses: Number(report.shortTermLosses),
          longTermGains: Number(report.longTermGains),
          longTermLosses: Number(report.longTermLosses),
          netGainLoss:
            Number(report.shortTermGains) -
            Number(report.shortTermLosses) +
            Number(report.longTermGains) -
            Number(report.longTermLosses),
          totalIncome: Number(report.totalIncome) || 0,
          totalTransactions: report.totalTransactions,
          status: report.status,
          updatedAt: report.updatedAt.toISOString(),
        },
      };
    },
  );

  // POST /tax/reconcile — Upload 1099-DA CSV and reconcile
  app.post(
    "/tax/reconcile",
    {
      schema: {
        tags: ["tax"],
        summary: "Upload 1099-DA CSV and reconcile against DTax calculations",
        body: {
          type: "object" as const,
          additionalProperties: true,

          properties: {
            csvContent: { type: "string" as const },
            brokerName: { type: "string" as const, default: "Unknown" },
            taxYear: { type: "integer" as const },
            method: {
              type: "string" as const,
              default: "FIFO",
            },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  matched: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,
                    },
                  },
                  unmatched1099: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,
                    },
                  },
                  unmatchedDtax: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,
                    },
                  },
                  summary: {
                    type: "object" as const,
                    additionalProperties: true,
                  },
                  parseErrors: {
                    type: "array" as const,
                    items: { type: "string" as const },
                  },
                },
              },
            },
          },
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = z
        .object({
          csvContent: z.string().min(1),
          brokerName: z.string().default("Unknown"),
          taxYear: z.number().int().min(2009).max(2030),
          method: z
            .enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"])
            .default("FIFO"),
        })
        .parse(request.body);

      const parsed = parse1099DA(
        body.csvContent,
        body.brokerName,
        body.taxYear,
      );
      if (parsed.entries.length === 0) {
        return reply.status(400).send({
          error: {
            message: "No valid entries found in 1099-DA CSV",
            details: parsed.errors,
          },
        });
      }

      const { lots, events, yearStart, yearEnd } = await fetchTaxData({
        userId: request.userId,
        taxYear: body.taxYear,
      });
      const internalTransferIds = await fetchInternalTransferIds(
        request.userId,
        yearStart,
        yearEnd,
      );

      const calculator = new CostBasisCalculator(body.method);
      calculator.addLots(lots);
      const results = events.map((e) => calculator.calculate(e));

      const dtaxDispositions: DtaxDisposition[] = results.map((r) => ({
        eventId: r.event.id,
        asset: r.event.asset,
        dateSold: r.event.date,
        proceeds: r.event.proceedsUsd,
        costBasis: r.matchedLots.reduce((s, l) => s + l.costBasisUsd, 0),
        gainLoss: r.gainLoss,
      }));

      const report = reconcile(parsed.entries, dtaxDispositions, {
        taxYear: body.taxYear,
        brokerName: body.brokerName,
        internalTransferIds,
      });

      return { data: { ...report, parseErrors: parsed.errors } };
    },
  );

  // GET /tax/available-lots — List available lots for Specific ID selection
  app.get(
    "/tax/available-lots",
    {
      schema: {
        tags: ["tax"],
        summary: "List available lots for Specific ID selection",
        querystring: {
          type: "object" as const,
          additionalProperties: true,

          properties: {
            year: { type: "integer" as const },
            asset: { type: "string" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  lots: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,
                      properties: {
                        id: { type: "string" as const },
                        asset: { type: "string" as const },
                        amount: { type: "number" as const },
                        costBasisUsd: { type: "number" as const },
                        acquiredAt: { type: "string" as const },
                        sourceId: { type: "string" as const },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const query = z
        .object({
          year: z.coerce.number().int().min(2009).max(2030),
          asset: z.string().optional(),
        })
        .parse(request.query);

      const yearEnd = new Date(`${query.year + 1}-01-01T00:00:00Z`);

      const acquisitions = await prisma.transaction.findMany({
        where: {
          userId: request.userId,
          type: { in: [...ACQUISITION_TYPES] },
          timestamp: { lt: yearEnd },
        },
        orderBy: { timestamp: "asc" },
      });

      let lots = acquisitions.map((tx) => ({
        id: tx.id,
        asset: tx.receivedAsset || "",
        amount: Number(tx.receivedAmount || 0),
        costBasisUsd: Number(tx.receivedValueUsd || 0),
        acquiredAt: tx.timestamp.toISOString(),
        sourceId: tx.sourceId || "unknown",
      }));

      if (query.asset) {
        lots = lots.filter((l) => l.asset === query.asset!.toUpperCase());
      }

      return { data: { lots } };
    },
  );

  // POST /tax/calculate-specific — Calculate with user-selected lots (Specific ID)
  app.post(
    "/tax/calculate-specific",
    {
      schema: {
        tags: ["tax"],
        summary: "Calculate tax with user-selected lots (Specific ID method)",
        body: {
          type: "object" as const,
          additionalProperties: true,

          properties: {
            taxYear: { type: "integer" as const },
            selections: {
              type: "array" as const,

              items: {
                type: "object" as const,
                additionalProperties: true,

                properties: {
                  eventId: { type: "string" as const },
                  lots: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,

                      properties: {
                        lotId: { type: "string" as const },
                        amount: {
                          type: "number" as const,
                        },
                      },
                    },
                  },
                },
              },
            },
            strictSilo: { type: "boolean" as const, default: false },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  results: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,
                    },
                  },
                  taxYear: { type: "integer" as const },
                },
              },
            },
          },
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = z
        .object({
          taxYear: z.number().int().min(2009).max(2030),
          selections: z
            .array(
              z.object({
                eventId: z.string(),
                lots: z.array(
                  z.object({
                    lotId: z.string(),
                    amount: z.number().positive(),
                  }),
                ),
              }),
            )
            .min(1),
          strictSilo: z.boolean().default(false),
        })
        .parse(request.body);

      const { lots, events } = await fetchTaxData({
        userId: request.userId,
        taxYear: body.taxYear,
      });

      const calculator = new CostBasisCalculator("SPECIFIC_ID");
      calculator.addLots(lots);

      const selectionMap = new Map(
        body.selections.map((s) => [s.eventId, s.lots]),
      );

      const results = [];
      for (const event of events) {
        const eventSelections = selectionMap.get(event.id);
        if (!eventSelections) continue;
        try {
          const result = calculator.calculateSpecificId(event, eventSelections);
          results.push(result);
        } catch (e) {
          return reply.status(400).send({
            error: {
              message: e instanceof Error ? e.message : "Invalid lot selection",
              eventId: event.id,
            },
          });
        }
      }

      return {
        data: { results, method: "SPECIFIC_ID", taxYear: body.taxYear },
      };
    },
  );

  // POST /tax/simulate — Simulate a hypothetical sale
  app.post(
    "/tax/simulate",
    {
      schema: {
        tags: ["tax"],
        summary: "Simulate a hypothetical sale with tax impact preview",
        body: {
          type: "object" as const,
          additionalProperties: true,

          properties: {
            asset: { type: "string" as const },
            amount: { type: "number" as const },
            pricePerUnit: { type: "number" as const },
            method: {
              type: "string" as const,
              enum: ["FIFO", "LIFO", "HIFO"],
              default: "FIFO",
            },
            strictSilo: { type: "boolean" as const, default: false },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  proceeds: { type: "number" as const },
                  costBasis: { type: "number" as const },
                  gainLoss: { type: "number" as const },
                  shortTermGainLoss: { type: "number" as const },
                  longTermGainLoss: { type: "number" as const },
                  lotsConsumed: { type: "integer" as const },
                  washSaleRisk: { type: "boolean" as const },
                },
              },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const body = z
        .object({
          asset: z.string().min(1),
          amount: z.number().positive(),
          pricePerUnit: z.number().nonnegative(),
          method: z.enum(["FIFO", "LIFO", "HIFO"]).optional().default("FIFO"),
          strictSilo: z.boolean().optional().default(false),
        })
        .parse(request.body);

      const acquisitions = await prisma.transaction.findMany({
        where: { userId: request.userId, type: { in: [...ACQUISITION_TYPES] } },
        orderBy: { timestamp: "asc" },
      });

      const lots = acquisitions.map((tx) => ({
        id: tx.id,
        asset: tx.receivedAsset || "",
        amount: Number(tx.receivedAmount || 0),
        costBasisUsd: Number(tx.receivedValueUsd || 0),
        acquiredAt: tx.timestamp,
        sourceId: tx.sourceId || "unknown",
      }));

      const acqRecords: AcquisitionRecord[] = acquisitions.map((tx) => ({
        lotId: tx.id,
        asset: tx.receivedAsset || "",
        amount: Number(tx.receivedAmount || 0),
        acquiredAt: tx.timestamp,
      }));

      const result = simulateSale(
        lots,
        {
          asset: body.asset,
          amount: body.amount,
          pricePerUnit: body.pricePerUnit,
          method: body.method,
          strictSilo: body.strictSilo,
        },
        acqRecords,
      );

      return { data: result };
    },
  );

  // ─── Compare All Methods ───────────────────────────

  const compareSchema = z.object({
    asset: z.string().min(1),
    amount: z.number().positive(),
    pricePerUnit: z.number().nonnegative(),
  });

  app.post(
    "/tax/compare-methods",
    {
      schema: {
        tags: ["tax"],
        summary: "Compare FIFO/LIFO/HIFO methods for a hypothetical sale",
        body: {
          type: "object" as const,
          additionalProperties: true,

          properties: {
            asset: { type: "string" as const },
            amount: { type: "number" as const },
            pricePerUnit: { type: "number" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  methods: {
                    type: "array" as const,
                    items: {
                      type: "object" as const,
                      additionalProperties: true,
                    },
                  },
                  recommendation: { type: "string" as const },
                  savings: { type: "number" as const },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const body = compareSchema.parse(request.body);

      const acquisitions = await prisma.transaction.findMany({
        where: { userId: request.userId, type: { in: [...ACQUISITION_TYPES] } },
        orderBy: { timestamp: "asc" },
      });

      const lots = acquisitions.map((tx) => ({
        id: tx.id,
        asset: tx.receivedAsset || "",
        amount: Number(tx.receivedAmount || 0),
        costBasisUsd: Number(tx.receivedValueUsd || 0),
        acquiredAt: tx.timestamp,
        sourceId: tx.sourceId || "unknown",
      }));

      const acqRecords: AcquisitionRecord[] = acquisitions.map((tx) => ({
        lotId: tx.id,
        asset: tx.receivedAsset || "",
        amount: Number(tx.receivedAmount || 0),
        acquiredAt: tx.timestamp,
      }));

      const result = compareAllMethods(
        lots,
        {
          asset: body.asset,
          amount: body.amount,
          pricePerUnit: body.pricePerUnit,
        },
        acqRecords,
      );

      return { data: result };
    },
  );

  // ─── Report History Endpoints ───────────────────────────

  // GET /tax/reports — List report history
  app.get(
    "/tax/reports",
    {
      schema: {
        tags: ["tax"],
        summary: "List report history",
        querystring: {
          type: "object" as const,
          properties: {
            limit: { type: "number" as const },
            offset: { type: "number" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            properties: {
              data: {
                type: "array" as const,
                items: {
                  type: "object" as const,
                  additionalProperties: true,
                },
              },
              total: { type: "number" as const },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const query = request.query as { limit?: string; offset?: string };
      const limit = parseInt(query.limit || "20");
      const offset = parseInt(query.offset || "0");

      const [data, total] = await Promise.all([
        prisma.taxReport.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
          select: {
            id: true,
            taxYear: true,
            method: true,
            fileType: true,
            fileName: true,
            fileSize: true,
            generatedAt: true,
            status: true,
            shortTermGains: true,
            shortTermLosses: true,
            longTermGains: true,
            longTermLosses: true,
            createdAt: true,
          },
        }),
        prisma.taxReport.count({ where: { userId } }),
      ]);

      return reply.send({ data, total });
    },
  );

  // GET /tax/reports/:id/download — Download a report file
  app.get(
    "/tax/reports/:id/download",
    {
      schema: {
        tags: ["tax"],
        summary: "Download a report file",
        params: {
          type: "object" as const,
          properties: { id: { type: "string" as const } },
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const { id } = request.params as { id: string };

      const report = await prisma.taxReport.findFirst({
        where: { id, userId },
      });

      if (!report || !report.filePath) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Report file not found",
          },
        });
      }

      const buffer = await getReport(report.filePath);
      const contentType =
        report.fileType === "pdf" ? "application/pdf" : "text/csv";

      return reply
        .header("Content-Type", contentType)
        .header(
          "Content-Disposition",
          `attachment; filename="${report.fileName || "report"}"`,
        )
        .send(buffer);
    },
  );

  // DELETE /tax/reports/:id — Delete a report
  app.delete(
    "/tax/reports/:id",
    {
      schema: {
        tags: ["tax"],
        summary: "Delete a report",
        params: {
          type: "object" as const,
          properties: { id: { type: "string" as const } },
        },
      },
    },
    async (request, reply) => {
      const userId = await resolveUserId(request);
      const { id } = request.params as { id: string };

      const report = await prisma.taxReport.findFirst({
        where: { id, userId },
      });

      if (!report) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Report not found",
          },
        });
      }

      if (report.filePath) {
        await deleteReportFile(report.filePath);
      }

      await prisma.taxReport.delete({ where: { id } });

      return reply.send({ data: { success: true } });
    },
  );
}
