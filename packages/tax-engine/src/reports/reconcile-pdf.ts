/**
 * 1099-DA Reconciliation Difference Report PDF Generator
 *
 * Generates a structured PDF showing discrepancies between broker-reported
 * 1099-DA data and DTax calculations — suitable for CPA review or IRS filing support.
 *
 * @license AGPL-3.0
 */

import PDFDocument from "pdfkit";
import type { ReconciliationReport } from "../reconciliation/types";
import { MARGIN, PAGE_WIDTH, CONTENT_WIDTH, LINE_HEIGHT, fmtUsd, ensureSpace } from "./pdf/pdf-utils";

// ─── Layout constants ───────────────────────────

const COL = {
  date:    MARGIN,
  asset:   MARGIN + 70,
  status:  MARGIN + 120,
  risk:    MARGIN + 230,
  broker:  MARGIN + 290,
  dtax:    MARGIN + 380,
  diff:    MARGIN + 470,
};

const RISK_COLORS: Record<string, string> = {
  HIGH:   "#dc2626",
  MEDIUM: "#ca8a04",
  LOW:    "#2563eb",
  INFO:   "#6b7280",
};

// ─── Helpers ─────────────────────────────────────

function fmtDate(iso: string | Date | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ─── PDF Generator ───────────────────────────────

export interface ReconcilePdfOptions {
  taxpayerName?: string;
}

/**
 * Generate a 1099-DA difference report PDF as a Buffer.
 */
export async function generateReconcilePdf(
  report: ReconciliationReport,
  options: ReconcilePdfOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Cover / Title ─────────────────────────────────
    doc.fontSize(16).font("Helvetica-Bold").text("1099-DA Reconciliation Report", MARGIN, MARGIN, { width: CONTENT_WIDTH });
    doc.fontSize(10).font("Helvetica").fillColor("#6b7280");
    const subtitle = [
      `Tax Year: ${report.taxYear}`,
      `Broker: ${report.brokerName}`,
      options.taxpayerName ? `Taxpayer: ${options.taxpayerName}` : null,
      `Generated: ${new Date().toLocaleDateString("en-US")}`,
    ].filter(Boolean).join("   |   ");
    doc.text(subtitle, MARGIN, doc.y + 4, { width: CONTENT_WIDTH });
    doc.fillColor("#000").moveDown(0.8);

    // ── Summary block ─────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").text("Summary", MARGIN, doc.y);
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica");

    const summaryRows: [string, string][] = [
      ["Broker entries",        String(report.summary.totalBrokerEntries)],
      ["dTax dispositions",     String(report.summary.totalDtaxDispositions)],
      ["Matched",               String(report.summary.matched)],
      ["Missing in dTax",       String(report.summary.missingInDtax)],
      ["Not on 1099-DA",        String(report.summary.missingIn1099da)],
      ["Transfer misclassified",String(report.summary.internalTransferMisclassified)],
      ["Net gain/loss diff",    fmtUsd(report.summary.netGainLossDiff)],
      ["No-basis entries",      String(report.summary.basisMissingCount)],
      ["Est. tax overexposure", fmtUsd(report.summary.estimatedTaxOverpayment)],
    ];

    for (const [label, value] of summaryRows) {
      doc.fillColor("#374151").text(label + ":", MARGIN, doc.y, { continued: true, width: 200 });
      doc.fillColor("#111827").text(value, { align: "left" });
    }
    doc.moveDown(1);

    // ── Column headers ────────────────────────────────
    ensureSpace(doc, 20 + LINE_HEIGHT * 3);
    doc.fontSize(11).font("Helvetica-Bold").text("Detail", MARGIN, doc.y);
    doc.moveDown(0.3);

    const headerY = doc.y;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#6b7280");
    doc.text("Date Sold", COL.date, headerY, { width: 65 });
    doc.text("Asset", COL.asset, headerY, { width: 45 });
    doc.text("Status", COL.status, headerY, { width: 105 });
    doc.text("Risk", COL.risk, headerY, { width: 55 });
    doc.text("Broker Proceeds", COL.broker, headerY, { width: 85, align: "right" });
    doc.text("dTax Proceeds", COL.dtax, headerY, { width: 85, align: "right" });
    doc.text("Diff", COL.diff, headerY, { width: 60, align: "right" });

    doc.moveTo(MARGIN, doc.y + 2).lineTo(PAGE_WIDTH - MARGIN, doc.y + 2).stroke("#e5e7eb");
    doc.moveDown(0.5);

    // ── Rows ──────────────────────────────────────────
    const STATUS_LABEL: Record<string, string> = {
      matched:                       "Matched",
      proceeds_mismatch:             "Proceeds Mismatch",
      basis_mismatch:                "Basis Mismatch",
      both_mismatch:                 "Both Mismatch",
      missing_in_dtax:               "Missing in dTax",
      missing_in_1099da:             "Not on 1099-DA",
      internal_transfer_misclassified: "Transfer Misclassified",
    };

    const nonMatchedFirst = [...report.items].sort((a, b) => {
      const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
      return (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3);
    });

    for (const item of nonMatchedFirst) {
      ensureSpace(doc, LINE_HEIGHT + 4);
      const rowY = doc.y;
      doc.fontSize(8).font("Helvetica").fillColor("#111827");

      const dateSold = item.brokerEntry?.dateSold ?? item.dtaxEntry?.dateSold;
      const asset = item.brokerEntry?.asset ?? item.dtaxEntry?.asset ?? "—";
      const brokerProceeds = item.brokerEntry?.grossProceeds;
      const dtaxProceeds = item.dtaxEntry?.proceeds;

      doc.text(fmtDate(dateSold instanceof Date ? dateSold.toISOString() : dateSold), COL.date, rowY, { width: 65 });
      doc.text(asset, COL.asset, rowY, { width: 45 });
      doc.fillColor(item.riskLevel === "INFO" ? "#374151" : "#111827").text(STATUS_LABEL[item.status] ?? item.status, COL.status, rowY, { width: 105 });
      doc.fillColor(RISK_COLORS[item.riskLevel] ?? "#6b7280").text(item.riskLevel, COL.risk, rowY, { width: 55 });
      doc.fillColor("#111827");
      doc.text(brokerProceeds != null ? fmtUsd(brokerProceeds) : "—", COL.broker, rowY, { width: 85, align: "right" });
      doc.text(dtaxProceeds != null ? fmtUsd(dtaxProceeds) : "—", COL.dtax, rowY, { width: 85, align: "right" });
      const diffColor = item.proceedsDiff === 0 ? "#6b7280" : Math.abs(item.proceedsDiff) > 0 ? "#dc2626" : "#16a34a";
      doc.fillColor(diffColor).text(item.proceedsDiff !== 0 ? fmtUsd(item.proceedsDiff) : "—", COL.diff, rowY, { width: 60, align: "right" });
      doc.fillColor("#111827");

      doc.moveDown(0.25);
    }

    doc.moveDown(1);
    doc.fontSize(7).fillColor("#9ca3af").text(
      "This report is generated by dTax (getdtax.com) for informational purposes. Consult a qualified tax professional before filing.",
      MARGIN, doc.y, { width: CONTENT_WIDTH, align: "center" },
    );

    doc.end();
  });
}
