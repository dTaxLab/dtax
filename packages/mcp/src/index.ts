/**
 * @dtax/mcp: starts the server on standard input and output.
 *
 * Nothing is sent anywhere: no network calls, no telemetry, no crash reports.
 *
 * @license AGPL-3.0
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

main().catch(() => {
  // no details: an error here could quote a file
  console.error("dtax-mcp could not start.");
  process.exit(1);
});
