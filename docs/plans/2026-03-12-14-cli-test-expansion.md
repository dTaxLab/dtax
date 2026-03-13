# CLI 测试覆盖扩展 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 CLI 测试从 1 个文件/41 用例扩展到全面覆盖所有 CLI 功能，包括 `calculate`、`--compare`、`--wash-sale`、`--schedule-d`、`--output`、`--json`、`--currency` 等。

**Architecture:** 使用 Vitest + 子进程执行 CLI 命令进行集成测试。同时为 lib.ts 的纯函数添加更多单元测试。使用固定测试 CSV 数据确保确定性结果。

**Tech Stack:** Vitest, child_process, 测试 CSV fixtures

---

### Task 1: 创建测试 CSV Fixtures

**Files:**

- Create: `packages/cli/src/__tests__/fixtures/coinbase-simple.csv`
- Create: `packages/cli/src/__tests__/fixtures/binance-trades.csv`
- Create: `packages/cli/src/__tests__/fixtures/multi-year.csv`

**Step 1: 创建确定性测试数据**

```csv
# coinbase-simple.csv — 3 笔简单交易
Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes
2024-01-15T10:00:00Z,Buy,BTC,1.0,USD,42000.00,42000.00,42050.00,50.00,
2024-03-20T14:00:00Z,Buy,BTC,0.5,USD,65000.00,32500.00,32525.00,25.00,
2024-06-15T09:00:00Z,Sell,BTC,0.8,USD,70000.00,56000.00,55960.00,40.00,
```

**Step 2: Commit**

```bash
git add packages/cli/src/__tests__/fixtures/
git commit -m "test(cli): add CSV test fixtures for CLI integration tests"
```

---

### Task 2: CLI 集成测试 — 基础计算

**Files:**

- Create: `packages/cli/src/__tests__/cli-integration.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

const CLI = path.resolve(__dirname, "../../dist/index.js");
const FIXTURE = path.resolve(__dirname, "fixtures/coinbase-simple.csv");

function runCli(args: string): string {
  return execSync(`node ${CLI} calculate ${FIXTURE} ${args}`, {
    encoding: "utf-8",
    timeout: 10000,
  });
}

describe("CLI Integration", () => {
  describe("Basic Calculate", () => {
    it("should calculate FIFO by default", () => {
      const output = runCli("");
      expect(output).toContain("FIFO");
      expect(output).toContain("Short-term");
      expect(output).toContain("Long-term");
    });

    it("should calculate with LIFO method", () => {
      const output = runCli("--method LIFO");
      expect(output).toContain("LIFO");
    });

    it("should calculate with HIFO method", () => {
      const output = runCli("--method HIFO");
      expect(output).toContain("HIFO");
    });

    it("should filter by year", () => {
      const output = runCli("--year 2024");
      expect(output).toContain("2024");
    });
  });

  describe("Output Formats", () => {
    it("should output JSON with --json flag", () => {
      const output = runCli("--json");
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("summary");
      expect(parsed).toHaveProperty("transactions");
    });

    it("should generate Form 8949 CSV with --output", () => {
      const tmpFile = "/tmp/test-form8949.csv";
      runCli(`--output ${tmpFile}`);
      const csv = require("fs").readFileSync(tmpFile, "utf-8");
      expect(csv).toContain("Description");
      expect(csv).toContain("Date Acquired");
    });
  });

  describe("Advanced Features", () => {
    it("should show wash sales with --include-wash-sales", () => {
      const output = runCli("--include-wash-sales");
      // May or may not have wash sales, but should not error
      expect(output).toBeDefined();
    });

    it("should show Schedule D with --schedule-d", () => {
      const output = runCli("--schedule-d");
      expect(output).toContain("Schedule D");
    });

    it("should compare methods with --compare", () => {
      const output = runCli("--compare");
      expect(output).toContain("FIFO");
      expect(output).toContain("LIFO");
      expect(output).toContain("HIFO");
    });

    it("should support currency conversion with --currency", () => {
      const output = runCli("--currency EUR --rate 0.92");
      expect(output).toContain("EUR");
    });
  });

  describe("Multi-file Support", () => {
    it("should merge multiple CSV files", () => {
      const fixture2 = path.resolve(__dirname, "fixtures/binance-trades.csv");
      const output = execSync(`node ${CLI} calculate ${FIXTURE} ${fixture2}`, {
        encoding: "utf-8",
        timeout: 10000,
      });
      expect(output).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should show error for non-existent file", () => {
      try {
        execSync(`node ${CLI} calculate nonexistent.csv`, {
          encoding: "utf-8",
        });
        expect.unreachable("Should have thrown");
      } catch (e: any) {
        expect(e.status).not.toBe(0);
      }
    });

    it("should show help with --help", () => {
      const output = execSync(`node ${CLI} help`, { encoding: "utf-8" });
      expect(output).toContain("Usage");
    });

    it("should show version with --version", () => {
      const output = execSync(`node ${CLI} version`, { encoding: "utf-8" });
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });
  });
});
```

**Step 2: 确保 CLI 已构建**

Run: `cd packages/cli && pnpm build`

**Step 3: Run tests**

Run: `cd packages/cli && npx vitest run src/__tests__/cli-integration.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/__tests__/cli-integration.test.ts
git commit -m "test(cli): add comprehensive CLI integration tests"
```

---

### Task 3: lib.ts 纯函数单元测试扩展

**Files:**

- Modify: `packages/cli/src/__tests__/lib.test.ts`

**Step 1: 添加更多 parseArgs 边界测试**

```typescript
describe("parseArgs extended", () => {
  it("should parse all flags correctly", () => {
    const args = parseArgs([
      "calculate",
      "file.csv",
      "--method",
      "HIFO",
      "--year",
      "2024",
      "--output",
      "result.csv",
      "--json",
      "--include-wash-sales",
      "--schedule-d",
      "--compare",
      "--currency",
      "EUR",
      "--rate",
      "0.92",
    ]);
    expect(args.method).toBe("HIFO");
    expect(args.year).toBe(2024);
    expect(args.output).toBe("result.csv");
    expect(args.json).toBe(true);
    expect(args.includeWashSales).toBe(true);
    expect(args.scheduleD).toBe(true);
    expect(args.compare).toBe(true);
    expect(args.currency).toBe("EUR");
    expect(args.rate).toBe(0.92);
  });

  it("should handle missing required file argument", () => {
    expect(() => parseArgs(["calculate"])).toThrow();
  });
});

describe("formatComparisonTable", () => {
  it("should format 3-method comparison correctly", () => {
    const table = formatComparisonTable([
      { method: "FIFO", netGainLoss: 1000 },
      { method: "LIFO", netGainLoss: 800 },
      { method: "HIFO", netGainLoss: 600 },
    ]);
    expect(table).toContain("FIFO");
    expect(table).toContain("LIFO");
    expect(table).toContain("HIFO");
  });
});
```

**Step 2: Commit**

```bash
git add packages/cli/src/__tests__/lib.test.ts
git commit -m "test(cli): expand lib.ts unit tests for parseArgs and formatting"
```

---

### Task 4: 五步法审计

**Step 1: 类型安全** — `cd packages/cli && npx tsc --noEmit`

**Step 2: 测试回归** — `pnpm test` (所有包)

**Step 3: 安全** — 测试文件不含真实数据

**Step 4: i18n** — N/A (CLI 纯英文)

**Step 5: 构建** — `pnpm build`

**目标覆盖:**

- 1 → 3 测试文件
- 41 → 70+ 测试用例
- 覆盖: 所有 CLI flags、输出格式、多文件、错误处理
