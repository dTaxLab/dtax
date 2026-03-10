/**
 * API Route Integration Tests
 *
 * Tests route handlers using Fastify inject() with mocked Prisma.
 * Covers: transactions CRUD, tax calculation, error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp, mockTransaction } from "./test-helpers";

// ─── Mock Prisma ────────────────────────────────

const mockPrisma = {
  transaction: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
  },
  taxReport: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  dataSource: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
};

vi.mock("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Mock CCXT service for connections route
vi.mock("../services/ccxt", () => ({
  encryptKey: (key: string) => `encrypted_${key}`,
  CcxtService: {
    testConnection: vi.fn().mockResolvedValue(true),
  },
}));

// ─── Tests ──────────────────────────────────────

describe("Health Routes", () => {
  it("GET /api/health returns ok", async () => {
    const app = buildApp();
    const { healthRoutes } = await import("../routes/health");
    await app.register(healthRoutes, { prefix: "/api" });

    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();

    await app.close();
  });

  it("GET /api/health/deep checks database", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ 1: 1 }]);

    const app = buildApp();
    const { healthRoutes } = await import("../routes/health");
    await app.register(healthRoutes, { prefix: "/api" });

    const res = await app.inject({ method: "GET", url: "/api/health/deep" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.services.database).toBe("connected");

    await app.close();
  });

  it("GET /api/health/deep returns degraded when DB fails", async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("Connection refused"));

    const app = buildApp();
    const { healthRoutes } = await import("../routes/health");
    await app.register(healthRoutes, { prefix: "/api" });

    const res = await app.inject({ method: "GET", url: "/api/health/deep" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("disconnected");

    await app.close();
  });
});

describe("Transaction Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const { transactionRoutes } = await import("../routes/transactions");
    await app.register(transactionRoutes, { prefix: "/api/v1" });
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── POST /transactions ─────────────────────

  it("POST /transactions creates a transaction", async () => {
    const created = mockTransaction();
    mockPrisma.transaction.create.mockResolvedValueOnce(created);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions",
      payload: {
        type: "BUY",
        timestamp: "2025-03-01T10:00:00Z",
        receivedAsset: "BTC",
        receivedAmount: 1.5,
        receivedValueUsd: 45000,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe("tx-001");
    expect(body.data.receivedAsset).toBe("BTC");
  });

  it("POST /transactions rejects invalid type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions",
      payload: {
        type: "INVALID_TYPE",
        timestamp: "2025-03-01T10:00:00Z",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /transactions rejects missing timestamp", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions",
      payload: { type: "BUY" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
  });

  // ─── GET /transactions ──────────────────────

  it("GET /transactions returns paginated list", async () => {
    const txs = [mockTransaction(), mockTransaction({ id: "tx-002" })];
    mockPrisma.transaction.findMany.mockResolvedValueOnce(txs);
    mockPrisma.transaction.count.mockResolvedValueOnce(2);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/transactions?page=1&limit=20",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.meta.total).toBe(2);
    expect(body.meta.page).toBe(1);
  });

  it("GET /transactions validates page must be positive", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/transactions?page=0",
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ─── GET /transactions/:id ──────────────────

  it("GET /transactions/:id returns transaction", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValueOnce(mockTransaction());

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/transactions/tx-001",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe("tx-001");
  });

  it("GET /transactions/:id returns 404 for missing", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/transactions/nonexistent",
    });

    expect(res.statusCode).toBe(404);
  });

  // ─── PUT /transactions/:id ──────────────────

  it("PUT /transactions/:id updates transaction", async () => {
    const existing = mockTransaction();
    const updated = { ...existing, notes: "Updated" };
    mockPrisma.transaction.findFirst.mockResolvedValueOnce(existing);
    mockPrisma.transaction.update.mockResolvedValueOnce(updated);

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/transactions/tx-001",
      payload: { notes: "Updated" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.notes).toBe("Updated");
  });

  it("PUT /transactions/:id returns 404 for missing", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/transactions/nonexistent",
      payload: { notes: "test" },
    });

    expect(res.statusCode).toBe(404);
  });

  // ─── DELETE /transactions/:id ────────────────

  it("DELETE /transactions/:id deletes transaction", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValueOnce(mockTransaction());
    mockPrisma.transaction.delete.mockResolvedValueOnce({});

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/transactions/tx-001",
    });

    expect(res.statusCode).toBe(204);
  });

  it("DELETE /transactions/:id returns 404 for missing", async () => {
    mockPrisma.transaction.findFirst.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/transactions/nonexistent",
    });

    expect(res.statusCode).toBe(404);
  });

  // ─── DELETE /transactions/bulk ───────────────

  it("DELETE /transactions/bulk deletes multiple transactions", async () => {
    mockPrisma.transaction.deleteMany.mockResolvedValueOnce({ count: 3 });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/transactions/bulk",
      payload: {
        ids: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
          "550e8400-e29b-41d4-a716-446655440003",
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.deleted).toBe(3);
  });

  it("DELETE /transactions/bulk rejects empty ids array", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/transactions/bulk",
      payload: { ids: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("DELETE /transactions/bulk rejects non-UUID ids", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/transactions/bulk",
      payload: { ids: ["not-a-uuid", "also-not-uuid"] },
    });

    expect(res.statusCode).toBe(400);
  });

  // ─── GET /transactions/export ────────────────

  it("GET /transactions/export returns CSV", async () => {
    const txs = [mockTransaction()];
    mockPrisma.transaction.findMany.mockResolvedValueOnce(txs);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/transactions/export",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("Date,Type");
    expect(res.body).toContain("BUY");
  });

  // ─── GET /transactions/export-json ─────────────

  it("GET /transactions/export-json returns full backup with tax reports", async () => {
    const txs = [mockTransaction()];
    const sources = [
      { id: "ds-1", name: "Coinbase Import", type: "CSV_IMPORT" },
    ];
    const reports = [
      {
        id: "rpt-1",
        taxYear: 2025,
        method: "FIFO",
        shortTermGains: 1000,
        longTermGains: 2000,
      },
    ];
    const user = {
      email: "test@example.com",
      name: "Test User",
      createdAt: new Date(),
    };

    mockPrisma.transaction.findMany.mockResolvedValueOnce(txs);
    mockPrisma.dataSource.findMany.mockResolvedValueOnce(sources);
    mockPrisma.taxReport.findMany.mockResolvedValueOnce(reports);
    mockPrisma.user.findUnique.mockResolvedValueOnce(user);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/transactions/export-json",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.headers["content-disposition"]).toContain("dtax-backup.json");

    const backup = JSON.parse(res.body);
    expect(backup.version).toBe("1.1");
    expect(backup.transactions).toHaveLength(1);
    expect(backup.dataSources).toHaveLength(1);
    expect(backup.taxReports).toHaveLength(1);
    expect(backup.taxReports[0].taxYear).toBe(2025);
    expect(backup.user.email).toBe("test@example.com");
    expect(backup.meta.transactionCount).toBe(1);
    expect(backup.meta.dataSourceCount).toBe(1);
    expect(backup.meta.taxReportCount).toBe(1);
  });
});

describe("Tax Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const { taxRoutes } = await import("../routes/tax");
    await app.register(taxRoutes, { prefix: "/api/v1" });
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /tax/calculate computes gains", async () => {
    // 1 BUY lot, 1 SELL event
    const buyTx = mockTransaction({
      id: "buy-1",
      type: "BUY",
      receivedAsset: "BTC",
      receivedAmount: 1,
      receivedValueUsd: 30000,
      timestamp: new Date("2024-01-15T00:00:00Z"),
    });
    const sellTx = mockTransaction({
      id: "sell-1",
      type: "SELL",
      sentAsset: "BTC",
      sentAmount: 1,
      sentValueUsd: 45000,
      feeValueUsd: 10,
      timestamp: new Date("2025-06-15T00:00:00Z"),
    });

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([buyTx]) // acquisitions (fetchTaxData)
      .mockResolvedValueOnce([sellTx]) // dispositions (fetchTaxData)
      .mockResolvedValueOnce([]); // income items (calculateIncome)

    mockPrisma.taxReport.upsert.mockResolvedValueOnce({
      id: "report-1",
      taxYear: 2025,
      method: "FIFO",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tax/calculate",
      payload: { taxYear: 2025, method: "FIFO" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.report.taxYear).toBe(2025);
    expect(body.data.report.method).toBe("FIFO");
    // $45000 - $30000 - $10 fee = $14990 long-term gain
    expect(body.data.report.netGainLoss).toBeCloseTo(14990, 0);
  });

  it("POST /tax/calculate rejects invalid method", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tax/calculate",
      payload: { taxYear: 2025, method: "INVALID" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /tax/calculate rejects year before 2009", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tax/calculate",
      payload: { taxYear: 2008, method: "FIFO" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("GET /tax/summary returns saved report", async () => {
    mockPrisma.taxReport.findUnique.mockResolvedValueOnce({
      taxYear: 2025,
      method: "FIFO",
      shortTermGains: 1000,
      shortTermLosses: 200,
      longTermGains: 5000,
      longTermLosses: 500,
      totalTransactions: 10,
      status: "COMPLETE",
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tax/summary?year=2025&method=FIFO",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.taxYear).toBe(2025);
    expect(body.data.netGainLoss).toBe(5300); // (1000-200) + (5000-500)
  });

  it("GET /tax/summary returns 404 when no report", async () => {
    mockPrisma.taxReport.findUnique.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tax/summary?year=2025&method=FIFO",
    });

    expect(res.statusCode).toBe(404);
  });

  // ─── GET /tax/form8949 ──────────────────────

  it("GET /tax/form8949 returns Form 8949 report as JSON", async () => {
    const buyTx = mockTransaction({
      id: "buy-8949",
      type: "BUY",
      receivedAsset: "BTC",
      receivedAmount: 1,
      receivedValueUsd: 30000,
      timestamp: new Date("2024-01-15T00:00:00Z"),
    });
    const sellTx = mockTransaction({
      id: "sell-8949",
      type: "SELL",
      sentAsset: "BTC",
      sentAmount: 1,
      sentValueUsd: 45000,
      feeValueUsd: 10,
      timestamp: new Date("2025-06-15T00:00:00Z"),
    });

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([buyTx])
      .mockResolvedValueOnce([sellTx]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tax/form8949?year=2025&method=FIFO",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.taxYear).toBe(2025);
    expect(body.data.lines).toBeInstanceOf(Array);
    expect(body.data.lines.length).toBeGreaterThan(0);
    expect(body.data.lines[0].description).toContain("BTC");
  });

  it("GET /tax/form8949 returns CSV format", async () => {
    const buyTx = mockTransaction({
      id: "buy-csv",
      type: "BUY",
      receivedAsset: "ETH",
      receivedAmount: 10,
      receivedValueUsd: 28000,
      timestamp: new Date("2024-02-01T00:00:00Z"),
    });
    const sellTx = mockTransaction({
      id: "sell-csv",
      type: "SELL",
      sentAsset: "ETH",
      sentAmount: 10,
      sentValueUsd: 35000,
      timestamp: new Date("2025-08-01T00:00:00Z"),
    });

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([buyTx])
      .mockResolvedValueOnce([sellTx]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tax/form8949?year=2025&method=FIFO&format=csv",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("form8949");
    expect(res.body).toContain("Description");
  });

  // ─── GET /tax/schedule-d ────────────────────

  it("GET /tax/schedule-d returns Schedule D summary", async () => {
    const buyTx = mockTransaction({
      id: "buy-sd",
      type: "BUY",
      receivedAsset: "BTC",
      receivedAmount: 1,
      receivedValueUsd: 30000,
      timestamp: new Date("2024-01-15T00:00:00Z"),
    });
    const sellTx = mockTransaction({
      id: "sell-sd",
      type: "SELL",
      sentAsset: "BTC",
      sentAmount: 1,
      sentValueUsd: 45000,
      timestamp: new Date("2025-06-15T00:00:00Z"),
    });

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([buyTx])
      .mockResolvedValueOnce([sellTx]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tax/schedule-d?year=2025&method=FIFO",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.netLongTerm).toBeDefined();
    expect(body.data.netShortTerm).toBeDefined();
    expect(body.data.combinedNetGainLoss).toBeDefined();
  });
});

describe("Transfer Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const { transferRoutes } = await import("../routes/transfers");
    await app.register(transferRoutes, { prefix: "/api/v1" });
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /transfers/matches returns empty when no transfers", async () => {
    mockPrisma.transaction.findMany.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/transfers/matches",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.matches).toHaveLength(0);
    expect(body.data.unmatchedOut).toBe(0);
    expect(body.data.unmatchedIn).toBe(0);
  });

  it("GET /transfers/matches detects matching pairs", async () => {
    const outTx = mockTransaction({
      id: "out-1",
      type: "TRANSFER_OUT",
      sentAsset: "ETH",
      sentAmount: 10,
      receivedAsset: null,
      sourceId: "binance",
      timestamp: new Date("2025-03-01T10:00:00Z"),
      tags: [],
    });
    const inTx = mockTransaction({
      id: "in-1",
      type: "TRANSFER_IN",
      receivedAsset: "ETH",
      receivedAmount: 9.99,
      sentAsset: null,
      sourceId: "metamask",
      timestamp: new Date("2025-03-01T10:15:00Z"),
      tags: [],
    });

    mockPrisma.transaction.findMany.mockResolvedValueOnce([outTx, inTx]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/transfers/matches",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].outTx.id).toBe("out-1");
    expect(body.data.matches[0].inTx.id).toBe("in-1");
  });

  // ─── POST /transfers/confirm ──────────────────

  it("POST /transfers/confirm converts pair to INTERNAL_TRANSFER", async () => {
    const outTx = mockTransaction({
      id: "00000000-0000-0000-0000-000000000001",
      type: "TRANSFER_OUT",
      sentAsset: "BTC",
      sentAmount: 1,
    });
    const inTx = mockTransaction({
      id: "00000000-0000-0000-0000-000000000002",
      type: "TRANSFER_IN",
      receivedAsset: "BTC",
      receivedAmount: 0.999,
    });

    mockPrisma.transaction.findFirst
      .mockResolvedValueOnce(outTx)
      .mockResolvedValueOnce(inTx);
    mockPrisma.$transaction.mockResolvedValueOnce([{}, {}]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transfers/confirm",
      payload: {
        outTxId: "00000000-0000-0000-0000-000000000001",
        inTxId: "00000000-0000-0000-0000-000000000002",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe("confirmed");
    expect(body.data.outTxId).toBe("00000000-0000-0000-0000-000000000001");
    expect(body.data.inTxId).toBe("00000000-0000-0000-0000-000000000002");
  });

  it("POST /transfers/confirm returns 404 when tx not found", async () => {
    mockPrisma.transaction.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transfers/confirm",
      payload: {
        outTxId: "00000000-0000-0000-0000-000000000001",
        inTxId: "00000000-0000-0000-0000-000000000002",
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("not found");
  });

  // ─── POST /transfers/dismiss ──────────────────

  it("POST /transfers/dismiss marks pair as reviewed", async () => {
    const outTx = mockTransaction({
      id: "00000000-0000-0000-0000-000000000003",
      type: "TRANSFER_OUT",
      sentAsset: "ETH",
      sentAmount: 5,
    });
    const inTx = mockTransaction({
      id: "00000000-0000-0000-0000-000000000004",
      type: "TRANSFER_IN",
      receivedAsset: "ETH",
      receivedAmount: 4.99,
    });

    mockPrisma.transaction.findFirst
      .mockResolvedValueOnce(outTx)
      .mockResolvedValueOnce(inTx);
    mockPrisma.$transaction.mockResolvedValueOnce([{}, {}]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transfers/dismiss",
      payload: {
        outTxId: "00000000-0000-0000-0000-000000000003",
        inTxId: "00000000-0000-0000-0000-000000000004",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe("dismissed");
  });

  it("POST /transfers/dismiss returns 404 when tx not found", async () => {
    mockPrisma.transaction.findFirst
      .mockResolvedValueOnce(
        mockTransaction({ id: "00000000-0000-0000-0000-000000000005" }),
      )
      .mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transfers/dismiss",
      payload: {
        outTxId: "00000000-0000-0000-0000-000000000005",
        inTxId: "00000000-0000-0000-0000-000000000006",
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("not found");
  });
});

describe("Portfolio Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const { portfolioRoutes } = await import("../routes/portfolio");
    await app.register(portfolioRoutes, { prefix: "/api/v1" });
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /portfolio/holdings returns holdings", async () => {
    const buyTx = mockTransaction({
      id: "buy-1",
      type: "BUY",
      receivedAsset: "BTC",
      receivedAmount: 2,
      receivedValueUsd: 60000,
      timestamp: new Date("2024-06-01T00:00:00Z"),
    });

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([buyTx]) // acquisitions
      .mockResolvedValueOnce([]); // dispositions

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/portfolio/holdings",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.positions).toHaveLength(1);
    expect(body.data.positions[0].asset).toBe("BTC");
    expect(body.data.positions[0].totalAmount).toBe(2);
  });

  it("GET /portfolio/holdings rejects invalid prices JSON", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/portfolio/holdings?prices=not-json",
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("Invalid prices format");
  });
});

describe("Price Backfill Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const { priceRoutes } = await import("../routes/prices");
    await app.register(priceRoutes, { prefix: "/api/v1" });
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /prices/backfill returns 0 when no transactions need backfill", async () => {
    mockPrisma.transaction.findMany.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prices/backfill",
      payload: { limit: 10 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.updated).toBe(0);
    expect(body.data.total).toBe(0);
    expect(body.data.message).toContain("No transactions");
  });

  it("POST /prices/backfill updates transactions with missing prices", async () => {
    // Return transactions missing USD values
    mockPrisma.transaction.findMany.mockResolvedValueOnce([
      {
        id: "tx-backfill-001",
        receivedAsset: "BTC",
        receivedAmount: "0.5",
        receivedValueUsd: null,
        sentAsset: null,
        sentAmount: null,
        sentValueUsd: null,
        timestamp: new Date("2024-01-15T00:00:00Z"),
      },
      {
        id: "tx-backfill-002",
        receivedAsset: null,
        receivedAmount: null,
        receivedValueUsd: null,
        sentAsset: "ETH",
        sentAmount: "10",
        sentValueUsd: null,
        timestamp: new Date("2024-02-20T00:00:00Z"),
      },
    ]);
    mockPrisma.transaction.update.mockResolvedValue({});

    // Mock historical price fetches
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          market_data: { current_price: { usd: 43000 } },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          market_data: { current_price: { usd: 2800 } },
        }),
      } as Response);

    // Clear price cache
    const { clearPriceCache } = await import("../lib/prices");
    if (typeof clearPriceCache === "function") clearPriceCache();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prices/backfill",
      payload: { limit: 10 },
    });

    globalThis.fetch = originalFetch;

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.updated).toBe(2);
    expect(body.data.total).toBe(2);
    expect(body.data.skipped).toBe(0);
  });

  it("POST /prices/backfill dry run does not update DB", async () => {
    mockPrisma.transaction.findMany.mockResolvedValueOnce([
      {
        id: "tx-dry-001",
        receivedAsset: "SOL",
        receivedAmount: "100",
        receivedValueUsd: null,
        sentAsset: null,
        sentAmount: null,
        sentValueUsd: null,
        timestamp: new Date("2024-03-01T00:00:00Z"),
      },
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        market_data: { current_price: { usd: 150 } },
      }),
    } as Response);

    const { clearPriceCache } = await import("../lib/prices");
    if (typeof clearPriceCache === "function") clearPriceCache();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prices/backfill",
      payload: { limit: 10, dryRun: true },
    });

    globalThis.fetch = originalFetch;

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.updated).toBe(1);
    expect(body.data.message).toContain("Dry run");
    // DB update should NOT have been called
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
  });

  it("GET /prices/history validates date format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prices/history?asset=BTC&date=invalid",
    });

    expect(res.statusCode).toBe(400);
  });

  it("GET /prices/supported returns ticker list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prices/supported",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.tickers).toContain("BTC");
    expect(body.data.tickers).toContain("SOL");
  });

  it("GET /prices/exchange-rates returns rates with USD base", async () => {
    // Mock global fetch for CoinGecko API
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bitcoin: {
          usd: 60000,
          eur: 55200,
          gbp: 47400,
          jpy: 9000000,
          cny: 432000,
          cad: 81600,
          aud: 91800,
          chf: 52800,
          krw: 82200000,
          twd: 1920000,
        },
      }),
    } as Response);

    // Clear any cached rates
    const { clearExchangeRateCache } = await import("../lib/prices");
    clearExchangeRateCache();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prices/exchange-rates",
    });

    globalThis.fetch = originalFetch;

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.baseCurrency).toBe("USD");
    expect(body.data.rates.USD).toBe(1);
    expect(body.data.rates.EUR).toBeCloseTo(0.92, 1);
    expect(body.data.rates.JPY).toBeCloseTo(150, 0);
    expect(Object.keys(body.data.rates).length).toBeGreaterThanOrEqual(9);
  });

  it("GET /prices/exchange-rates handles API failure gracefully", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);

    const { clearExchangeRateCache } = await import("../lib/prices");
    clearExchangeRateCache();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prices/exchange-rates",
    });

    globalThis.fetch = originalFetch;

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("EXCHANGE_RATE_ERROR");
  });
});

describe("Connection Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const { connectionRoutes } = await import("../routes/connections");
    await app.register(connectionRoutes, { prefix: "/api/v1" });
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── POST /connections ─────────────────────

  it("POST /connections creates connection with valid keys", async () => {
    const { CcxtService } = await import("../services/ccxt");
    (
      CcxtService.testConnection as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(true);

    mockPrisma.dataSource.create.mockResolvedValueOnce({
      id: "ds-001",
      name: "BINANCE",
      status: "ACTIVE",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/connections",
      payload: {
        exchangeId: "binance",
        apiKey: "test-api-key-12345",
        apiSecret: "test-api-secret-12345",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe("ds-001");
    expect(body.data.name).toBe("BINANCE");
    expect(body.data.status).toBe("ACTIVE");
  });

  it("POST /connections returns 400 for invalid API keys", async () => {
    const { CcxtService } = await import("../services/ccxt");
    (
      CcxtService.testConnection as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/connections",
      payload: {
        exchangeId: "binance",
        apiKey: "bad-key-12345",
        apiSecret: "bad-secret-12345",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("INVALID_API_KEYS");
  });

  it("POST /connections rejects missing exchangeId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/connections",
      payload: {
        apiKey: "test-api-key-12345",
        apiSecret: "test-api-secret-12345",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /connections rejects short apiKey", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/connections",
      payload: {
        exchangeId: "binance",
        apiKey: "ab",
        apiSecret: "test-api-secret-12345",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ─── GET /connections ──────────────────────

  it("GET /connections returns user connections", async () => {
    mockPrisma.dataSource.findMany.mockResolvedValueOnce([
      {
        id: "ds-001",
        name: "BINANCE",
        status: "ACTIVE",
        lastSyncAt: null,
        createdAt: new Date(),
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/connections",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("BINANCE");
  });

  // ─── GET /data-sources ────────────────────

  it("GET /data-sources returns sources with transaction counts", async () => {
    mockPrisma.dataSource.findMany.mockResolvedValueOnce([
      {
        id: "ds-001",
        name: "BINANCE",
        type: "EXCHANGE_API",
        status: "ACTIVE",
        lastSyncAt: null,
        createdAt: new Date(),
      },
      {
        id: "ds-002",
        name: "COINBASE Import",
        type: "CSV_IMPORT",
        status: "ACTIVE",
        lastSyncAt: null,
        createdAt: new Date(),
      },
    ]);
    mockPrisma.transaction.groupBy.mockResolvedValueOnce([
      { sourceId: "ds-002", _count: 15 },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/data-sources",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].transactionCount).toBeDefined();
    // ds-002 has 15 transactions
    const csvSource = body.data.find((s: { id: string }) => s.id === "ds-002");
    expect(csvSource.transactionCount).toBe(15);
  });

  // ─── PUT /data-sources/:id ────────────────

  it("PUT /data-sources/:id renames source", async () => {
    mockPrisma.dataSource.findFirst.mockResolvedValueOnce({
      id: "ds-001",
      userId: "00000000-0000-0000-0000-000000000001",
    });
    mockPrisma.dataSource.update.mockResolvedValueOnce({
      id: "ds-001",
      name: "My Binance",
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/data-sources/ds-001",
      payload: { name: "My Binance" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe("My Binance");
  });

  it("PUT /data-sources/:id returns 404 for missing source", async () => {
    mockPrisma.dataSource.findFirst.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/data-sources/nonexistent",
      payload: { name: "Test" },
    });

    expect(res.statusCode).toBe(404);
  });

  // ─── DELETE /data-sources/:id ─────────────

  it("DELETE /data-sources/:id unlinks and deletes", async () => {
    mockPrisma.dataSource.findFirst.mockResolvedValueOnce({
      id: "ds-001",
      userId: "00000000-0000-0000-0000-000000000001",
    });
    mockPrisma.transaction.updateMany.mockResolvedValueOnce({ count: 5 });
    mockPrisma.dataSource.delete.mockResolvedValueOnce({});

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/data-sources/ds-001",
    });

    expect(res.statusCode).toBe(204);
    // Verify transactions were unlinked before deletion
    expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sourceId: "ds-001" }),
        data: { sourceId: null },
      }),
    );
  });

  it("DELETE /data-sources/:id returns 404 for missing", async () => {
    mockPrisma.dataSource.findFirst.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/data-sources/nonexistent",
    });

    expect(res.statusCode).toBe(404);
  });

  // ─── POST /connections/:id/sync ───────────

  it("POST /connections/:id/sync marks connection as synced", async () => {
    mockPrisma.dataSource.findUnique.mockResolvedValueOnce({
      id: "ds-001",
      userId: "00000000-0000-0000-0000-000000000001",
      type: "EXCHANGE_API",
    });
    mockPrisma.dataSource.update.mockResolvedValueOnce({
      id: "ds-001",
      status: "ACTIVE",
      lastSyncAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/connections/ds-001/sync",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe("SYNCED_SUCCESSFULLY");
  });

  it("POST /connections/:id/sync returns 404 for missing connection", async () => {
    mockPrisma.dataSource.findUnique.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/connections/nonexistent/sync",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("Import Routes", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    // Register text/csv and text/plain content type parsers (matching main app behavior)
    app.addContentTypeParser(
      ["text/csv", "text/plain"],
      { parseAs: "string" },
      (
        _req: unknown,
        body: string,
        done: (err: null, body: string) => void,
      ) => {
        done(null, body);
      },
    );
    const { importRoutes } = await import("../routes/import");
    await app.register(importRoutes, { prefix: "/api/v1" });
  });

  afterEach(async () => {
    await app.close();
  });

  const COINBASE_CSV = `"Timestamp","Transaction Type","Asset","Quantity Transacted","Spot Price Currency","Spot Price at Transaction","Subtotal","Total (inclusive of fees and/or spread)","Fees and/or Spread","Notes"
"2024-01-15T10:30:00Z","Buy","BTC","0.5","USD","43000","21500","21625","125","Bought Bitcoin"`;

  // ─── POST /transactions/import (text/csv) ──

  it("POST /transactions/import parses Coinbase CSV", async () => {
    // No existing fingerprints
    mockPrisma.transaction.findMany.mockResolvedValueOnce([]);
    mockPrisma.dataSource.create.mockResolvedValueOnce({
      id: "ds-import-001",
      name: "COINBASE Import",
    });
    mockPrisma.transaction.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/import",
      headers: { "content-type": "text/csv" },
      payload: COINBASE_CSV,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.imported).toBe(1);
    expect(body.data.skipped).toBe(0);
    expect(body.data.summary.format).toBe("coinbase");
    expect(body.data.sourceId).toBe("ds-import-001");
  });

  it("POST /transactions/import deduplicates existing transactions", async () => {
    // Return matching fingerprints so all txs are skipped
    mockPrisma.transaction.findMany.mockImplementationOnce(
      async ({ where }: { where: { externalId: { in: string[] } } }) => {
        return where.externalId.in.map((fp: string) => ({
          externalId: fp,
        }));
      },
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/import",
      headers: { "content-type": "text/csv" },
      payload: COINBASE_CSV,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.imported).toBe(0);
    expect(body.data.skipped).toBe(1);
  });

  it("POST /transactions/import rejects empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/import",
      headers: { "content-type": "text/csv" },
      payload: "",
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("EMPTY_FILE");
  });

  it("POST /transactions/import rejects invalid content type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/import",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ data: "test" }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("INVALID_CONTENT_TYPE");
  });

  it("POST /transactions/import accepts format override", async () => {
    const genericCsv = `Type,Timestamp,Received Asset,Received Amount
BUY,2024-01-15T00:00:00Z,BTC,0.5`;

    mockPrisma.transaction.findMany.mockResolvedValueOnce([]);
    mockPrisma.dataSource.create.mockResolvedValueOnce({
      id: "ds-import-002",
      name: "GENERIC Import",
    });
    mockPrisma.transaction.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/import?format=generic",
      headers: { "content-type": "text/csv" },
      payload: genericCsv,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.summary.format).toBe("generic");
    expect(body.data.imported).toBe(1);
  });

  it("POST /transactions/import with custom source name", async () => {
    mockPrisma.transaction.findMany.mockResolvedValueOnce([]);
    mockPrisma.dataSource.create.mockResolvedValueOnce({
      id: "ds-import-003",
      name: "My Coinbase 2024",
    });
    mockPrisma.transaction.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/import?source=My%20Coinbase%202024",
      headers: { "content-type": "text/csv" },
      payload: COINBASE_CSV,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.sourceName).toBe("My Coinbase 2024");
  });

  it("POST /transactions/import parses Solscan DeFi CSV", async () => {
    const solscanDefiCsv = `Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut,Fee
abc123def,2024-03-15T14:30:00Z,Jupiter,Swap,USDC,100,SOL,1.5,0.00001`;

    mockPrisma.transaction.findMany.mockResolvedValueOnce([]);
    mockPrisma.dataSource.create.mockResolvedValueOnce({
      id: "ds-import-defi",
      name: "SOLSCAN_DEFI Import",
    });
    mockPrisma.transaction.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/import?format=solscan_defi",
      headers: { "content-type": "text/csv" },
      payload: solscanDefiCsv,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.summary.format).toBe("solscan_defi");
    expect(body.data.imported).toBe(1);
  });

  it("POST /transactions/import auto-detects Solscan DeFi format", async () => {
    const solscanDefiCsv = `Signature,Timestamp,Platform,Activity,TokenIn,AmountIn,TokenOut,AmountOut
xyz789,2024-06-01T10:00:00Z,Raydium,Swap,SOL,2.0,USDT,300`;

    mockPrisma.transaction.findMany.mockResolvedValueOnce([]);
    mockPrisma.dataSource.create.mockResolvedValueOnce({
      id: "ds-import-defi2",
      name: "SOLSCAN_DEFI Import",
    });
    mockPrisma.transaction.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/import",
      headers: { "content-type": "text/csv" },
      payload: solscanDefiCsv,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.summary.format).toBe("solscan_defi");
    expect(body.data.imported).toBe(1);
  });

  it("POST /transactions/import parses Solscan SOL transfer CSV with userAddress", async () => {
    const userAddr = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    const solscanCsv = `Signature,Block,Timestamp,From,To,Amount(SOL),Fee(SOL)
abc123,100,2024-01-15T10:00:00Z,${userAddr},xyz789,1.5,0.000005`;

    mockPrisma.transaction.findMany.mockResolvedValueOnce([]);
    mockPrisma.dataSource.create.mockResolvedValueOnce({
      id: "ds-import-sol",
      name: "SOLSCAN Import",
    });
    mockPrisma.transaction.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/transactions/import?format=solscan&userAddress=${userAddr}`,
      headers: { "content-type": "text/csv" },
      payload: solscanCsv,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.summary.format).toBe("solscan");
    expect(body.data.imported).toBe(1);
  });
});
