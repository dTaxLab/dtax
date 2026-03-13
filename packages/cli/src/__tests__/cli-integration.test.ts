import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const CLI = path.resolve(__dirname, "../../dist/index.js");
const FIXTURE_DIR = path.resolve(__dirname, "fixtures");
const COINBASE = path.join(FIXTURE_DIR, "coinbase-simple.csv");

function runCli(args: string): string {
  return execSync(`node ${CLI} ${args}`, {
    encoding: "utf-8",
    timeout: 15000,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("CLI Integration", () => {
  describe("Help & Version", () => {
    it("should show help text", () => {
      const output = runCli("help");
      expect(output).toContain("Usage");
    });

    it("should show version", () => {
      const output = runCli("version");
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("Calculate Command", () => {
    it("should calculate with FIFO (default)", () => {
      const output = runCli(`calculate ${COINBASE}`);
      expect(output).toContain("FIFO");
    });

    it("should calculate with LIFO method", () => {
      const output = runCli(`calculate ${COINBASE} --method LIFO`);
      expect(output).toContain("LIFO");
    });

    it("should calculate with HIFO method", () => {
      const output = runCli(`calculate ${COINBASE} --method HIFO`);
      expect(output).toContain("HIFO");
    });

    it("should filter by year", () => {
      const output = runCli(`calculate ${COINBASE} --year 2024`);
      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(0);
    });

    it("should output JSON with --json flag", () => {
      const output = runCli(`calculate ${COINBASE} --json`);
      // The CLI prints info lines before the JSON block; extract the JSON portion
      const jsonStart = output.indexOf("{");
      const jsonStr = output.slice(jsonStart);
      const parsed = JSON.parse(jsonStr);
      expect(parsed).toHaveProperty("method");
      expect(parsed).toHaveProperty("results");
      expect(parsed).toHaveProperty("netGainLoss");
    });

    it("should show comparison with --compare", () => {
      const output = runCli(`calculate ${COINBASE} --compare`);
      expect(output).toContain("FIFO");
      expect(output).toContain("LIFO");
      expect(output).toContain("HIFO");
    });
  });

  describe("Output to File", () => {
    it("should write Form 8949 CSV with --output", () => {
      const tmpFile = `/tmp/dtax-test-${Date.now()}.csv`;
      runCli(`calculate ${COINBASE} --output ${tmpFile}`);
      expect(fs.existsSync(tmpFile)).toBe(true);
      const csv = fs.readFileSync(tmpFile, "utf-8");
      expect(csv.length).toBeGreaterThan(0);
      fs.unlinkSync(tmpFile);
    });
  });

  describe("Advanced Features", () => {
    it("should handle --include-wash-sales without error", () => {
      const output = runCli(`calculate ${COINBASE} --include-wash-sales`);
      expect(output).toBeDefined();
    });

    it("should show Schedule D with --schedule-d", () => {
      const output = runCli(`calculate ${COINBASE} --schedule-d`);
      expect(output).toContain("Schedule D");
    });
  });

  describe("Error Handling", () => {
    it("should error on non-existent file", () => {
      expect(() => {
        runCli("calculate nonexistent.csv");
      }).toThrow();
    });
  });

  describe("Multiple Files", () => {
    it("should merge multiple CSV files", () => {
      const binance = path.join(FIXTURE_DIR, "binance-trades.csv");
      const output = runCli(`calculate ${COINBASE} ${binance}`);
      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(0);
    });
  });
});
