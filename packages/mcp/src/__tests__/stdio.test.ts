/**
 * The built program, started as an assistant would start it: a real process on
 * standard input and output, a real file, a real tool call. Runs when the
 * package has been built (pnpm build).
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { workspace, TWO_LOTS } from "./helpers";

const dist = join(__dirname, "..", "..", "dist", "index.js");

describe.skipIf(!existsSync(dist))("the built server over stdio", () => {
  it("starts, lists its tools, and estimates gains from a real file", async () => {
    const w = workspace({ "a.csv": TWO_LOTS });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [dist],
      env: { ...process.env, DTAX_MCP_ALLOWED_DIRS: w.dir } as Record<
        string,
        string
      >,
    });
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(4);
      const r = (await client.callTool({
        name: "dtax_estimate_gains",
        arguments: {
          paths: [w.paths["a.csv"]],
          country: "US",
          tax_year: 2025,
          method: "FIFO",
        },
      })) as { structuredContent?: any; content: { text: string }[] };
      expect(r.structuredContent.estimated_totals.estimated_net_gain_loss).toBe(
        20000,
      );
      expect(r.content[0].text.startsWith("Informational estimate only")).toBe(
        true,
      );
    } finally {
      await client.close();
    }
  }, 30000);
});
