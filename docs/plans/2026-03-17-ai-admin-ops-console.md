# AI 运维控制台 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在管理面板新增 AI 运维控制台页面，包含模型试验台 (Playground)、分类审核队列 (Classification Review)、成本监控 (Cost Monitor) 三大模块。

**Architecture:** 新建 `admin-ai` 路由文件（后端）和 `admin/ai-tools` 页面目录（前端）。后端通过 LlmAdapter 接口实现 Playground 的多 provider 调用，通过 Prisma 查询审计日志实现分类审核和成本统计。前端使用 Recharts 图表和现有 UI 组件。

**Tech Stack:** Fastify + Prisma + zod-openapi (API), Next.js + Recharts + next-intl (Web), Vitest (Tests)

---

## Task 0: 后端 — AI 运维路由骨架 + Playground 端点

**Files:**

- Create: `apps/api/src/routes/admin-ai.ts`
- Modify: `apps/api/src/routes/admin.ts` (注册子插件)
- Create: `apps/api/src/__tests__/admin-ai.test.ts`

**Context:**

- admin.ts 在末尾通过 `await app.register(adminAnalyticsRoutes)` 注册子插件
- requireRole("ADMIN") 用于分析端点，SUPER_ADMIN 用于系统配置
- Playground 用 ADMIN+ 角色即可（只读测试）
- LlmAdapter 接口: classify(), chat(), chatStream(), testConnection()
- resolveProvider() 需要 userId 参数做 3 层配置解析
- createAdapter() 在 factory.ts 中，接受 providerId, apiKey, baseUrl

**Step 1:** 创建 `admin-ai.ts` 骨架 + Playground 端点

Playground 端点设计：

```
POST /admin/ai-tools/playground
Body: { providerId, apiKey?, baseUrl?, model?, prompt, mode: "chat" | "classify" }
Response: { data: { response: string, model: string, latencyMs: number } }
```

```typescript
// apps/api/src/routes/admin-ai.ts
/**
 * Admin AI Tools Routes
 *
 * POST /admin/ai-tools/playground       — Test prompt against any provider/model
 * GET  /admin/ai-tools/classifications  — List AI-classified transactions for review
 * POST /admin/ai-tools/classifications/:id/override — Override AI classification
 * GET  /admin/ai-tools/cost-summary     — Token usage & cost estimates
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { requireRole } from "../plugins/auth";
import { getPreset, PROVIDER_PRESETS } from "../lib/llm/presets";
import { AnthropicAdapter } from "../lib/llm/anthropic-adapter";
import { OpenAICompatAdapter } from "../lib/llm/openai-compat-adapter";
import { resolveProvider } from "../lib/llm";
import type { LlmAdapter } from "../lib/llm";
import { prisma } from "../lib/prisma";
import { decryptKey } from "../lib/encryption";

function createPlaygroundAdapter(
  providerId: string,
  apiKey?: string,
  baseUrl?: string,
): LlmAdapter {
  const preset = getPreset(providerId);
  const adapterType = preset?.adapter ?? "openai_compat";

  if (adapterType === "anthropic") {
    return new AnthropicAdapter({ apiKey: apiKey ?? "" });
  }

  const url = baseUrl ?? preset?.baseUrl ?? "";
  return new OpenAICompatAdapter({ apiKey, baseUrl: url });
}

export async function adminAiRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();

  // POST /admin/ai-tools/playground — Test prompt against any provider/model
  r.post(
    "/admin/ai-tools/playground",
    {
      onRequest: [requireRole("ADMIN")],
      schema: {
        tags: ["admin"],
        operationId: "aiPlayground",
        description: "Test a prompt against any configured AI provider/model",
        body: z.object({
          providerId: z.string().optional(),
          apiKey: z.string().optional(),
          baseUrl: z.string().optional(),
          model: z.string().optional(),
          prompt: z.string().min(1).max(5000),
          systemPrompt: z.string().max(5000).optional(),
        }),
        response: {
          200: z.object({
            data: z.object({
              response: z.string(),
              model: z.string(),
              providerId: z.string(),
              latencyMs: z.number(),
            }),
          }),
          400: z.object({
            error: z.object({ code: z.string(), message: z.string() }),
          }),
          500: z.object({
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { providerId, apiKey, baseUrl, model, prompt, systemPrompt } =
        request.body;

      const start = Date.now();

      try {
        let adapter: LlmAdapter;
        let resolvedModel: string;
        let resolvedProviderId: string;

        if (providerId) {
          // Use specified provider
          const preset = getPreset(providerId);
          let resolvedApiKey = apiKey;
          let resolvedBaseUrl = baseUrl;

          // If no API key provided, try system config
          if (!resolvedApiKey) {
            const sysConfig = await prisma.systemConfig.findUnique({
              where: { key: "ai_config" },
            });
            if (sysConfig?.value) {
              const cfg = sysConfig.value as Record<string, unknown>;
              if (cfg.provider === providerId && cfg.apiKey) {
                try {
                  resolvedApiKey = decryptKey(cfg.apiKey as string);
                } catch {
                  // ignore
                }
              }
              if (!resolvedBaseUrl && cfg.baseUrl) {
                resolvedBaseUrl = cfg.baseUrl as string;
              }
            }
          }

          adapter = createPlaygroundAdapter(
            providerId,
            resolvedApiKey,
            resolvedBaseUrl,
          );
          resolvedModel = model ?? preset?.defaultModel ?? "";
          resolvedProviderId = providerId;
        } else {
          // Use system default
          const resolved = await resolveProvider("chat");
          adapter = resolved.adapter;
          resolvedModel = model ?? resolved.model;
          resolvedProviderId = resolved.providerId;
        }

        const result = await adapter.chat({
          model: resolvedModel,
          systemPrompt:
            systemPrompt || "You are a helpful assistant. Be concise.",
          messages: [{ role: "user", content: prompt }],
          maxTokens: 1000,
        });

        const latencyMs = Date.now() - start;

        return {
          data: {
            response: result.content,
            model: resolvedModel,
            providerId: resolvedProviderId,
            latencyMs,
          },
        };
      } catch (err) {
        const latencyMs = Date.now() - start;
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        return reply.status(500).send({
          error: {
            code: "AI_PLAYGROUND_ERROR",
            message: `Provider error after ${latencyMs}ms: ${message}`,
          },
        });
      }
    },
  );
}
```

**Step 2:** 在 admin.ts 末尾注册子插件

```typescript
// apps/api/src/routes/admin.ts — 在 import 区域添加
import { adminAiRoutes } from "./admin-ai";

// 在 adminRoutes 函数末尾（adminAnalyticsRoutes 之后）添加
await app.register(adminAiRoutes);
```

**Step 3:** 创建测试文件

```typescript
// apps/api/src/__tests__/admin-ai.test.ts
import "zod-openapi/extend";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { ZodError } from "zod";
import {
  fastifyZodOpenApiPlugin,
  validatorCompiler,
} from "fastify-zod-openapi";
import { adminAiRoutes } from "../routes/admin-ai";

// Mock dependencies
vi.mock("../lib/prisma", () => ({
  prisma: {
    systemConfig: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../lib/llm/anthropic-adapter", () => ({
  AnthropicAdapter: vi.fn().mockImplementation(() => ({
    chat: vi
      .fn()
      .mockResolvedValue({ content: "Test response", toolCalls: [] }),
    classify: vi.fn(),
    chatStream: vi.fn(),
    testConnection: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock("../lib/llm/openai-compat-adapter", () => ({
  OpenAICompatAdapter: vi.fn().mockImplementation(() => ({
    chat: vi
      .fn()
      .mockResolvedValue({ content: "Test response", toolCalls: [] }),
    classify: vi.fn(),
    chatStream: vi.fn(),
    testConnection: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock("../lib/llm", () => ({
  resolveProvider: vi.fn().mockResolvedValue({
    adapter: {
      chat: vi
        .fn()
        .mockResolvedValue({ content: "Default response", toolCalls: [] }),
    },
    model: "claude-sonnet-4-6",
    providerId: "anthropic",
  }),
}));

vi.mock("../lib/encryption", () => ({
  decryptKey: vi.fn((v: string) => v),
  encryptKey: vi.fn((v: string) => v),
}));

import { prisma } from "../lib/prisma";
const mockPrisma = vi.mocked(prisma);

function buildAiToolsApp(role = "ADMIN") {
  const app = Fastify({ logger: false });
  app.register(fastifyZodOpenApiPlugin);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (request) => {
    request.userId = "00000000-0000-0000-0000-00000000000a";
    request.userRole = role;
  });

  app.setErrorHandler((error: Error, _request, reply) => {
    const errAny = error as Error & {
      validation?: unknown[];
      statusCode?: number;
    };
    if (errAny.validation) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: errAny.validation,
        },
      });
    }
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send({
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
    }
    return reply.status(500).send({ error: { message: error.message } });
  });

  app.register(adminAiRoutes, { prefix: "/api/v1" });
  return app;
}

describe("Admin AI Tools Routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = buildAiToolsApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /admin/ai-tools/playground", () => {
    it("returns AI response with latency using system default", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/ai-tools/playground",
        payload: { prompt: "What is Bitcoin?" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.response).toBeDefined();
      expect(body.data.latencyMs).toBeGreaterThanOrEqual(0);
      expect(body.data.providerId).toBe("anthropic");
    });

    it("uses specified provider when providerId given", async () => {
      (mockPrisma.systemConfig.findUnique as any).mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/ai-tools/playground",
        payload: {
          providerId: "openai",
          apiKey: "sk-test",
          model: "gpt-4o",
          prompt: "Hello",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.providerId).toBe("openai");
      expect(body.data.model).toBe("gpt-4o");
    });

    it("rejects empty prompt", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/ai-tools/playground",
        payload: { prompt: "" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("Auth Guards", () => {
    it("USER cannot access playground", async () => {
      const userApp = buildAiToolsApp("USER");
      await userApp.ready();
      const res = await userApp.inject({
        method: "POST",
        url: "/api/v1/admin/ai-tools/playground",
        payload: { prompt: "test" },
      });
      expect(res.statusCode).toBe(403);
      await userApp.close();
    });

    it("SUPPORT cannot access playground", async () => {
      const supportApp = buildAiToolsApp("SUPPORT");
      await supportApp.ready();
      const res = await supportApp.inject({
        method: "POST",
        url: "/api/v1/admin/ai-tools/playground",
        payload: { prompt: "test" },
      });
      expect(res.statusCode).toBe(403);
      await supportApp.close();
    });
  });
});
```

**Step 4:** 运行测试验证

```bash
pnpm --filter @dtax/api test -- src/__tests__/admin-ai.test.ts
```

**Step 5:** 五步审计 + 提交

```bash
git add apps/api/src/routes/admin-ai.ts apps/api/src/routes/admin.ts apps/api/src/__tests__/admin-ai.test.ts
git commit -m "feat(admin): add AI playground endpoint + tests"
```

---

## Task 1: 后端 — 分类审核队列端点

**Files:**

- Modify: `apps/api/src/routes/admin-ai.ts`
- Modify: `apps/api/src/__tests__/admin-ai.test.ts`

**Context:**

- 交易表 (transactions) 有字段: id, userId, type, sentAsset, receivedAsset, notes, source, createdAt
- AI 分类结果存储在 AuditLog 中: action="AI_CLASSIFY", entityType="Transaction", details 含 { classifiedType, confidence, reasoning, model }
- 需要关联 Transaction + AuditLog 来展示分类历史
- 管理员可以 override 分类（更新 transaction.type + 记录审计日志）

**Step 1:** 添加两个端点到 admin-ai.ts

```
GET  /admin/ai-tools/classifications?page=1&limit=20&minConfidence=0&maxConfidence=1
POST /admin/ai-tools/classifications/:id/override  Body: { type: string, reason: string }
```

在 `adminAiRoutes` 函数内，playground 端点之后添加：

```typescript
// GET /admin/ai-tools/classifications — List AI-classified transactions
r.get(
  "/admin/ai-tools/classifications",
  {
    onRequest: [requireRole("ADMIN")],
    schema: {
      tags: ["admin"],
      operationId: "listAiClassifications",
      description: "List AI-classified transactions for review",
      querystring: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        minConfidence: z.coerce.number().min(0).max(1).optional(),
        maxConfidence: z.coerce.number().min(0).max(1).optional(),
      }),
      response: {
        200: z.object({
          data: z.object({
            items: z.array(
              z.object({
                id: z.string().uuid(),
                transactionId: z.string().uuid(),
                userId: z.string().uuid(),
                classifiedType: z.string(),
                confidence: z.number(),
                reasoning: z.string(),
                model: z.string(),
                currentType: z.string(),
                overridden: z.boolean(),
                sentAsset: z.string().nullable(),
                receivedAsset: z.string().nullable(),
                source: z.string().nullable(),
                classifiedAt: z.date(),
              }),
            ),
            total: z.number().int(),
            page: z.number().int(),
            limit: z.number().int(),
            totalPages: z.number().int(),
            stats: z.object({
              totalClassified: z.number().int(),
              overriddenCount: z.number().int(),
              avgConfidence: z.number(),
            }),
          }),
        }),
      },
    },
  },
  async (request) => {
    const { page, limit, minConfidence, maxConfidence } = request.query;

    // Build confidence filter for raw query
    const confidenceFilters: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (minConfidence !== undefined) {
      confidenceFilters.push(
        `CAST(al.details->>'confidence' AS FLOAT) >= $${paramIdx}`,
      );
      params.push(minConfidence);
      paramIdx++;
    }
    if (maxConfidence !== undefined) {
      confidenceFilters.push(
        `CAST(al.details->>'confidence' AS FLOAT) <= $${paramIdx}`,
      );
      params.push(maxConfidence);
      paramIdx++;
    }

    const confidenceWhere =
      confidenceFilters.length > 0
        ? `AND ${confidenceFilters.join(" AND ")}`
        : "";

    // Get classification audit logs joined with transactions
    const offset = (page - 1) * limit;

    const items = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        transaction_id: string;
        user_id: string;
        classified_type: string;
        confidence: number;
        reasoning: string;
        model: string;
        current_type: string;
        sent_asset: string | null;
        received_asset: string | null;
        source: string | null;
        classified_at: Date;
      }>
    >(
      `SELECT
          al.id,
          al.entity_id AS transaction_id,
          al.user_id,
          al.details->>'classifiedType' AS classified_type,
          CAST(al.details->>'confidence' AS FLOAT) AS confidence,
          COALESCE(al.details->>'reasoning', '') AS reasoning,
          COALESCE(al.details->>'model', 'unknown') AS model,
          t.type AS current_type,
          t.sent_asset,
          t.received_asset,
          t.source,
          al.created_at AS classified_at
        FROM audit_logs al
        JOIN transactions t ON t.id = al.entity_id
        WHERE al.action = 'AI_CLASSIFY'
          AND al.entity_type = 'Transaction'
          ${confidenceWhere}
        ORDER BY al.created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params,
      limit,
      offset,
    );

    const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) AS count
        FROM audit_logs al
        JOIN transactions t ON t.id = al.entity_id
        WHERE al.action = 'AI_CLASSIFY'
          AND al.entity_type = 'Transaction'
          ${confidenceWhere}`,
      ...params,
    );
    const total = Number(countResult[0]?.count ?? 0);

    // Stats
    const statsResult = await prisma.$queryRaw<
      [{ total: bigint; overridden: bigint; avg_conf: number }]
    >`SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN al.details->>'classifiedType' != t.type THEN 1 ELSE 0 END) AS overridden,
          COALESCE(AVG(CAST(al.details->>'confidence' AS FLOAT)), 0) AS avg_conf
        FROM audit_logs al
        JOIN transactions t ON t.id = al.entity_id
        WHERE al.action = 'AI_CLASSIFY' AND al.entity_type = 'Transaction'`;

    return {
      data: {
        items: items.map((row) => ({
          id: row.id,
          transactionId: row.transaction_id,
          userId: row.user_id,
          classifiedType: row.classified_type,
          confidence: row.confidence,
          reasoning: row.reasoning,
          model: row.model,
          currentType: row.current_type,
          overridden: row.classified_type !== row.current_type,
          sentAsset: row.sent_asset,
          receivedAsset: row.received_asset,
          source: row.source,
          classifiedAt: row.classified_at,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        stats: {
          totalClassified: Number(statsResult[0]?.total ?? 0),
          overriddenCount: Number(statsResult[0]?.overridden ?? 0),
          avgConfidence:
            Math.round((statsResult[0]?.avg_conf ?? 0) * 100) / 100,
        },
      },
    };
  },
);

// POST /admin/ai-tools/classifications/:id/override — Override AI classification
r.post(
  "/admin/ai-tools/classifications/:id/override",
  {
    onRequest: [requireRole("ADMIN")],
    schema: {
      tags: ["admin"],
      operationId: "overrideClassification",
      description: "Override an AI classification on a transaction",
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        type: z.string(),
        reason: z.string().min(1).max(500),
      }),
      response: {
        200: z.object({
          data: z.object({
            transactionId: z.string().uuid(),
            previousType: z.string(),
            newType: z.string(),
          }),
        }),
        404: z.object({
          error: z.object({ code: z.string(), message: z.string() }),
        }),
      },
    },
  },
  async (request, reply) => {
    const { id } = request.params;
    const { type, reason } = request.body;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      select: { id: true, type: true },
    });

    if (!transaction) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Transaction not found" },
      });
    }

    const previousType = transaction.type;

    await prisma.transaction.update({
      where: { id },
      data: { type },
    });

    await prisma.auditLog.create({
      data: {
        userId: request.userId,
        action: "CLASSIFICATION_OVERRIDE",
        entityType: "Transaction",
        entityId: id,
        details: { previousType, newType: type, reason },
        ipAddress: request.ip,
      },
    });

    return {
      data: { transactionId: id, previousType, newType: type },
    };
  },
);
```

**Step 2:** 添加测试

在 `admin-ai.test.ts` 的主 describe 块内添加：

```typescript
describe("GET /admin/ai-tools/classifications", () => {
  it("returns paginated classification list with stats", async () => {
    (mockPrisma.$queryRawUnsafe as any).mockResolvedValueOnce([
      {
        id: "c1",
        transaction_id: "t1",
        user_id: "u1",
        classified_type: "TRADE",
        confidence: 0.95,
        reasoning: "Looks like a swap",
        model: "claude-haiku-4-5-20251001",
        current_type: "TRADE",
        sent_asset: "ETH",
        received_asset: "USDC",
        source: "uniswap",
        classified_at: new Date(),
      },
    ]);
    (mockPrisma.$queryRawUnsafe as any).mockResolvedValueOnce([
      { count: BigInt(1) },
    ]);
    (mockPrisma.$queryRaw as any).mockResolvedValueOnce([
      { total: BigInt(10), overridden: BigInt(2), avg_conf: 0.87 },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/ai-tools/classifications",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].classifiedType).toBe("TRADE");
    expect(body.data.stats.totalClassified).toBe(10);
    expect(body.data.stats.avgConfidence).toBe(0.87);
  });
});

describe("POST /admin/ai-tools/classifications/:id/override", () => {
  it("overrides transaction type and creates audit log", async () => {
    (mockPrisma.transaction as any).findUnique = vi.fn().mockResolvedValueOnce({
      id: "t1",
      type: "TRADE",
    });
    (mockPrisma.transaction as any).update = vi.fn().mockResolvedValueOnce({
      id: "t1",
      type: "DEX_SWAP",
    });
    (mockPrisma.auditLog.create as any).mockResolvedValueOnce({});

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/ai-tools/classifications/00000000-0000-0000-0000-000000000001/override",
      payload: { type: "DEX_SWAP", reason: "This is actually a DEX swap" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.previousType).toBe("TRADE");
    expect(body.data.newType).toBe("DEX_SWAP");
  });

  it("returns 404 for non-existent transaction", async () => {
    (mockPrisma.transaction as any).findUnique = vi
      .fn()
      .mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/ai-tools/classifications/00000000-0000-0000-0000-000000000099/override",
      payload: { type: "BUY", reason: "Correction" },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

**Step 3:** 运行测试 + 五步审计 + 提交

```bash
pnpm --filter @dtax/api test -- src/__tests__/admin-ai.test.ts
git commit -m "feat(admin): add classification review queue endpoints"
```

---

## Task 2: 后端 — 成本监控端点

**Files:**

- Modify: `apps/api/src/routes/admin-ai.ts`
- Modify: `apps/api/src/__tests__/admin-ai.test.ts`

**Context:**

- 审计日志中 AI_CLASSIFY 和 CHAT_MESSAGE 动作有计数但没有 token 数
- 现阶段使用估算成本：按调用次数 × 平均 token 费用
- 分类: Haiku ≈ $0.00025/call, Sonnet ≈ $0.003/call
- 聊天: ≈ $0.003/call (Sonnet default)
- 未来可扩展为精确 token 计量

**Step 1:** 添加成本监控端点

```
GET /admin/ai-tools/cost-summary?days=30
```

```typescript
// GET /admin/ai-tools/cost-summary — AI usage cost estimates
r.get(
  "/admin/ai-tools/cost-summary",
  {
    onRequest: [requireRole("ADMIN")],
    schema: {
      tags: ["admin"],
      operationId: "getAiCostSummary",
      description: "AI usage cost estimates and daily breakdown",
      querystring: z.object({
        days: z.coerce.number().int().min(1).max(365).default(30),
      }),
      response: {
        200: z.object({
          data: z.object({
            totalCalls: z.number().int(),
            totalClassifications: z.number().int(),
            totalChats: z.number().int(),
            estimatedCostUsd: z.number(),
            dailyBreakdown: z.array(
              z.object({
                date: z.string(),
                classifications: z.number().int(),
                chats: z.number().int(),
                estimatedCostUsd: z.number(),
              }),
            ),
            topUsers: z.array(
              z.object({
                userId: z.string().uuid(),
                email: z.string(),
                classifications: z.number().int(),
                chats: z.number().int(),
                estimatedCostUsd: z.number(),
              }),
            ),
          }),
        }),
      },
    },
  },
  async (request) => {
    const { days } = request.query;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Daily breakdown
    const dailyBreakdown = await prisma.$queryRaw<
      Array<{
        date: string;
        classifications: bigint;
        chats: bigint;
      }>
    >`SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
          SUM(CASE WHEN action = 'AI_CLASSIFY' THEN 1 ELSE 0 END) AS classifications,
          SUM(CASE WHEN action = 'CHAT_MESSAGE' THEN 1 ELSE 0 END) AS chats
        FROM audit_logs
        WHERE action IN ('AI_CLASSIFY', 'CHAT_MESSAGE')
          AND created_at >= ${since}
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY date`;

    // Top users
    const topUsers = await prisma.$queryRaw<
      Array<{
        user_id: string;
        email: string;
        classifications: bigint;
        chats: bigint;
      }>
    >`SELECT
          al.user_id,
          u.email,
          SUM(CASE WHEN al.action = 'AI_CLASSIFY' THEN 1 ELSE 0 END) AS classifications,
          SUM(CASE WHEN al.action = 'CHAT_MESSAGE' THEN 1 ELSE 0 END) AS chats
        FROM audit_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.action IN ('AI_CLASSIFY', 'CHAT_MESSAGE')
          AND al.created_at >= ${since}
        GROUP BY al.user_id, u.email
        ORDER BY (SUM(CASE WHEN al.action = 'AI_CLASSIFY' THEN 1 ELSE 0 END)
                + SUM(CASE WHEN al.action = 'CHAT_MESSAGE' THEN 1 ELSE 0 END)) DESC
        LIMIT 10`;

    const CLASSIFY_COST = 0.0005; // avg of Haiku + Sonnet
    const CHAT_COST = 0.003;

    const dailyData = dailyBreakdown.map((d) => {
      const cls = Number(d.classifications);
      const cht = Number(d.chats);
      return {
        date: d.date,
        classifications: cls,
        chats: cht,
        estimatedCostUsd:
          Math.round((cls * CLASSIFY_COST + cht * CHAT_COST) * 10000) / 10000,
      };
    });

    const totalClassifications = dailyData.reduce(
      (sum, d) => sum + d.classifications,
      0,
    );
    const totalChats = dailyData.reduce((sum, d) => sum + d.chats, 0);
    const estimatedCostUsd =
      Math.round(
        (totalClassifications * CLASSIFY_COST + totalChats * CHAT_COST) * 10000,
      ) / 10000;

    return {
      data: {
        totalCalls: totalClassifications + totalChats,
        totalClassifications,
        totalChats,
        estimatedCostUsd,
        dailyBreakdown: dailyData,
        topUsers: topUsers.map((u) => {
          const cls = Number(u.classifications);
          const cht = Number(u.chats);
          return {
            userId: u.user_id,
            email: u.email,
            classifications: cls,
            chats: cht,
            estimatedCostUsd:
              Math.round((cls * CLASSIFY_COST + cht * CHAT_COST) * 10000) /
              10000,
          };
        }),
      },
    };
  },
);
```

**Step 2:** 添加测试

```typescript
describe("GET /admin/ai-tools/cost-summary", () => {
  it("returns cost summary with daily breakdown and top users", async () => {
    (mockPrisma.$queryRaw as any)
      .mockResolvedValueOnce([
        { date: "2026-03-16", classifications: BigInt(50), chats: BigInt(10) },
        { date: "2026-03-17", classifications: BigInt(30), chats: BigInt(5) },
      ])
      .mockResolvedValueOnce([
        {
          user_id: "u1",
          email: "a@b.com",
          classifications: BigInt(40),
          chats: BigInt(8),
        },
      ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/ai-tools/cost-summary?days=7",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalClassifications).toBe(80);
    expect(body.data.totalChats).toBe(15);
    expect(body.data.estimatedCostUsd).toBeGreaterThan(0);
    expect(body.data.dailyBreakdown).toHaveLength(2);
    expect(body.data.topUsers).toHaveLength(1);
    expect(body.data.topUsers[0].email).toBe("a@b.com");
  });
});
```

**Step 3:** 运行测试 + 五步审计 + 提交

```bash
pnpm --filter @dtax/api test -- src/__tests__/admin-ai.test.ts
git commit -m "feat(admin): add AI cost monitoring endpoint"
```

---

## Task 3: 前端 — API 类型和函数

**Files:**

- Modify: `apps/web/src/lib/api.ts`

**Context:**

- api.ts 中所有 admin 函数和接口集中在一起
- 使用 apiFetch<T>() 通用函数
- TypeScript interface 定义返回类型

**Step 1:** 在 api.ts 的 admin 区域（其他 admin 接口/函数之后）添加：

```typescript
// ─── Admin AI Tools ──────────────────────────────

export interface PlaygroundRequest {
  providerId?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  prompt: string;
  systemPrompt?: string;
}

export interface PlaygroundResponse {
  response: string;
  model: string;
  providerId: string;
  latencyMs: number;
}

export interface ClassificationItem {
  id: string;
  transactionId: string;
  userId: string;
  classifiedType: string;
  confidence: number;
  reasoning: string;
  model: string;
  currentType: string;
  overridden: boolean;
  sentAsset: string | null;
  receivedAsset: string | null;
  source: string | null;
  classifiedAt: string;
}

export interface ClassificationListResponse {
  items: ClassificationItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    totalClassified: number;
    overriddenCount: number;
    avgConfidence: number;
  };
}

export interface CostSummary {
  totalCalls: number;
  totalClassifications: number;
  totalChats: number;
  estimatedCostUsd: number;
  dailyBreakdown: Array<{
    date: string;
    classifications: number;
    chats: number;
    estimatedCostUsd: number;
  }>;
  topUsers: Array<{
    userId: string;
    email: string;
    classifications: number;
    chats: number;
    estimatedCostUsd: number;
  }>;
}

export async function runPlayground(params: PlaygroundRequest) {
  return apiFetch<{ data: PlaygroundResponse }>(
    "/api/v1/admin/ai-tools/playground",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

export async function getClassifications(
  page = 1,
  limit = 20,
  minConfidence?: number,
  maxConfidence?: number,
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (minConfidence !== undefined)
    params.set("minConfidence", String(minConfidence));
  if (maxConfidence !== undefined)
    params.set("maxConfidence", String(maxConfidence));
  return apiFetch<{ data: ClassificationListResponse }>(
    `/api/v1/admin/ai-tools/classifications?${params}`,
  );
}

export async function overrideClassification(
  transactionId: string,
  type: string,
  reason: string,
) {
  return apiFetch<{
    data: { transactionId: string; previousType: string; newType: string };
  }>(`/api/v1/admin/ai-tools/classifications/${transactionId}/override`, {
    method: "POST",
    body: JSON.stringify({ type, reason }),
  });
}

export async function getAiCostSummary(days = 30) {
  return apiFetch<{ data: CostSummary }>(
    `/api/v1/admin/ai-tools/cost-summary?days=${days}`,
  );
}
```

**Step 2:** 五步审计 + 提交

```bash
git commit -m "feat(web): add AI tools API types and functions"
```

---

## Task 4: 前端 — AI 工具页面骨架 + 导航 + Playground UI

**Files:**

- Create: `apps/web/src/app/[locale]/admin/ai-tools/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/page.tsx` (导航标签)

**Context:**

- 管理面板导航在 admin/page.tsx 中用 `<Link>` 组件
- admin 页面使用 `useAuth()` 获取角色, `useTranslations("admin")` 获取翻译
- 需要 ADMIN+ 角色访问
- StatCard 组件用于 KPI 卡片
- Recharts 图表组件已在 analytics 页面使用
- Playground 需要: provider 下拉, model 下拉, prompt textarea, system prompt textarea, 发送按钮, 响应显示区域, 延迟指标

**Step 1:** 在 admin/page.tsx 的导航标签区域添加 AI Tools 链接

找到 `{isAdminPlus && <Link href="/admin/analytics">` 行，在其后添加：

```tsx
{
  isAdminPlus && (
    <Link
      href="/admin/ai-tools"
      className={`admin-tab ${pathname.includes("/admin/ai-tools") ? "active" : ""}`}
    >
      {t("navAiTools")}
    </Link>
  );
}
```

**Step 2:** 创建 AI Tools 页面 — 包含三个 tab（Playground, Classifications, Cost Monitor）

```tsx
// apps/web/src/app/[locale]/admin/ai-tools/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { StatCard } from "@/components/ui";
import {
  runPlayground,
  getAiPresets,
  getClassifications,
  overrideClassification,
  getAiCostSummary,
  type AiPreset,
  type PlaygroundResponse,
  type ClassificationItem,
  type ClassificationListResponse,
  type CostSummary,
} from "@/lib/api";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Tab = "playground" | "classifications" | "costs";

export default function AiToolsPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const { user } = useAuth();

  const isAdminPlus = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [activeTab, setActiveTab] = useState<Tab>("playground");

  if (!isAdminPlus) {
    return (
      <div className="container py-8">
        <p className="text-error">{t("accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Admin nav tabs */}
      <div className="flex gap-1 mb-6 border-b pb-2 flex-wrap">
        <Link
          href="/admin"
          className={`admin-tab ${pathname.endsWith("/admin") ? "active" : ""}`}
        >
          {t("navDashboard")}
        </Link>
        <Link
          href="/admin/users"
          className={`admin-tab ${pathname.includes("/admin/users") ? "active" : ""}`}
        >
          {t("navUsers")}
        </Link>
        {isAdminPlus && (
          <Link
            href="/admin/audit"
            className={`admin-tab ${pathname.includes("/admin/audit") ? "active" : ""}`}
          >
            {t("navAudit")}
          </Link>
        )}
        {isAdminPlus && (
          <Link
            href="/admin/analytics"
            className={`admin-tab ${pathname.includes("/admin/analytics") ? "active" : ""}`}
          >
            {t("navAnalytics")}
          </Link>
        )}
        {isAdminPlus && (
          <Link
            href="/admin/ai-tools"
            className={`admin-tab ${pathname.includes("/admin/ai-tools") ? "active" : ""}`}
          >
            {t("navAiTools")}
          </Link>
        )}
        {isSuperAdmin && (
          <Link
            href="/admin/system"
            className={`admin-tab ${pathname.includes("/admin/system") ? "active" : ""}`}
          >
            {t("navSystem")}
          </Link>
        )}
      </div>

      <h1 className="text-2xl font-bold mb-1">{t("aiToolsTitle")}</h1>
      <p className="text-muted mb-6">{t("aiToolsSubtitle")}</p>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        {(["playground", "classifications", "costs"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`btn btn-sm ${activeTab === tab ? "btn-primary" : "btn-secondary"}`}
          >
            {t(`aiTab_${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "playground" && <PlaygroundPanel />}
      {activeTab === "classifications" && <ClassificationsPanel />}
      {activeTab === "costs" && <CostPanel />}
    </div>
  );
}

// ─── Playground Panel ────────────────────────────

function PlaygroundPanel() {
  const t = useTranslations("admin");
  const [presets, setPresets] = useState<AiPreset[]>([]);
  const [providerId, setProviderId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [result, setResult] = useState<PlaygroundResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAiPresets()
      .then((res) => setPresets(res.data || []))
      .catch(() => {});
  }, []);

  const selectedPreset = presets.find((p) => p.id === providerId);

  async function handleSubmit() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runPlayground({
        ...(providerId && { providerId }),
        ...(apiKey && { apiKey }),
        model: model || undefined,
        prompt,
        ...(systemPrompt && { systemPrompt }),
      });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t("aiProvider")}
          </label>
          <select
            className="input w-full"
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              setModel("");
            }}
          >
            <option value="">{t("aiSystemDefault")}</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t("aiModel")}
          </label>
          <select
            className="input w-full"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">{t("aiDefaultModel")}</option>
            {(selectedPreset?.models || []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* API Key (optional override) */}
      {selectedPreset?.requiresApiKey && (
        <div>
          <label className="block text-sm font-medium mb-1">
            API Key ({t("aiOptionalOverride")})
          </label>
          <input
            type="password"
            className="input w-full"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("aiUseSystemKey")}
          />
        </div>
      )}

      {/* System Prompt */}
      <div>
        <label className="block text-sm font-medium mb-1">
          System Prompt ({tc("optional")})
        </label>
        <textarea
          className="input w-full"
          rows={2}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful assistant..."
        />
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-sm font-medium mb-1">Prompt</label>
        <textarea
          className="input w-full"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("aiPlaygroundPlaceholder")}
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={loading || !prompt.trim()}
      >
        {loading ? t("aiRunning") : t("aiRunPrompt")}
      </button>

      {error && (
        <div className="bg-error-subtle text-error p-3 rounded-sm text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="card p-4 space-y-3">
          <div className="flex gap-4 text-sm text-muted">
            <span>
              {t("aiProvider")}: <strong>{result.providerId}</strong>
            </span>
            <span>
              {t("aiModel")}: <strong>{result.model}</strong>
            </span>
            <span>
              {t("aiLatency")}: <strong>{result.latencyMs}ms</strong>
            </span>
          </div>
          <div className="border-t pt-3 whitespace-pre-wrap">
            {result.response}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Classifications Panel ───────────────────────

function ClassificationsPanel() {
  const t = useTranslations("admin");
  const [data, setData] = useState<ClassificationListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [overrideTarget, setOverrideTarget] =
    useState<ClassificationItem | null>(null);
  const [overrideType, setOverrideType] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overriding, setOverriding] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getClassifications(page);
      setData(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleOverride() {
    if (!overrideTarget || !overrideType || !overrideReason) return;
    setOverriding(true);
    try {
      await overrideClassification(
        overrideTarget.transactionId,
        overrideType,
        overrideReason,
      );
      setOverrideTarget(null);
      setOverrideType("");
      setOverrideReason("");
      fetchData();
    } catch {
      // ignore
    } finally {
      setOverriding(false);
    }
  }

  if (loading && !data) {
    return <p className="text-muted">{t("loading")}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {data?.stats && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            title={t("aiTotalClassified")}
            value={data.stats.totalClassified}
          />
          <StatCard
            title={t("aiOverridden")}
            value={data.stats.overriddenCount}
          />
          <StatCard
            title={t("aiAvgConfidence")}
            value={`${Math.round(data.stats.avgConfidence * 100)}%`}
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="table w-full text-sm">
          <thead>
            <tr>
              <th>{t("aiClassifiedType")}</th>
              <th>{t("aiCurrentType")}</th>
              <th>{t("aiConfidence")}</th>
              <th>{t("aiModel")}</th>
              <th>{t("aiAssets")}</th>
              <th>{t("aiSource")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((item) => (
              <tr
                key={item.id}
                style={{
                  background: item.overridden
                    ? "var(--bg-warning-subtle, rgba(234,179,8,0.1))"
                    : undefined,
                }}
              >
                <td>{item.classifiedType}</td>
                <td>
                  {item.currentType}
                  {item.overridden && (
                    <span className="ml-1 text-xs text-warning">
                      ({t("aiOverriddenLabel")})
                    </span>
                  )}
                </td>
                <td>
                  <span
                    style={{
                      color:
                        item.confidence >= 0.8
                          ? "var(--text-success)"
                          : item.confidence >= 0.5
                            ? "var(--text-warning)"
                            : "var(--text-error)",
                    }}
                  >
                    {Math.round(item.confidence * 100)}%
                  </span>
                </td>
                <td className="text-xs">
                  {item.model.split("-").slice(-2).join("-")}
                </td>
                <td className="text-xs">
                  {item.sentAsset && `${item.sentAsset}`}
                  {item.sentAsset && item.receivedAsset && " → "}
                  {item.receivedAsset && `${item.receivedAsset}`}
                </td>
                <td className="text-xs">{item.source || "—"}</td>
                <td>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      setOverrideTarget(item);
                      setOverrideType(item.currentType);
                    }}
                  >
                    {t("aiOverride")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          <button
            className="btn btn-sm btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ←
          </button>
          <span className="text-sm text-muted self-center">
            {page} / {data.totalPages}
          </span>
          <button
            className="btn btn-sm btn-secondary"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            →
          </button>
        </div>
      )}

      {/* Override Modal (inline) */}
      {overrideTarget && (
        <div className="card p-4 border-2 border-accent space-y-3">
          <h3 className="font-semibold">
            {t("aiOverrideTitle")}: {overrideTarget.transactionId.slice(0, 8)}
            ...
          </h3>
          <p className="text-sm text-muted">{overrideTarget.reasoning}</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("aiNewType")}
              </label>
              <select
                className="input w-full"
                value={overrideType}
                onChange={(e) => setOverrideType(e.target.value)}
              >
                {[
                  "BUY",
                  "SELL",
                  "TRADE",
                  "DEX_SWAP",
                  "TRANSFER_IN",
                  "TRANSFER_OUT",
                  "AIRDROP",
                  "STAKING_REWARD",
                  "MINING_REWARD",
                  "INTEREST",
                  "NFT_MINT",
                  "NFT_PURCHASE",
                  "NFT_SALE",
                  "WRAP",
                  "UNWRAP",
                  "LP_REWARD",
                  "BRIDGE_IN",
                  "BRIDGE_OUT",
                  "CONTRACT_APPROVAL",
                  "MARGIN_TRADE",
                  "LIQUIDATION",
                  "GIFT_RECEIVED",
                  "GIFT_SENT",
                  "INTERNAL_TRANSFER",
                ].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("aiOverrideReason")}
              </label>
              <input
                type="text"
                className="input w-full"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t("aiReasonPlaceholder")}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={handleOverride}
              disabled={overriding || !overrideReason}
            >
              {overriding ? t("loading") : t("aiConfirmOverride")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setOverrideTarget(null)}
            >
              {tc("cancel")}
            </button>
          </div>
        </div>
      )}

      {data?.items.length === 0 && (
        <p className="text-muted text-center py-8">
          {t("aiNoClassifications")}
        </p>
      )}
    </div>
  );
}

// ─── Cost Panel ──────────────────────────────────

function CostPanel() {
  const t = useTranslations("admin");
  const [data, setData] = useState<CostSummary | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAiCostSummary(days)
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading && !data) {
    return <p className="text-muted">{t("loading")}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Time range */}
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`btn btn-sm ${days === d ? "btn-primary" : "btn-secondary"}`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title={t("aiTotalCalls")} value={data.totalCalls} />
          <StatCard
            title={t("totalClassifications")}
            value={data.totalClassifications}
          />
          <StatCard title={t("totalChats")} value={data.totalChats} />
          <StatCard
            title={t("aiEstimatedCost")}
            value={`$${data.estimatedCostUsd.toFixed(2)}`}
          />
        </div>
      )}

      {/* Daily cost chart */}
      {data && data.dailyBreakdown.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3">{t("aiDailyCost")}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.dailyBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="classifications"
                stackId="1"
                fill="var(--accent)"
                stroke="var(--accent)"
                name={t("totalClassifications")}
              />
              <Area
                type="monotone"
                dataKey="chats"
                stackId="1"
                fill="var(--color-purple, #8b5cf6)"
                stroke="var(--color-purple, #8b5cf6)"
                name={t("totalChats")}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top users table */}
      {data && data.topUsers.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3">{t("aiTopUsers")}</h3>
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th>{t("email")}</th>
                <th>{t("totalClassifications")}</th>
                <th>{t("totalChats")}</th>
                <th>{t("aiEstimatedCost")}</th>
              </tr>
            </thead>
            <tbody>
              {data.topUsers.map((u) => (
                <tr key={u.userId}>
                  <td>{u.email}</td>
                  <td>{u.classifications}</td>
                  <td>{u.chats}</td>
                  <td>${u.estimatedCostUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Step 3:** 五步审计 + 提交

```bash
git commit -m "feat(web): add AI tools page with playground, classifications, cost monitor"
```

---

## Task 5: i18n — 新增翻译键 × 7 语言

**Files:**

- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/zh-Hant.json`
- Modify: `apps/web/messages/es.json`
- Modify: `apps/web/messages/ja.json`
- Modify: `apps/web/messages/ko.json`
- Modify: `apps/web/messages/pt.json`

**Context:**

- 所有 admin 相关键在 `"admin"` 命名空间内
- 新增约 35 个键

**键列表 (en):**

```json
{
  "navAiTools": "AI Tools",
  "aiToolsTitle": "AI Operations Console",
  "aiToolsSubtitle": "Test models, review classifications, and monitor AI costs",
  "aiTab_playground": "Playground",
  "aiTab_classifications": "Classifications",
  "aiTab_costs": "Cost Monitor",
  "aiProvider": "Provider",
  "aiModel": "Model",
  "aiSystemDefault": "System Default",
  "aiDefaultModel": "Default Model",
  "aiOptionalOverride": "optional override",
  "aiUseSystemKey": "Leave empty to use system key",
  "aiPlaygroundPlaceholder": "Enter your test prompt here...",
  "aiRunning": "Running...",
  "aiRunPrompt": "Run",
  "aiLatency": "Latency",
  "aiTotalClassified": "Total Classified",
  "aiOverridden": "Overridden",
  "aiAvgConfidence": "Avg Confidence",
  "aiClassifiedType": "AI Type",
  "aiCurrentType": "Current Type",
  "aiConfidence": "Confidence",
  "aiAssets": "Assets",
  "aiSource": "Source",
  "aiOverride": "Override",
  "aiOverriddenLabel": "overridden",
  "aiOverrideTitle": "Override Classification",
  "aiNewType": "New Type",
  "aiOverrideReason": "Reason",
  "aiReasonPlaceholder": "Why is this classification incorrect?",
  "aiConfirmOverride": "Confirm Override",
  "aiNoClassifications": "No AI classifications found",
  "aiTotalCalls": "Total AI Calls",
  "aiEstimatedCost": "Est. Cost",
  "aiDailyCost": "Daily AI Usage",
  "aiTopUsers": "Top Users by AI Usage"
}
```

每种语言需要翻译这 35 个键。中文、日文、韩文、西班牙文、葡萄牙文、繁体中文各一份。

**Step 1:** 五步审计 + 提交

```bash
git commit -m "feat(i18n): add AI tools admin keys × 7 locales"
```

---

## Task 6: 五步审计 + 最终验证

**Step 1:** 五步法审计

```bash
# Step 1: tsc API
npx tsc --noEmit -p apps/api/tsconfig.json

# Step 2: tsc Web
npx tsc --noEmit -p apps/web/tsconfig.json

# Step 3: API tests
pnpm --filter @dtax/api test

# Step 4: JSON validation
for f in apps/web/messages/*.json; do python3 -m json.tool "$f" > /dev/null && echo "✅ $f" || echo "❌ $f"; done

# Step 5: next build
pnpm --filter @dtax/web build
```

**Step 2:** 重启服务端验证

```bash
# 重启 API + Web
pkill -f "tsx watch" && pkill -f "next dev"
pnpm --filter @dtax/api dev &
WATCHPACK_POLLING=true pnpm --filter @dtax/web dev &
```

**Step 3:** 手动验证

- 访问 http://localhost:3000/zh/admin/ai-tools
- 测试 Playground: 选择 provider, 输入 prompt, 查看响应和延迟
- 测试分类审核: 查看列表，尝试 override
- 测试成本监控: 切换时间范围，查看图表
- 验证导航标签在所有 admin 页面可见
