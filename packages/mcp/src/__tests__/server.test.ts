import { describe, it, expect, afterEach } from "vitest";
import { connect, workspace, HEADER, TWO_LOTS } from "./helpers";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function setup(files: Record<string, string>) {
  const w = workspace(files);
  const c = await connect(w.dir);
  close = c.close;
  return { ...w, ...c };
}

describe("the tools", () => {
  it("offers four tools, all read-only and none that reaches outside the computer", async () => {
    const { client } = await setup({});
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "dtax_estimate_gains",
      "dtax_explain_disposal",
      "dtax_read_file_summary",
      "dtax_supported_formats",
    ]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.annotations?.openWorldHint, t.name).toBe(false);
    }
  });

  it("carries the instructions (the long notice) to the assistant", async () => {
    const { client } = await setup({});
    expect(client.getInstructions()).toMatch(/not tax advice/i);
  });

  it("supported formats: the notice first, only the United States", async () => {
    const { call } = await setup({});
    const r = await call("dtax_supported_formats", {});
    expect(Object.keys(r.structuredContent!)[0]).toBe("notice");
    expect(r.structuredContent!.countries).toEqual(["US"]);
    expect(r.content[0].text.startsWith("Informational estimate only")).toBe(
      true,
    );
  });
});

describe("dtax_estimate_gains", () => {
  it("FIFO: the earliest lot is used first (hand-computed: 2025 gain 20,000, long term)", async () => {
    const { call, paths } = await setup({ "a.csv": TWO_LOTS });
    const r = await call("dtax_estimate_gains", {
      paths: [paths["a.csv"]],
      country: "US",
      tax_year: 2025,
      method: "FIFO",
    });
    expect(r.isError).toBeFalsy();
    const t = r.structuredContent!.estimated_totals;
    expect(t).toMatchObject({
      long_term_gains: 20000,
      short_term_gains: 0,
      estimated_net_gain_loss: 20000,
      disposals: 1,
    });
    expect(r.structuredContent!.completeness.is_complete).toBe(true);
  });

  it("HIFO: the highest-cost lot goes first, so the same file gives another answer (2025 gain 40,000)", async () => {
    const { call, paths } = await setup({ "a.csv": TWO_LOTS });
    const r = await call("dtax_estimate_gains", {
      paths: [paths["a.csv"]],
      country: "US",
      tax_year: 2025,
      method: "HIFO",
    });
    expect(r.structuredContent!.estimated_totals.estimated_net_gain_loss).toBe(
      40000,
    );
  });

  it("states its basis and puts the notice first", async () => {
    const { call, paths } = await setup({ "a.csv": TWO_LOTS });
    const r = await call("dtax_estimate_gains", {
      paths: [paths["a.csv"]],
      country: "US",
      tax_year: 2025,
      method: "FIFO",
    });
    const s = r.structuredContent!;
    expect(Object.keys(s)[0]).toBe("notice");
    expect(s.basis_of_calculation).toMatchObject({
      country: "US",
      tax_year: 2025,
      method: "FIFO",
      currency: "USD",
    });
    expect(s.basis_of_calculation.rule_set_version).toMatch(
      /^@dtax\/tax-engine@\d/,
    );
    expect(s.not_modeled.length).toBeGreaterThan(0);
    expect(r.content[0].text.startsWith("Informational estimate only")).toBe(
      true,
    );
  });

  it("a sale with no earlier purchase is reported as missing cost basis, not as a clean figure", async () => {
    const csv = [HEADER, "SELL,2025-03-01T00:00:00Z,,,,BTC,1,50000", ""].join(
      "\n",
    );
    const { call, paths } = await setup({ "a.csv": csv });
    const r = await call("dtax_estimate_gains", {
      paths: [paths["a.csv"]],
      country: "US",
      tax_year: 2025,
      method: "FIFO",
    });
    const c = r.structuredContent!.completeness;
    expect(c.is_complete).toBe(false);
    expect(c.disposals_with_missing_cost_basis).toBe(1);
    expect(r.content[0].text).toMatch(/Not complete/);
  });

  it("a purchase with no USD value, and transfers, are counted and flagged", async () => {
    const csv = [
      HEADER,
      "BUY,2024-01-01T00:00:00Z,BTC,1,,,,",
      "TRANSFER_OUT,2024-02-01T00:00:00Z,,,,BTC,0.5,",
      "",
    ].join("\n");
    const { call, paths } = await setup({ "a.csv": csv });
    const r = await call("dtax_estimate_gains", {
      paths: [paths["a.csv"]],
      country: "US",
      tax_year: 2024,
      method: "FIFO",
    });
    const s = r.structuredContent!;
    expect(s.completeness.acquisitions_without_usd_value).toBe(1);
    expect(s.completeness.transfer_rows_unpaired).toBe(1);
    expect(s.completeness.is_complete).toBe(false);
    expect(s.review_flags.map((f: any) => f.code)).toContain("TRANSFER_OUT");
  });

  it("refuses what it was not asked clearly: no tax year, or a country it does not cover", async () => {
    const { call, paths } = await setup({ "a.csv": TWO_LOTS });
    const noYear = await call("dtax_estimate_gains", {
      paths: [paths["a.csv"]],
      country: "US",
      method: "FIFO",
    }).catch((e) => ({
      isError: true,
      content: [{ type: "text", text: String(e) }],
    }));
    expect(noYear.isError).toBe(true);
    const gb = await call("dtax_estimate_gains", {
      paths: [paths["a.csv"]],
      country: "GB",
      tax_year: 2025,
      method: "FIFO",
    }).catch((e) => ({
      isError: true,
      content: [{ type: "text", text: String(e) }],
    }));
    expect(gb.isError).toBe(true);
  });
});

describe("dtax_read_file_summary", () => {
  it("counts rows, dates and types, and the rows it could not read are only numbers", async () => {
    const csv = [
      HEADER,
      "BUY,2024-01-01T00:00:00Z,BTC,1,100,,,",
      "BUY,not-a-date,BTC,x,,,,",
      "",
    ].join("\n");
    const { call, paths } = await setup({ "a.csv": csv });
    const r = await call("dtax_read_file_summary", { paths: [paths["a.csv"]] });
    const s = r.structuredContent!.input_summary;
    expect(s.rows_parsed).toBe(1);
    expect(s.rows_failed).toBeGreaterThanOrEqual(1);
    expect(s.date_range.from).toBe("2024-01-01");
    expect(s.rows_by_type.BUY).toBe(1);
  });
});

describe("dtax_explain_disposal", () => {
  it("shows the lot a disposal used, its date, cost and holding time", async () => {
    const { call, paths } = await setup({ "a.csv": TWO_LOTS });
    const args = {
      paths: [paths["a.csv"]],
      country: "US",
      tax_year: 2025,
      method: "FIFO",
    };
    const est = await call("dtax_estimate_gains", args);
    const id = est.structuredContent!.largest_disposals[0].disposal_id;
    const r = await call("dtax_explain_disposal", { ...args, disposal_id: id });
    const d = r.structuredContent!.disposal;
    expect(d.proceeds_usd).toBe(50000);
    expect(d.estimated_gain_loss_usd).toBe(20000);
    expect(d.holding_period).toBe("long_term");
    expect(d.matched_lots).toHaveLength(1);
    expect(d.matched_lots[0]).toMatchObject({
      acquired_on: "2023-06-01",
      cost_basis_usd: 30000,
    });
  });

  it("an id that is not in that year is refused with a plain message", async () => {
    const { call, paths } = await setup({ "a.csv": TWO_LOTS });
    const r = await call("dtax_explain_disposal", {
      paths: [paths["a.csv"]],
      country: "US",
      tax_year: 2025,
      method: "FIFO",
      disposal_id: "evt-999",
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not in this tax year/);
  });
});
