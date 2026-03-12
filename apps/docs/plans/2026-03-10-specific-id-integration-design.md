# Specific ID API Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose the existing `calculateSpecificId()` engine via new API endpoints (`GET /tax/available-lots` + `POST /tax/calculate-specific`) and extend Prisma/shared-types to support SPECIFIC_ID method.

**Architecture:** Thin API layer wrapping the existing tax-engine `calculateSpecificId()`. New `available-lots` endpoint provides lot pool for frontend selection. Existing form8949/schedule-d routes extended to accept SPECIFIC_ID. Prisma migration adds enum value.

**Tech Stack:** Fastify + Zod (routes), Prisma (migration), Vitest (tests), @dtax/tax-engine (engine)

---

### Task 1: Prisma Enum + Shared Types Extension

**Files:**

- Modify: `apps/api/prisma/schema.prisma:242-246`
- Modify: `packages/shared-types/src/index.ts:115`
- Test: `packages/shared-types/src/__tests__/index.test.ts`

**Step 1: Add SPECIFIC_ID to Prisma enum**

In `apps/api/prisma/schema.prisma`, change:

```prisma
enum CostBasisMethod {
  FIFO
  LIFO
  HIFO
}
```

to:

```prisma
enum CostBasisMethod {
  FIFO
  LIFO
  HIFO
  SPECIFIC_ID
}
```

**Step 2: Create Prisma migration**

Run: `cd apps/api && npx prisma migrate dev --name add_specific_id_method`
Expected: Migration created successfully

**Step 3: Add SPECIFIC_ID to shared-types**

In `packages/shared-types/src/index.ts` line 115, change:

```typescript
method: "FIFO" | "LIFO" | "HIFO";
```

to:

```typescript
method: "FIFO" | "LIFO" | "HIFO" | "SPECIFIC_ID";
```

**Step 4: Verify shared-types builds**

Run: `pnpm --filter @dtax/shared-types test && pnpm --filter @dtax/shared-types build`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/prisma/ packages/shared-types/src/index.ts
git commit -m "feat: add SPECIFIC_ID to CostBasisMethod enum and shared types"
```

---

### Task 2: GET /tax/available-lots Route

**Files:**

- Modify: `apps/api/src/routes/tax.ts`
- Test: `apps/api/src/__tests__/routes.test.ts`

**Step 1: Write the failing tests**

Add to `routes.test.ts` inside the "Tax Routes" describe block:

```typescript
// ─── GET /tax/available-lots ────────────────────

it("GET /tax/available-lots returns available lots", async () => {
  const buyTx1 = mockTransaction({
    id: "lot-avail-1",
    type: "BUY",
    receivedAsset: "BTC",
    receivedAmount: 2,
    receivedValueUsd: 60000,
    timestamp: new Date("2024-01-15T00:00:00Z"),
    sourceId: "coinbase",
  });
  const buyTx2 = mockTransaction({
    id: "lot-avail-2",
    type: "BUY",
    receivedAsset: "ETH",
    receivedAmount: 10,
    receivedValueUsd: 20000,
    timestamp: new Date("2024-06-01T00:00:00Z"),
    sourceId: "binance",
  });

  mockPrisma.transaction.findMany.mockResolvedValueOnce([buyTx1, buyTx2]);

  const res = await app.inject({
    method: "GET",
    url: "/api/v1/tax/available-lots?year=2025",
  });

  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.data.lots).toHaveLength(2);
  expect(body.data.lots[0]).toHaveProperty("id");
  expect(body.data.lots[0]).toHaveProperty("asset");
  expect(body.data.lots[0]).toHaveProperty("amount");
  expect(body.data.lots[0]).toHaveProperty("costBasisUsd");
  expect(body.data.lots[0]).toHaveProperty("acquiredAt");
  expect(body.data.lots[0]).toHaveProperty("sourceId");
});

it("GET /tax/available-lots filters by asset", async () => {
  const btcTx = mockTransaction({
    id: "lot-btc",
    type: "BUY",
    receivedAsset: "BTC",
    receivedAmount: 1,
    receivedValueUsd: 50000,
    timestamp: new Date("2024-01-01T00:00:00Z"),
  });

  mockPrisma.transaction.findMany.mockResolvedValueOnce([btcTx]);

  const res = await app.inject({
    method: "GET",
    url: "/api/v1/tax/available-lots?year=2025&asset=BTC",
  });

  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.data.lots).toHaveLength(1);
  expect(body.data.lots[0].asset).toBe("BTC");
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dtax/api test`
Expected: FAIL — route not found (404)

**Step 3: Implement GET /tax/available-lots**

Add to `apps/api/src/routes/tax.ts` (inside `taxRoutes` function, before the closing `}`):

```typescript
// GET /tax/available-lots — List available lots for Specific ID selection
app.get("/tax/available-lots", async (request, _reply) => {
  const query = z
    .object({
      year: z.coerce.number().int().min(2009).max(2030),
      asset: z.string().optional(),
    })
    .parse(request.query);

  const yearEnd = new Date(`${query.year + 1}-01-01T00:00:00Z`);

  const where: Record<string, unknown> = {
    userId: request.userId,
    type: { in: [...ACQUISITION_TYPES] },
    timestamp: { lt: yearEnd },
  };

  const acquisitions = await prisma.transaction.findMany({
    where,
    orderBy: { timestamp: "asc" },
  });

  let lots = acquisitions.map((tx) => ({
    id: tx.id,
    asset: tx.receivedAsset || "",
    amount: Number(tx.receivedAmount || 0),
    costBasisUsd: Number(tx.receivedValueUsd || 0),
    acquiredAt: tx.timestamp.toISOString(),
    sourceId: tx.sourceId || "unknown",
  }));

  if (query.asset) {
    lots = lots.filter((l) => l.asset === query.asset.toUpperCase());
  }

  return { data: { lots } };
});
```

Also add the import of `ACQUISITION_TYPES` — it's already in `tax-data.ts`. Since it's not exported, extract it. Alternative: import `fetchTaxData` and just return `lots`. Simpler: inline the types array or import from tax-data.

Check `apps/api/src/lib/tax-data.ts:11-26` — `ACQUISITION_TYPES` is `const` but not exported. Add `export` to it:

```typescript
export const ACQUISITION_TYPES = [
```

Then in `tax.ts`, add the import:

```typescript
import {
  fetchTaxData,
  calculateIncome,
  fetchInternalTransferIds,
  ACQUISITION_TYPES,
} from "../lib/tax-data";
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dtax/api test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/tax.ts apps/api/src/lib/tax-data.ts apps/api/src/__tests__/routes.test.ts
git commit -m "feat(api): add GET /tax/available-lots endpoint for Specific ID"
```

---

### Task 3: POST /tax/calculate-specific Route

**Files:**

- Modify: `apps/api/src/routes/tax.ts`
- Test: `apps/api/src/__tests__/routes.test.ts`

**Step 1: Write the failing tests**

Add to `routes.test.ts` inside the "Tax Routes" describe block:

```typescript
// ─── POST /tax/calculate-specific ───────────────

it("POST /tax/calculate-specific computes gains with lot selections", async () => {
  const buyTx = mockTransaction({
    id: "lot-spec-1",
    type: "BUY",
    receivedAsset: "BTC",
    receivedAmount: 2,
    receivedValueUsd: 60000,
    timestamp: new Date("2024-01-15T00:00:00Z"),
  });
  const sellTx = mockTransaction({
    id: "sell-spec-1",
    type: "SELL",
    sentAsset: "BTC",
    sentAmount: 1,
    sentValueUsd: 50000,
    feeValueUsd: 10,
    timestamp: new Date("2025-06-15T00:00:00Z"),
  });

  mockPrisma.transaction.findMany
    .mockResolvedValueOnce([buyTx]) // acquisitions
    .mockResolvedValueOnce([sellTx]); // dispositions

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tax/calculate-specific",
    payload: {
      taxYear: 2025,
      selections: [
        {
          eventId: "sell-spec-1",
          lots: [{ lotId: "lot-spec-1", amount: 1 }],
        },
      ],
    },
  });

  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.data.results).toBeInstanceOf(Array);
  expect(body.data.results).toHaveLength(1);
  // costBasis = 1/2 * 60000 = 30000, proceeds = 50000, fee = 10
  // gainLoss = 50000 - 30000 - 10 = 19990
  expect(body.data.results[0].gainLoss).toBeCloseTo(19990, 0);
});

it("POST /tax/calculate-specific returns 400 for missing lot", async () => {
  const sellTx = mockTransaction({
    id: "sell-bad",
    type: "SELL",
    sentAsset: "BTC",
    sentAmount: 1,
    sentValueUsd: 50000,
    timestamp: new Date("2025-06-15T00:00:00Z"),
  });

  mockPrisma.transaction.findMany
    .mockResolvedValueOnce([]) // no acquisitions
    .mockResolvedValueOnce([sellTx]); // dispositions

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tax/calculate-specific",
    payload: {
      taxYear: 2025,
      selections: [
        {
          eventId: "sell-bad",
          lots: [{ lotId: "nonexistent-lot", amount: 1 }],
        },
      ],
    },
  });

  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.error.message).toBeDefined();
});

it("POST /tax/calculate-specific returns 400 for empty selections", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tax/calculate-specific",
    payload: {
      taxYear: 2025,
      selections: [],
    },
  });

  expect(res.statusCode).toBe(400);
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dtax/api test`
Expected: FAIL — route not found

**Step 3: Implement POST /tax/calculate-specific**

Add to `apps/api/src/routes/tax.ts`:

```typescript
// POST /tax/calculate-specific — Calculate with user-selected lots (Specific ID)
app.post("/tax/calculate-specific", async (request, reply) => {
  const body = z
    .object({
      taxYear: z.number().int().min(2009).max(2030),
      selections: z
        .array(
          z.object({
            eventId: z.string(),
            lots: z.array(
              z.object({
                lotId: z.string(),
                amount: z.number().positive(),
              }),
            ),
          }),
        )
        .min(1),
      strictSilo: z.boolean().default(false),
    })
    .parse(request.body);

  const { lots, events } = await fetchTaxData({
    userId: request.userId,
    taxYear: body.taxYear,
  });

  const calculator = new CostBasisCalculator("SPECIFIC_ID");
  calculator.addLots(lots);

  const selectionMap = new Map(body.selections.map((s) => [s.eventId, s.lots]));

  const results = [];
  for (const event of events) {
    const eventSelections = selectionMap.get(event.id);
    if (!eventSelections) continue;

    try {
      const result = calculator.calculateSpecificId(event, eventSelections);
      results.push(result);
    } catch (e) {
      return reply.status(400).send({
        error: {
          message: e instanceof Error ? e.message : "Invalid lot selection",
          eventId: event.id,
        },
      });
    }
  }

  return { data: { results, method: "SPECIFIC_ID", taxYear: body.taxYear } };
});
```

Also add the import of `LotSelection` type at the top of tax.ts (if not already):

```typescript
import type {
  LotDateMap,
  DtaxDisposition,
  AcquisitionRecord,
  LotSelection,
} from "@dtax/tax-engine";
```

**Step 4: Rebuild tax-engine (API uses built dist)**

Run: `pnpm --filter @dtax/tax-engine build`

**Step 5: Run tests to verify they pass**

Run: `pnpm --filter @dtax/api test`
Expected: PASS

**Step 6: Type check**

Run: `pnpm --filter @dtax/api exec tsc --noEmit`
Expected: 0 errors

**Step 7: Commit**

```bash
git add apps/api/src/routes/tax.ts apps/api/src/__tests__/routes.test.ts
git commit -m "feat(api): add POST /tax/calculate-specific endpoint for Specific ID lot selection"
```

---

### Task 4: Extend Existing Route Schemas

**Files:**

- Modify: `apps/api/src/routes/tax.ts:34-38, 152-160, 219-227, 312-319`

**Step 1: Update all method enums**

In `apps/api/src/routes/tax.ts`, update the following 4 schemas to accept `"SPECIFIC_ID"`:

Line 36 (calculateSchema):

```typescript
method: z.enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"]).default("FIFO"),
```

Line 155 (form8949 query):

```typescript
method: z.enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"]).default("FIFO"),
```

Line 222 (schedule-d query):

```typescript
method: z.enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"]).default("FIFO"),
```

Line 317 (reconcile body):

```typescript
method: z.enum(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"]).default("FIFO"),
```

**Note:** When method=SPECIFIC_ID is used with `/tax/calculate` (the original auto-calculate route), the engine will throw "SPECIFIC_ID requires selections — use calculateSpecificId()". This is expected — users should use `/tax/calculate-specific` for Specific ID. The enum extension is for form8949/schedule-d which will read from previously calculated results.

**Step 2: Run full test suite**

Run: `pnpm --filter @dtax/api test`
Expected: All tests PASS (existing tests use FIFO, unaffected)

**Step 3: Type check**

Run: `pnpm --filter @dtax/api exec tsc --noEmit`
Expected: 0 errors

**Step 4: Commit**

```bash
git add apps/api/src/routes/tax.ts
git commit -m "feat(api): extend method schemas to accept SPECIFIC_ID across all tax routes"
```

---

### Task 5: Five-Step Audit + Push

**Step 1: Run full test suite (all packages)**

```bash
pnpm --filter @dtax/tax-engine test
pnpm --filter @dtax/api test
pnpm --filter @dtax/cli test
```

Expected: All pass

**Step 2: Type check all packages**

```bash
pnpm --filter @dtax/api exec tsc --noEmit
pnpm --filter @dtax/tax-engine exec tsc --noEmit
```

Expected: 0 errors

**Step 3: Five-step audit**

- Code: Verify route schemas, Zod validation, error handling
- Business: Specific ID is IRS-required method — API now supports it
- Bias: Tests cover success + error paths
- Historical: Follows existing route patterns (fetchTaxData, calculator, response format)
- Path Dependency: Engine already tested (9 tests), API is thin wrapper

**Step 4: Push to all 3 repos**

```bash
git push origin-api main
git push origin-web main
# Filter-repo for public repo (only if packages/ changed)
```

**Step 5: Update MEMORY.md**

Add task entry, update test count.
