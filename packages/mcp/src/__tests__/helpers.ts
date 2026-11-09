import { mkdtempSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server";

export const HEADER =
  "Type,Timestamp,Received Asset,Received Amount,Received Value USD,Sent Asset,Sent Amount,Sent Value USD";

/** A folder the server is allowed to read, with csv files written into it. */
export function workspace(files: Record<string, string>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "dtax-mcp-")));
  const paths: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
    paths[name] = p;
  }
  return { dir, paths };
}

export async function connect(allowedDir: string) {
  const server = createServer({ DTAX_MCP_ALLOWED_DIRS: allowedDir });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  const call = (name: string, args: Record<string, unknown>) =>
    client.callTool({ name, arguments: args }) as Promise<{
      isError?: boolean;
      content: { type: string; text: string }[];
      structuredContent?: Record<string, any>;
    }>;
  return { client, call, close: () => client.close() };
}

/** FIFO and HIFO give different answers on this file, so the method is really used. */
export const TWO_LOTS = [
  HEADER,
  "BUY,2023-01-01T00:00:00Z,BTC,1,10000,,,",
  "BUY,2023-06-01T00:00:00Z,BTC,1,30000,,,",
  "SELL,2024-03-01T00:00:00Z,,,,BTC,1,20000",
  "SELL,2025-03-01T00:00:00Z,,,,BTC,1,50000",
  "",
].join("\n");
