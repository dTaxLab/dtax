/**
 * Regression test for Form 8949 PDF column layout.
 *
 * Prior bug: (f)/(g)/(h) were positioned with a formula anchored to the right
 * page edge that ignored where (e) Cost Basis actually ended, so (e) and (f)
 * rendered on top of each other — e.g. "(e) Cost Ba(g)sis Adj." in headers and
 * "10,961.470.00" in totals rows.
 */

import { describe, it, expect } from "vitest";
import { COLS } from "../reports/pdf/render-form8949";
import { MARGIN, CONTENT_WIDTH } from "../reports/pdf/pdf-utils";

describe("Form 8949 PDF column layout", () => {
  it("has no overlapping columns", () => {
    for (let i = 0; i < COLS.length - 1; i++) {
      const col = COLS[i];
      const next = COLS[i + 1];
      expect(col.x + col.w).toBeLessThanOrEqual(next.x);
    }
  });

  it("stays within the page content width", () => {
    const last = COLS[COLS.length - 1];
    expect(last.x + last.w).toBeLessThanOrEqual(MARGIN + CONTENT_WIDTH);
  });
});
