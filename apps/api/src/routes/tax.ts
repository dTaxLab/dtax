/**
 * Tax calculation routes.
 * POST /tax/calculate   — Run tax calculation for a given year + method
 * GET  /tax/form8949    — Generate Form 8949 report (JSON or CSV)
 * GET  /tax/schedule-d  — Generate Schedule D summary
 * GET  /tax/summary     — Get saved tax summary for a year
 * POST /tax/reconcile   — Reconcile 1099-DA against DTax calculations
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
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
import { errorResponseSchema } from "../schemas/common";
import { costBasisMethodEnum, form8949FormatEnum } from "../schemas/enums";

const calculateSchema = z
  .object({
    taxYear: z.number().int().min(2009).max(2030),
    method: costBasisMethodEnum.default("FIFO"),
    strictSilo: z.boolean().default(false),
  })
  .openapi({ ref: "TaxCalculateInput" });

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

const taxReportSchema = z
  .object({
    id: z.string().uuid(),
    taxYear: z.number().int(),
    method: z.string(),
    shortTermGains: z.number(),
    shortTermLosses: z.number(),
    longTermGains: z.number(),
    longTermLosses: z.number(),
    netGainLoss: z.number(),
    totalTransactions: z.number().int(),
    income: z.any(),
  })
  .openapi({ ref: "TaxReport" });

const taxSummarySchema = z
  .object({
    taxYear: z.number().int(),
    method: z.string(),
    shortTermGains: z.number(),
    shortTermLosses: z.number(),
    longTermGains: z.number(),
    longTermLosses: z.number(),
    netGainLoss: z.number(),
    totalIncome: z.number(),
    totalTransactions: z.number().int(),
    status: z.string(),
    updatedAt: z.date(),
  })
  .openapi({ ref: "TaxSummary" });

export async function taxRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // POST /tax/calculate — Run tax calculation
  r.post(
    "/tax/calculate",
    {
      schema: {
        tags: ["tax"],
        operationId: "calculateTax",
        description:
          "Run tax calculation for a given year and cost basis method",
        body: calculateSchema,
        response: {
          200: z.object({
            data: z.object({
              report: taxReportSchema,
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
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
  r.get(
    "/tax/form8949",
    {
      schema: {
        tags: ["tax"],
        operationId: "getForm8949",
        description:
          "Generate Form 8949 report in JSON, CSV, PDF, or TXF format",
        querystring: z.object({
          year: z.coerce.number().int().min(2009).max(2030),
          method: costBasisMethodEnum.default("FIFO"),
          format: form8949FormatEnum.default("json"),
          strictSilo: z.coerce.boolean().default(false),
          includeWashSales: z.coerce.boolean().default(false),
        }),
        response: {
          200: z
            .any()
            .openapi({
              description:
                "Form 8949 report (format depends on query parameter)",
            }),
        },
      },
    },
    async (request, reply) => {
      const query = request.query;

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

      if (query.format === "csv") {
        const csv = form8949ToCsv(report);
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
  r.get(
    "/tax/schedule-d",
    {
      schema: {
        tags: ["tax"],
        operationId: "getScheduleD",
        description: "Generate Schedule D summary from Form 8949 data",
        querystring: z.object({
          year: z.coerce.number().int().min(2009).max(2030),
          method: costBasisMethodEnum.default("FIFO"),
          strictSilo: z.coerce.boolean().default(false),
          includeWashSales: z.coerce.boolean().default(false),
          lossLimit: z.coerce.number().default(3000),
        }),
        response: {
          200: z.object({
            data: z.any().openapi({ description: "Schedule D summary" }),
          }),
        },
      },
    },
    async (request, _reply) => {
      const query = request.query;

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
  r.get(
    "/tax/summary",
    {
      schema: {
        tags: ["tax"],
        operationId: "getTaxSummary",
        description: "Get saved tax calculation summary for a year and method",
        querystring: z.object({
          year: z.coerce.number().int().min(2009).max(2030),
          method: costBasisMethodEnum.default("FIFO"),
        }),
        response: {
          200: z.object({
            data: taxSummarySchema,
          }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const query = request.query;

      const report = await prisma.taxReport.findUnique({
        where: {
          userId_taxYear_method: {
            userId: request.userId,
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
  r.post(
    "/tax/reconcile",
    {
      schema: {
        tags: ["tax"],
        operationId: "reconcileTax",
        description:
          "Upload 1099-DA CSV and reconcile against DTax calculations",
        body: z.object({
          csvContent: z.string().min(1),
          brokerName: z.string().default("Unknown"),
          taxYear: z.number().int().min(2009).max(2030),
          method: costBasisMethodEnum.default("FIFO"),
        }),
        response: {
          200: z.object({
            data: z.any().openapi({ description: "Reconciliation report" }),
          }),
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

      const parsed = parse1099DA(
        body.csvContent,
        body.brokerName,
        body.taxYear,
      );
      if (parsed.entries.length === 0) {
        return reply.status(400).send({
          error: {
            message: "No valid entries found in 1099-DA CSV",
            details: parsed.errors as any,
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
  r.get(
    "/tax/available-lots",
    {
      schema: {
        tags: ["tax"],
        operationId: "getAvailableLots",
        description:
          "List available tax lots for Specific ID cost basis method selection",
        querystring: z.object({
          year: z.coerce.number().int().min(2009).max(2030),
          asset: z.string().optional(),
        }),
        response: {
          200: z.object({
            data: z.object({
              lots: z.array(
                z.object({
                  id: z.string().uuid(),
                  asset: z.string(),
                  amount: z.number(),
                  costBasisUsd: z.number(),
                  acquiredAt: z.string().openapi({ format: "date-time" }),
                  sourceId: z.string(),
                }),
              ),
            }),
          }),
        },
      },
    },
    async (request, _reply) => {
      const query = request.query;

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
  r.post(
    "/tax/calculate-specific",
    {
      schema: {
        tags: ["tax"],
        operationId: "calculateSpecificId",
        description:
          "Calculate tax using user-selected lots (Specific ID method)",
        body: z.object({
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
        }),
        response: {
          200: z.object({
            data: z.object({
              results: z.array(z.any()),
              method: z.literal("SPECIFIC_ID"),
              taxYear: z.number().int(),
            }),
          }),
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

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
        data: {
          results,
          method: "SPECIFIC_ID" as const,
          taxYear: body.taxYear,
        },
      };
    },
  );

  // POST /tax/simulate — Simulate a hypothetical sale
  r.post(
    "/tax/simulate",
    {
      schema: {
        tags: ["tax"],
        operationId: "simulateSale",
        description: "Simulate a hypothetical sale to preview tax impact",
        body: z.object({
          asset: z.string().min(1),
          amount: z.number().positive(),
          pricePerUnit: z.number().nonnegative(),
          method: z.enum(["FIFO", "LIFO", "HIFO"]).optional().default("FIFO"),
          strictSilo: z.boolean().optional().default(false),
        }),
        response: {
          200: z.object({
            data: z.any().openapi({ description: "Simulation result" }),
          }),
        },
      },
    },
    async (request, _reply) => {
      const body = request.body;

      const acquisitions = await prisma.transaction.findMany({
        where: {
          userId: request.userId,
          type: { in: [...ACQUISITION_TYPES] },
        },
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

  r.post(
    "/tax/compare-methods",
    {
      schema: {
        tags: ["tax"],
        operationId: "compareMethods",
        description:
          "Compare tax impact across all cost basis methods (FIFO, LIFO, HIFO)",
        body: z.object({
          asset: z.string().min(1),
          amount: z.number().positive(),
          pricePerUnit: z.number().nonnegative(),
        }),
        response: {
          200: z.object({
            data: z.any().openapi({ description: "Method comparison results" }),
          }),
        },
      },
    },
    async (request) => {
      const body = request.body;

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
}
