/**
 * The dTax MCP server: four read-only tools over files on this computer.
 *
 * No network, no telemetry, no writes. Every result starts with the notice and
 * carries the basis of the calculation and whether it is complete.
 *
 * @license AGPL-3.0
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { CsvFormat } from "@dtax/tax-engine";
import {
  COUNTRIES,
  ENGINE_VERSION,
  INSTRUCTIONS,
  LEARN_MORE,
  METHODS,
  MAX_FILES,
  NOT_MODELED,
  NOTICE,
  PRESENTATION_GUIDANCE,
  PRIVACY_NOTE,
  SERVER_VERSION,
  SUPPORTED_FORMATS,
} from "./constants";
import { allowedRoots, UserError } from "./safe-files";
import {
  calculate,
  describeDisposal,
  loadFiles,
  summarizeInput,
} from "./analysis";
import type { Method } from "./constants";

const paths = z
  .array(z.string().min(1).max(1000))
  .min(1)
  .max(MAX_FILES)
  .describe(
    "Paths of .csv files on this computer (exchange or wallet exports).",
  );
const format = z
  .enum(SUPPORTED_FORMATS as unknown as [CsvFormat, ...CsvFormat[]])
  .optional()
  .describe("File format. Detected automatically when omitted.");
const country = z
  .enum(COUNTRIES)
  .describe("Country whose rules are used. Only US is available.");
const taxYear = z
  .number()
  .int()
  .min(2009)
  .max(2100)
  .describe("The tax year the figures are for.");
const method = z.enum(METHODS).describe("Cost basis method.");

const basisShape = {
  country: z.string(),
  tax_year: z.number(),
  method: z.string(),
  currency: z.string(),
  rule_set_version: z.string(),
};

const completenessShape = {
  is_complete: z.boolean(),
  rows_failed_to_read: z.number(),
  acquisitions_without_usd_value: z.number(),
  disposals_without_usd_value: z.number(),
  disposals_with_missing_cost_basis: z.number(),
  transfer_rows_unpaired: z.number(),
  rows_of_unrecognised_type: z.number(),
};

const inputSummaryShape = {
  files: z.number(),
  rows_read: z.number(),
  rows_parsed: z.number(),
  rows_failed: z.number(),
  failed_row_numbers: z.array(z.number()),
  detected_formats: z.array(z.string()),
  date_range: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  rows_by_type: z.record(z.string(), z.number()),
  assets: z.object({ count: z.number(), top: z.array(z.string()) }),
};

const reviewFlagShape = z.object({
  code: z.string(),
  rows: z.number(),
  note: z.string(),
});

function ok(
  structured: Record<string, unknown>,
  lines: string[],
): CallToolResult {
  return {
    content: [{ type: "text", text: [NOTICE, "", ...lines].join("\n") }],
    structuredContent: structured,
  };
}

function fail(err: unknown): CallToolResult {
  // Only what is known to be safe: the message of a UserError, never a file's content.
  const text =
    err instanceof UserError
      ? err.message
      : "The request could not be completed.";
  return { isError: true, content: [{ type: "text", text }] };
}

const basis = (taxYearValue: number, m: Method) => ({
  country: "US",
  tax_year: taxYearValue,
  method: m,
  currency: "USD",
  rule_set_version: `@dtax/tax-engine@${ENGINE_VERSION}`,
});

const common = () => ({
  notice: NOTICE,
  presentation_guidance: PRESENTATION_GUIDANCE,
  privacy_note: PRIVACY_NOTE,
  learn_more: LEARN_MORE,
});

export function createServer(env: NodeJS.ProcessEnv = process.env): McpServer {
  const server = new McpServer(
    { name: "dtax-mcp", version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  const roots = () => allowedRoots(env);

  server.registerTool(
    "dtax_supported_formats",
    {
      title: "Supported file formats and methods",
      description:
        "Lists the CSV formats, cost basis methods and countries this server supports, and what it does not handle. Reads nothing from the computer.",
      inputSchema: {},
      outputSchema: {
        notice: z.string(),
        formats: z.array(z.string()),
        methods: z.array(z.string()),
        countries: z.array(z.string()),
        not_modeled: z.array(z.string()),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      ok(
        {
          notice: NOTICE,
          formats: [...SUPPORTED_FORMATS],
          methods: [...METHODS],
          countries: [...COUNTRIES],
          not_modeled: NOT_MODELED,
        },
        [
          `Formats: ${SUPPORTED_FORMATS.join(", ")}`,
          `Methods: ${METHODS.join(", ")}. Countries: ${COUNTRIES.join(", ")}.`,
          "Not handled:",
          ...NOT_MODELED.map((n) => `- ${n}`),
        ],
      ),
  );

  server.registerTool(
    "dtax_read_file_summary",
    {
      title: "Summarize transaction files",
      description:
        "Reads .csv transaction files on this computer and summarizes what is in them: format, row counts, date range, rows by type, and which rows could not be read. Returns counts and dates only, not the rows.",
      inputSchema: { paths, format },
      outputSchema: {
        notice: z.string(),
        presentation_guidance: z.string(),
        privacy_note: z.string(),
        learn_more: z.string(),
        input_summary: z.object(inputSummaryShape),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ paths: ps, format: fmt }) => {
      try {
        const loaded = loadFiles(ps, roots(), fmt);
        const s = summarizeInput(loaded);
        return ok({ ...common(), input_summary: s }, [
          `Read ${s.files} file(s): ${s.rows_parsed} of ${s.rows_read} rows understood, ${s.rows_failed} not.`,
          `Formats: ${s.detected_formats.join(", ") || "none"}. Dates: ${s.date_range.from ?? "?"} to ${s.date_range.to ?? "?"}.`,
          `Rows by type: ${
            Object.entries(s.rows_by_type)
              .map(([t, n]) => `${t} ${n}`)
              .join(", ") || "none"
          }.`,
        ]);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "dtax_estimate_gains",
    {
      title: "Estimate capital gains for a tax year",
      description:
        "Estimates capital gains and losses for one tax year from .csv transaction files on this computer, using the chosen method and the United States rules. Returns totals, the largest disposals, and what is missing from the data. The figures are estimates and may be incomplete.",
      inputSchema: { paths, country, tax_year: taxYear, method, format },
      outputSchema: {
        ...{
          notice: z.string(),
          presentation_guidance: z.string(),
          privacy_note: z.string(),
          learn_more: z.string(),
        },
        basis_of_calculation: z.object(basisShape),
        input_summary: z.object(inputSummaryShape),
        completeness: z.object(completenessShape),
        assumptions_applied: z.array(z.string()),
        review_flags: z.array(reviewFlagShape),
        not_modeled: z.array(z.string()),
        estimated_totals: z.object({
          short_term_gains: z.number(),
          short_term_losses: z.number(),
          long_term_gains: z.number(),
          long_term_losses: z.number(),
          estimated_net_gain_loss: z.number(),
          disposals: z.number(),
        }),
        largest_disposals: z.array(
          z.object({
            disposal_id: z.string(),
            asset: z.string(),
            date: z.string().nullable(),
            proceeds_usd: z.number().nullable(),
            estimated_gain_loss_usd: z.number().nullable(),
            holding_period: z.string(),
            cost_basis_missing_for_units: z.number(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ paths: ps, tax_year, method: m, format: fmt }) => {
      try {
        const loaded = loadFiles(ps, roots(), fmt);
        const calc = calculate(loaded, { method: m, taxYear: tax_year });
        const largest = [...calc.results]
          .sort((a, b) => Math.abs(b.gainLoss) - Math.abs(a.gainLoss))
          .slice(0, 5)
          .map((r) => {
            const d = describeDisposal(r, calc.lotById);
            return {
              disposal_id: d.disposal_id,
              asset: d.asset,
              date: d.date,
              proceeds_usd: d.proceeds_usd,
              estimated_gain_loss_usd: d.estimated_gain_loss_usd,
              holding_period: d.holding_period,
              cost_basis_missing_for_units: d.cost_basis_missing_for_units,
            };
          });
        const c = calc.completeness;
        const assumptions = [
          "A row without a USD value is counted as having none.",
          "Transfers in are acquisitions and transfers out are disposals at the value in the file.",
          "Units sold with no earlier acquisition in the files are counted with no cost.",
        ];
        const gaps: string[] = [];
        if (c.rows_failed_to_read)
          gaps.push(`${c.rows_failed_to_read} rows not read`);
        if (c.acquisitions_without_usd_value)
          gaps.push(
            `${c.acquisitions_without_usd_value} acquisitions without a USD value`,
          );
        if (c.disposals_without_usd_value)
          gaps.push(
            `${c.disposals_without_usd_value} disposals without a USD value`,
          );
        if (c.disposals_with_missing_cost_basis)
          gaps.push(
            `${c.disposals_with_missing_cost_basis} disposals with missing cost basis`,
          );
        if (c.transfer_rows_unpaired)
          gaps.push(`${c.transfer_rows_unpaired} transfer rows not paired`);
        if (c.rows_of_unrecognised_type)
          gaps.push(`${c.rows_of_unrecognised_type} rows of unrecognised type`);
        const t = calc.totals;
        return ok(
          {
            ...common(),
            basis_of_calculation: basis(tax_year, m),
            input_summary: summarizeInput(loaded),
            completeness: c,
            assumptions_applied: assumptions,
            review_flags: calc.reviewFlags,
            not_modeled: NOT_MODELED,
            estimated_totals: t,
            largest_disposals: largest,
          },
          [
            `Estimated net gain or loss, US rules, ${m}, tax year ${tax_year}: $${t.estimated_net_gain_loss} over ${t.disposals} disposals (short term gains $${t.short_term_gains}, losses $${t.short_term_losses}; long term gains $${t.long_term_gains}, losses $${t.long_term_losses}).`,
            c.is_complete
              ? "Completeness: no gaps were found in the data."
              : `Not complete: ${gaps.join("; ")}. The figures above may be overstated or understated.`,
            `Largest disposals: ${largest.map((d) => `${d.disposal_id} ${d.asset} ${d.date}`).join(", ") || "none"}.`,
          ],
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "dtax_explain_disposal",
    {
      title: "Explain one disposal",
      description:
        "Shows how one disposal from dtax_estimate_gains was calculated: its proceeds, the acquisition lots it used with their dates and cost, and how long each was held. Use a disposal_id from dtax_estimate_gains with the same files, year and method.",
      inputSchema: {
        paths,
        country,
        tax_year: taxYear,
        method,
        disposal_id: z
          .string()
          .regex(/^evt-\d{1,9}$/)
          .describe("A disposal_id such as evt-12, from dtax_estimate_gains."),
        format,
      },
      outputSchema: {
        notice: z.string(),
        presentation_guidance: z.string(),
        privacy_note: z.string(),
        learn_more: z.string(),
        basis_of_calculation: z.object(basisShape),
        disposal: z.object({
          disposal_id: z.string(),
          asset: z.string(),
          date: z.string().nullable(),
          proceeds_usd: z.number().nullable(),
          estimated_gain_loss_usd: z.number().nullable(),
          holding_period: z.string(),
          cost_basis_missing_for_units: z.number(),
          matched_lots: z.array(
            z.object({
              lot_id: z.string(),
              acquired_on: z.string().nullable(),
              units_used: z.number(),
              cost_basis_usd: z.number().nullable(),
              days_held: z.number().nullable(),
            }),
          ),
        }),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ paths: ps, tax_year, method: m, disposal_id, format: fmt }) => {
      try {
        const loaded = loadFiles(ps, roots(), fmt);
        const calc = calculate(loaded, { method: m, taxYear: tax_year });
        const r = calc.results.find((x) => x.event.id === disposal_id);
        if (!r) {
          throw new UserError(
            "That disposal_id is not in this tax year for these files. Use an id from dtax_estimate_gains with the same files, year and method.",
          );
        }
        const d = describeDisposal(r, calc.lotById);
        return ok(
          {
            ...common(),
            basis_of_calculation: basis(tax_year, m),
            disposal: d,
          },
          [
            `${d.disposal_id}: ${d.asset} on ${d.date}, proceeds $${d.proceeds_usd}, estimated gain or loss $${d.estimated_gain_loss_usd}, ${d.holding_period.replace("_", " ")}.`,
            `Lots used: ${d.matched_lots.length}. Units with no cost basis in the files: ${d.cost_basis_missing_for_units}.`,
          ],
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}
