/**
 * Export OpenAPI spec from running DTax API.
 *
 * Usage: tsx scripts/export-openapi.ts
 *
 * Starts the Fastify server briefly, fetches /docs/json, writes to docs/openapi.json,
 * then shuts down.
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

async function main() {
  const port = 3099; // Temp port to avoid conflicts
  const url = `http://127.0.0.1:${port}/docs/json`;

  // Dynamically import the app builder (we need the zod-openapi extend to run first)
  process.env.PORT = String(port);
  process.env.HOST = "127.0.0.1";
  // Prevent actual DB connection for spec export
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

  // We can't easily import the main() function since it auto-starts.
  // Instead, fetch from a running instance or build the app ourselves.
  // For simplicity, use fetch approach with a timeout.

  console.log(`Fetching OpenAPI spec from ${url}...`);
  console.log(
    "Make sure the API is running (pnpm dev) before executing this script.",
  );

  const devUrl = "http://127.0.0.1:3001/docs/json";

  try {
    const resp = await fetch(devUrl);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const spec = await resp.json();

    const outDir = resolve(__dirname, "../../../docs");
    mkdirSync(outDir, { recursive: true });

    const outPath = resolve(outDir, "openapi.json");
    writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");

    console.log(`OpenAPI spec written to ${outPath}`);
    console.log(`  Paths: ${Object.keys(spec.paths || {}).length}`);
    console.log(
      `  Schemas: ${Object.keys(spec.components?.schemas || {}).length}`,
    );
  } catch (err) {
    console.error("Failed to fetch OpenAPI spec:", (err as Error).message);
    console.error("Make sure the API server is running on port 3001.");
    process.exit(1);
  }
}

main();
