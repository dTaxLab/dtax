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

    it("should merge multiple files with JSON output", () => {
      const binance = path.join(FIXTURE_DIR, "binance-trades.csv");
      const output = runCli(`calculate ${COINBASE} ${binance} --json`);
      const jsonStart = output.indexOf("{");
      const parsed = JSON.parse(output.slice(jsonStart));
      expect(parsed.totalDispositions).toBe(2);
      expect(parsed.results).toHaveLength(2);
    });

    it("should merge multiple files with compare", () => {
      const binance = path.join(FIXTURE_DIR, "binance-trades.csv");
      const output = runCli(`calculate ${COINBASE} ${binance} --compare`);
      expect(output).toContain("Method Comparison");
      expect(output).toContain("FIFO");
      expect(output).toContain("LIFO");
      expect(output).toContain("HIFO");
    });
  });

  describe("Specific ID Method", () => {
    it("should reject SPECIFIC_ID with a clear error", () => {
      expect(() => {
        runCli(`calculate ${COINBASE} --method SPECIFIC_ID`);
      }).toThrow();
    });
  });

  describe("International Methods", () => {
    it("should reject GERMANY_FIFO with a clear error", () => {
      expect(() => {
        runCli(`calculate ${COINBASE} --method GERMANY_FIFO`);
      }).toThrow();
    });

    it("should reject PMPA with a clear error", () => {
      expect(() => {
        runCli(`calculate ${COINBASE} --method PMPA`);
      }).toThrow();
    });

    it("should reject TOTAL_AVERAGE with a clear error", () => {
      expect(() => {
        runCli(`calculate ${COINBASE} --method TOTAL_AVERAGE`);
      }).toThrow();
    });
  });

  describe("Currency Conversion", () => {
    it("should display EUR currency symbol", () => {
      const output = runCli(`calculate ${COINBASE} --currency EUR --rate 0.92`);
      expect(output).toMatch(/€/);
      // Rate applied: values should differ from USD default
      expect(output).not.toContain("$");
    });

    it("should display JPY currency symbol", () => {
      const output = runCli(`calculate ${COINBASE} --currency JPY --rate 150`);
      expect(output).toMatch(/¥/);
      expect(output).not.toContain("$");
    });
  });

  describe("JSON Output Validation", () => {
    it("should include method field in JSON output", () => {
      const output = runCli(`calculate ${COINBASE} --json`);
      const jsonStart = output.indexOf("{");
      const parsed = JSON.parse(output.slice(jsonStart));
      expect(parsed.method).toBe("FIFO");
    });

    it("should include results array in JSON output", () => {
      const output = runCli(`calculate ${COINBASE} --json`);
      const jsonStart = output.indexOf("{");
      const parsed = JSON.parse(output.slice(jsonStart));
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results.length).toBeGreaterThan(0);
    });

    it("should include numeric netGainLoss in JSON output", () => {
      const output = runCli(`calculate ${COINBASE} --json`);
      const jsonStart = output.indexOf("{");
      const parsed = JSON.parse(output.slice(jsonStart));
      expect(typeof parsed.netGainLoss).toBe("number");
    });
  });

  describe("Compare Output Validation", () => {
    it("should contain all three methods in comparison", () => {
      const output = runCli(`calculate ${COINBASE} --compare`);
      expect(output).toContain("FIFO");
      expect(output).toContain("LIFO");
      expect(output).toContain("HIFO");
      expect(output).toContain("Recommended");
    });

    it("should show gain/loss values for each method", () => {
      const output = runCli(`calculate ${COINBASE} --compare`);
      // Each method line should have a dollar amount
      const methodLines = output
        .split("\n")
        .filter((l: string) => /^\s+(FIFO|LIFO|HIFO)/.test(l));
      expect(methodLines.length).toBeGreaterThanOrEqual(3);
      for (const line of methodLines) {
        expect(line).toMatch(/\$/);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should error on empty CSV file", () => {
      const emptyFile = `/tmp/dtax-empty-${Date.now()}.csv`;
      fs.writeFileSync(emptyFile, "");
      try {
        expect(() => {
          runCli(`calculate ${emptyFile}`);
        }).toThrow();
      } finally {
        fs.unlinkSync(emptyFile);
      }
    });

    it("should error on invalid method name", () => {
      expect(() => {
        runCli(`calculate ${COINBASE} --method INVALID`);
      }).toThrow();
    });

    it("should error when no file argument is provided", () => {
      expect(() => {
        runCli("calculate");
      }).toThrow();
    });
  });

  describe("Output Format Options", () => {
    it("should write CSV output with year filter combined", () => {
      const tmpFile = `/tmp/dtax-combo-${Date.now()}.csv`;
      try {
        const output = runCli(
          `calculate ${COINBASE} --output ${tmpFile} --year 2024`,
        );
        expect(output).toContain("2024");
        expect(fs.existsSync(tmpFile)).toBe(true);
        const csv = fs.readFileSync(tmpFile, "utf-8");
        expect(csv).toContain("Box");
        expect(csv).toContain("BTC");
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });
  });
});
