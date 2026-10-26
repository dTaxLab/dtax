import { describe, it, expect } from "vitest";
import { renderDataLine } from "../reports/pdf/render-form8949";

/** Minimal pdfkit stand-in: 4.4pt per character at 8pt, scaled with the font size. */
function fakeDoc() {
  let size = 8;
  const calls: {
    text: string;
    size: number;
    options: Record<string, unknown>;
  }[] = [];
  const doc = {
    fontSize(n: number) {
      size = n;
      return doc;
    },
    font() {
      return doc;
    },
    widthOfString(t: string) {
      return t.length * 0.55 * size;
    },
    text(t: string, _x: number, _y: number, options: Record<string, unknown>) {
      calls.push({ text: t, size, options });
      return doc;
    },
  };
  return { doc, calls };
}

const line = (description: string) => ({
  description,
  dateAcquired: "VARIOUS",
  dateSold: "2025-06-01",
  proceeds: 1,
  costBasis: 1,
  adjustmentCode: "",
  adjustmentAmount: 0,
  gainLoss: 0,
  box: "C" as const,
});

describe("Form 8949 PDF description column", () => {
  it("keeps a short description at full size", () => {
    const { doc, calls } = fakeDoc();
    renderDataLine(doc as never, 100, line("1 BTC") as never);
    expect(calls[0]).toMatchObject({ text: "1 BTC", size: 8 });
  });

  it("shrinks a long UK description to fit instead of wrapping, and never breaks the line", () => {
    const { doc, calls } = fakeDoc();
    const text = "0.12345678 BTC (UK: SD, 30D, S104)";
    renderDataLine(doc as never, 100, line(text) as never);
    expect(calls[0].size).toBeLessThan(8);
    expect(calls[0].options.lineBreak).toBe(false);
    expect(text.length * 0.55 * calls[0].size).toBeLessThanOrEqual(123 + 0.01);
  });

  it("an absurdly long description is cut with an ellipsis rather than spilling over", () => {
    const { doc, calls } = fakeDoc();
    renderDataLine(doc as never, 100, line("x".repeat(80)) as never);
    expect(calls[0].text.endsWith("…")).toBe(true);
    expect(calls[0].text.length * 0.55 * calls[0].size).toBeLessThanOrEqual(
      123 + 0.01,
    );
  });

  it("the other columns are drawn at the normal size again", () => {
    const { doc, calls } = fakeDoc();
    renderDataLine(
      doc as never,
      100,
      line("0.12345678 BTC (UK: SD, 30D, S104)") as never,
    );
    expect(calls.slice(1).every((c) => c.size === 8)).toBe(true);
  });
});
