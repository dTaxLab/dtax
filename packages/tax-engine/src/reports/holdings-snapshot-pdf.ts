/**
 * Holdings Snapshot PDF Generator
 *
 * Generates a 3-section attestation-grade PDF:
 *  1. Cover — taxpayer name, snapshot date, signature line
 *  2. Holdings table — asset, quantity, cost basis, current value, unrealized gain/loss
 *  3. Legal attestation — disclaimer and self-certification language
 *
 * Suitable for proof-of-assets, estate planning, and CPA review.
 *
 * @license AGPL-3.0
 */

import PDFDocument from "pdfkit";
import {
  MARGIN,
  CONTENT_WIDTH,
  LINE_HEIGHT,
  renderFooter,
  fmtUsd,
  ensureSpace,
} from "./pdf/pdf-utils";

// ─── Public types ────────────────────────────

export interface HoldingSnapshotRow {
  asset: string;
  totalAmount: number;
  totalCostBasis: number;
  currentValueUsd: number | null;
  unrealizedGainLoss: number | null;
  holdingPeriod: "SHORT_TERM" | "LONG_TERM" | "MIXED";
  lotCount: number;
}

export interface HoldingsSnapshotData {
  taxpayerName?: string;
  snapshotDate: string;    // ISO date string
  positions: HoldingSnapshotRow[];
  totalCostBasis: number;
  totalCurrentValue: number | null;
  totalUnrealizedGainLoss: number | null;
}

// ─── Layout constants ────────────────────────

const COL = {
  asset:     MARGIN,
  amount:    MARGIN + 80,
  costBasis: MARGIN + 170,
  value:     MARGIN + 260,
  gainLoss:  MARGIN + 345,
  period:    MARGIN + 430,
  lots:      MARGIN + 490,
};

// ─── Helpers ─────────────────────────────────

function fmtAmount(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(3);
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── PDF Generator ───────────────────────────

export async function generateHoldingsSnapshotPdf(
  data: HoldingsSnapshotData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { taxpayerName, snapshotDate, positions, totalCostBasis, totalCurrentValue, totalUnrealizedGainLoss } = data;

    // ══════════════════════════════════════════════════
    // 1. COVER PAGE
    // ══════════════════════════════════════════════════

    doc.fontSize(20).font("Helvetica-Bold").fillColor("#111827")
      .text("Crypto Holdings Snapshot", MARGIN, 90, { width: CONTENT_WIDTH, align: "center" });

    doc.fontSize(12).font("Helvetica").fillColor("#6b7280").moveDown(0.4)
      .text(`As of ${fmtDate(snapshotDate)}`, { align: "center" });

    if (taxpayerName) {
      doc.fontSize(11).moveDown(0.3)
        .text(`Prepared for: ${taxpayerName}`, { align: "center" });
    }

    doc.fontSize(9).fillColor("#374151").moveDown(2);

    // Summary box
    const summaryY = doc.y;
    doc.rect(MARGIN, summaryY, CONTENT_WIDTH, 80).strokeColor("#d1d5db").stroke();

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#111827")
      .text("Portfolio Summary", MARGIN + 12, summaryY + 10);

    const summaryItems: [string, string][] = [
      ["Total Positions",         String(positions.length)],
      ["Total Cost Basis",        fmtUsd(totalCostBasis)],
      ["Total Current Value",     fmtUsd(totalCurrentValue)],
      ["Total Unrealized Gain/Loss", fmtUsd(totalUnrealizedGainLoss)],
    ];

    doc.fontSize(8.5).font("Helvetica");
    let summaryItemY = summaryY + 26;
    for (const [label, value] of summaryItems) {
      doc.fillColor("#6b7280").text(label + ":", MARGIN + 12, summaryItemY, { continued: true, width: 220 });
      doc.fillColor("#111827").font("Helvetica-Bold").text(value);
      doc.font("Helvetica");
      summaryItemY += 13;
    }

    // Signature block
    doc.fillColor("#374151").fontSize(9).moveDown(4);
    const sigY = doc.y;
    doc.moveTo(MARGIN, sigY).lineTo(MARGIN + 220, sigY).strokeColor("#374151").stroke();
    doc.fontSize(7.5).fillColor("#6b7280").text("Taxpayer Signature", MARGIN, sigY + 3);

    doc.moveTo(MARGIN + CONTENT_WIDTH - 160, sigY).lineTo(MARGIN + CONTENT_WIDTH, sigY).strokeColor("#374151").stroke();
    doc.text("Date", MARGIN + CONTENT_WIDTH - 160, sigY + 3);

    doc.addPage();

    // ══════════════════════════════════════════════════
    // 2. HOLDINGS TABLE
    // ══════════════════════════════════════════════════

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827")
      .text("Holdings Detail", MARGIN, doc.y);
    doc
      .moveTo(MARGIN, doc.y + 2)
      .lineTo(MARGIN + CONTENT_WIDTH, doc.y + 2)
      .strokeColor("#d1d5db")
      .stroke();
    doc.fillColor("#000").moveDown(0.5);

    doc.fontSize(7.5).font("Helvetica").fillColor("#6b7280")
      .text(
        `All crypto holdings as of ${fmtDate(snapshotDate)}. ` +
        "Unrealized gain/loss based on current prices provided at time of export.",
        MARGIN, doc.y, { width: CONTENT_WIDTH },
      );
    doc.moveDown(0.5);

    // Column headers
    doc.fontSize(7).font("Helvetica-Bold").fillColor("#6b7280");
    const headerY = doc.y;
    doc.text("Asset",       COL.asset,     headerY, { width: 75 });
    doc.text("Quantity",    COL.amount,    headerY, { width: 85, align: "right" });
    doc.text("Cost Basis",  COL.costBasis, headerY, { width: 85, align: "right" });
    doc.text("Cur. Value",  COL.value,     headerY, { width: 80, align: "right" });
    doc.text("Unrlzd G/L",  COL.gainLoss,  headerY, { width: 80, align: "right" });
    doc.text("Period",      COL.period,    headerY, { width: 55, align: "center" });
    doc.text("Lots",        COL.lots,      headerY, { width: 30, align: "right" });
    doc.fillColor("#000").moveDown(0.3);

    // Header separator
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).strokeColor("#e5e7eb").stroke();
    doc.moveDown(0.2);

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      ensureSpace(doc, LINE_HEIGHT + 2);
      const y = doc.y;

      const gainColor = pos.unrealizedGainLoss == null
        ? "#374151"
        : pos.unrealizedGainLoss >= 0 ? "#15803d" : "#dc2626";

      const periodLabel = pos.holdingPeriod === "LONG_TERM" ? "Long"
        : pos.holdingPeriod === "SHORT_TERM" ? "Short" : "Mixed";
      const periodColor = pos.holdingPeriod === "LONG_TERM" ? "#15803d"
        : pos.holdingPeriod === "SHORT_TERM" ? "#ca8a04" : "#6b7280";

      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#111827")
        .text(pos.asset, COL.asset, y, { width: 75 });

      doc.font("Helvetica").fillColor("#374151")
        .text(fmtAmount(pos.totalAmount), COL.amount,    y, { width: 85, align: "right" })
        .text(fmtUsd(pos.totalCostBasis), COL.costBasis, y, { width: 85, align: "right" })
        .text(fmtUsd(pos.currentValueUsd), COL.value,    y, { width: 80, align: "right" });

      doc.fillColor(gainColor)
        .text(fmtUsd(pos.unrealizedGainLoss), COL.gainLoss, y, { width: 80, align: "right" });

      doc.fillColor(periodColor)
        .text(periodLabel, COL.period, y, { width: 55, align: "center" });

      doc.fillColor("#374151")
        .text(String(pos.lotCount), COL.lots, y, { width: 30, align: "right" });

      doc.moveDown(0.15);

      // Subtle separator every 5 rows
      if (i % 5 === 4) {
        doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).strokeColor("#f3f4f6").stroke();
      }
    }

    // Totals row
    doc.moveDown(0.3);
    ensureSpace(doc, LINE_HEIGHT + 4);
    const totalY = doc.y;
    doc.moveTo(MARGIN, totalY).lineTo(MARGIN + CONTENT_WIDTH, totalY).strokeColor("#9ca3af").stroke();
    doc.moveDown(0.2);

    const finalY = doc.y;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#111827")
      .text("TOTAL", COL.asset, finalY, { width: 75 });
    doc
      .text(fmtUsd(totalCostBasis),        COL.costBasis, finalY, { width: 85, align: "right" })
      .text(fmtUsd(totalCurrentValue),     COL.value,     finalY, { width: 80, align: "right" });

    const totalGainColor = totalUnrealizedGainLoss == null
      ? "#111827"
      : totalUnrealizedGainLoss >= 0 ? "#15803d" : "#dc2626";
    doc.fillColor(totalGainColor)
      .text(fmtUsd(totalUnrealizedGainLoss), COL.gainLoss, finalY, { width: 80, align: "right" });

    doc.addPage();

    // ══════════════════════════════════════════════════
    // 3. LEGAL ATTESTATION
    // ══════════════════════════════════════════════════

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827")
      .text("Legal Attestation & Disclaimer", MARGIN, doc.y);
    doc
      .moveTo(MARGIN, doc.y + 2)
      .lineTo(MARGIN + CONTENT_WIDTH, doc.y + 2)
      .strokeColor("#d1d5db")
      .stroke();
    doc.fillColor("#000").moveDown(0.8);

    const attestText = [
      "INFORMATIONAL PURPOSE ONLY",
      "This Holdings Snapshot is generated by dTax (getdtax.com) and is provided solely for " +
      "informational and record-keeping purposes. It does not constitute legal, tax, financial, " +
      "or investment advice. The information herein should not be relied upon as a definitive " +
      "statement of asset ownership, value, or tax liability.",

      "DATA ACCURACY",
      "Holdings data is derived from blockchain wallet addresses and exchange APIs connected " +
      "to the dTax account. Market values, where shown, are based on price data available at " +
      "the time of export and may not reflect current market conditions. Cost basis figures " +
      "are calculated using the selected accounting method and may differ from broker " +
      "statements or exchange records.",

      "NO GUARANTEE OF COMPLETENESS",
      "This report may not include all cryptocurrency holdings if not all wallets and exchanges " +
      "have been connected to the dTax account. The holder of this document is responsible " +
      "for ensuring completeness and accuracy before relying on this document for any " +
      "legal, regulatory, or financial purpose.",

      "SELF-CERTIFICATION",
      "By signing below, the taxpayer certifies that, to the best of their knowledge, the " +
      "account connections used to generate this report represent their complete cryptocurrency " +
      "portfolio as of the snapshot date indicated on the cover page.",
    ];

    for (let i = 0; i < attestText.length; i++) {
      ensureSpace(doc, 22);
      if (i % 2 === 0) {
        // Section title
        doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#374151")
          .text(attestText[i], MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.25);
      } else {
        // Body text
        doc.fontSize(8).font("Helvetica").fillColor("#4b5563")
          .text(attestText[i], MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.moveDown(0.8);
      }
    }

    // Final signature block
    doc.moveDown(1.5);
    ensureSpace(doc, 50);
    const finalSigY = doc.y;

    doc.moveTo(MARGIN, finalSigY).lineTo(MARGIN + 240, finalSigY).strokeColor("#374151").stroke();
    doc.fontSize(7.5).font("Helvetica").fillColor("#6b7280")
      .text("Taxpayer Signature", MARGIN, finalSigY + 4);

    doc.moveTo(MARGIN + CONTENT_WIDTH - 140, finalSigY)
      .lineTo(MARGIN + CONTENT_WIDTH, finalSigY)
      .strokeColor("#374151").stroke();
    doc.text("Date", MARGIN + CONTENT_WIDTH - 140, finalSigY + 4);

    // Footer on every page
    const pageCount = (doc as any).bufferedPageRange?.()?.count ?? 1;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      renderFooter(doc);
    }

    doc.end();
  });
}
