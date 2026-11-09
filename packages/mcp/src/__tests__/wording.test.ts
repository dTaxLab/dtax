/**
 * What the server and its package may say about itself.
 *
 * Rules: the three kinds of claim dTax's content audit forbids (LC-10 a claim of
 * professional advice, LC-11 approval by a tax authority, LC-12 a guarantee of
 * correctness) and the further limits from the compliance review: no accuracy or filing-readiness claims, no
 * tax owed or form lines, no advice to the user, no claim that data never leaves
 * the computer.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as constants from "../constants";
import { connect, workspace } from "./helpers";

const FORBIDDEN: [string, RegExp][] = [
  [
    "LC-10 professional advice",
    /professional\s+(?:tax\s+)?(?:advice|guidance|consultation|counsel)/i,
  ],
  [
    "LC-11 approval claim",
    /IRS[\s-]+(?:approved|endorsed|certified|authorized|sanctioned)/i,
  ],
  [
    "LC-11 authority approved",
    /(?:tax\s+authority|government)[\s-]+(?:approved|endorsed|certified|authorized|sanctioned)/i,
  ],
  [
    "LC-12 accuracy guarantee",
    /guaranteed\s+(?:accurate|correct)|100%\s+accurate|error[\s-]free\s+guarantee/i,
  ],
  ["accuracy claim", /\baccurate(?:ly)?\b/i],
  ["filing readiness", /audit[\s-]ready|tax[\s-]ready|ready\s+to\s+file/i],
  ["compliance claim", /compliant\s+with|complies\s+with/i],
  ["advice to the user", /\byou\s+(?:should|must)\b/i],
  ["amount of tax", /\btax\s+(?:owed|due)\b|amount\s+to\s+(?:report|pay)/i],
  ["data never leaves", /never\s+leaves?\s+your\s+computer|never\s+uploaded/i],
  [
    "a title that claims a licence",
    /\b(?:CPA|accountant|tax\s+agent|adviser|advisor)\b/i,
  ],
];

const scan = (label: string, text: string) =>
  FORBIDDEN.filter(([, re]) => re.test(text)).map(
    ([name]) => `${label}: ${name}`,
  );

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

describe("the rules themselves", () => {
  it("each one catches what it is for (positive control)", () => {
    // built from parts, so that the forbidden phrases are not written out in the source
    const phrase = (...w: string[]) => w.join(" ");
    expect(
      scan("t", `This is ${phrase("professional", "tax", "advice")}.`),
    ).toHaveLength(1);
    expect(
      scan("t", `Results are ${["IRS", "approved"].join("-")}.`),
    ).toHaveLength(1);
    expect(
      scan("t", `${phrase("Guaranteed", "accurate")} calculations`),
    ).toHaveLength(2);
    expect(scan("t", "You should report this gain.")).toHaveLength(1);
    expect(scan("t", "Your data never leaves your computer.")).toHaveLength(1);
    expect(scan("t", "Tax owed: $1,000")).toHaveLength(1);
  });

  it("and the notice and instructions are not caught", () => {
    expect(scan("notice", constants.NOTICE)).toEqual([]);
    expect(scan("instructions", constants.INSTRUCTIONS)).toEqual([]);
  });
});

describe("everything the package says", () => {
  it("fixed texts", () => {
    const found: string[] = [];
    for (const [k, v] of Object.entries(constants)) {
      if (typeof v === "string") found.push(...scan(k, v));
      if (Array.isArray(v)) found.push(...scan(k, v.join("\n")));
    }
    expect(found).toEqual([]);
  });

  it("tool names, titles and descriptions", async () => {
    const w = workspace({});
    const c = await connect(w.dir);
    close = c.close;
    const { tools } = await c.client.listTools();
    const found = tools.flatMap((t) =>
      scan(
        t.name,
        [
          t.name,
          t.title ?? "",
          t.description ?? "",
          JSON.stringify(t.inputSchema),
        ].join(" "),
      ),
    );
    expect(found).toEqual([]);
  });

  it("every result carries the notice first, and the privacy note says what is true", async () => {
    const w = workspace({});
    const c = await connect(w.dir);
    close = c.close;
    const r = await c.call("dtax_supported_formats", {});
    expect(r.content[0].text.startsWith(constants.NOTICE)).toBe(true);
    expect(constants.PRIVACY_NOTE).toMatch(
      /AI assistant may send results to its provider/,
    );
  });

  it("README and package.json", () => {
    const root = join(__dirname, "..", "..");
    const found = [
      ...scan("README", readFileSync(join(root, "README.md"), "utf-8")),
      ...scan(
        "package.json",
        readFileSync(join(root, "package.json"), "utf-8"),
      ),
    ];
    expect(found).toEqual([]);
  });
});
