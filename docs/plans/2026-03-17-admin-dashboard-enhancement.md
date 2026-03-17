# Admin Dashboard Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform dTax's minimal admin panel into a production-ready SaaS management system with role hierarchy, revenue analytics, user lifecycle management, AI configuration, and system settings.

**Architecture:** Extend existing Fastify API routes + Prisma schema for backend; extend Next.js admin pages + settings page for frontend. Three-tier admin roles (SUPER_ADMIN > ADMIN > SUPPORT) with role-level middleware. SystemConfig table for dynamic settings (AI, maintenance, announcements). UTM tracking captured at registration.

**Tech Stack:** Fastify + Prisma + PostgreSQL (API), Next.js 14 + next-intl (Web), Vitest (tests), Zod-OpenAPI (schemas)

---

## Task 1: Database Schema — Role Hierarchy, User Status, UTM, SystemConfig

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/YYYYMMDD_admin_enhancement/migration.sql` (auto-generated)

**Step 1: Update Prisma schema**

In `apps/api/prisma/schema.prisma`, make these changes:

1a. Expand `UserRole` enum (line ~58):

```prisma
enum UserRole {
  USER
  SUPPORT
  ADMIN
  SUPER_ADMIN
}
```

1b. Add `UserStatus` enum after `UserRole`:

```prisma
enum UserStatus {
  ACTIVE
  SUSPENDED
  BANNED
}
```

1c. Add fields to `User` model (after `role` field, line ~27):

```prisma
  status        UserStatus @default(ACTIVE)
  lastLoginAt   DateTime?
  utmSource     String?
  utmMedium     String?
  utmCampaign   String?
  referrerUrl   String?
```

1d. Add `SystemConfig` model at end of schema:

```prisma
model SystemConfig {
  id        String   @id @default(uuid())
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt
  updatedBy String?

  @@index([key])
}
```

**Step 2: Generate and run migration**

```bash
cd apps/api && npx prisma migrate dev --name admin_enhancement
```

**Step 3: Update seed data**

In `apps/api/prisma/seed.ts`, change dev user role from `ADMIN` to `SUPER_ADMIN`:

```typescript
role: "SUPER_ADMIN",
```

**Step 4: Run tests to verify no regressions**

```bash
pnpm test
```

**Step 5: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(db): add role hierarchy, user status, UTM fields, SystemConfig model"
```

---

## Task 2: Auth Middleware — Role Level Guards

**Files:**

- Modify: `apps/api/src/plugins/auth.ts`
- Modify: `apps/api/src/routes/admin.ts` (adminGuard → role-level guard)
- Modify: `apps/api/src/__tests__/admin.test.ts`

**Step 1: Create role-level constants and guard in auth.ts**

Add after JWT registration (after line ~35):

```typescript
/** Role hierarchy levels — higher number = more privileges */
export const ROLE_LEVEL: Record<string, number> = {
  USER: 0,
  SUPPORT: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Create a route-level guard that requires minimum role level.
 * Usage: { onRequest: [requireRole("ADMIN")] }
 */
export function requireRole(minRole: "SUPPORT" | "ADMIN" | "SUPER_ADMIN") {
  const minLevel = ROLE_LEVEL[minRole] ?? 0;
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userLevel = ROLE_LEVEL[request.userRole] ?? 0;
    if (userLevel < minLevel) {
      return reply.status(403).send({
        data: null,
        error: { message: "Forbidden", code: "FORBIDDEN" },
      });
    }
  };
}
```

**Step 2: Update admin.ts to use requireRole**

Replace the existing `adminGuard` function (lines 23-29) with import:

```typescript
import { requireRole } from "../plugins/auth";
```

Replace all `onRequest: [adminGuard]` hooks:

- Stats, users list, user detail → `requireRole("SUPPORT")` (read-only)
- Role change → `requireRole("ADMIN")`
- New system settings routes (later) → `requireRole("SUPER_ADMIN")`

For role change endpoint, add additional guard: ADMIN cannot promote to SUPER_ADMIN, only SUPER_ADMIN can:

```typescript
if (body.role === "SUPER_ADMIN" && request.userRole !== "SUPER_ADMIN") {
  return reply.status(403).send({
    data: null,
    error: {
      message: "Only SUPER_ADMIN can promote to SUPER_ADMIN",
      code: "FORBIDDEN",
    },
  });
}
```

**Step 3: Update role change schema to accept new roles**

```typescript
const roleChangeSchema = z.object({
  role: z.enum(["USER", "SUPPORT", "ADMIN", "SUPER_ADMIN"]),
});
```

**Step 4: Update tests**

In `admin.test.ts`, update role decorator to use SUPER_ADMIN for test setup and add tests:

- SUPPORT can access stats (200)
- SUPPORT cannot change roles (403)
- ADMIN can change role to SUPPORT/ADMIN but not SUPER_ADMIN (403)
- SUPER_ADMIN can change any role

**Step 5: Run tests and commit**

```bash
pnpm test
git add apps/api/src/ apps/api/prisma/
git commit -m "feat(auth): add role-level guards (SUPPORT/ADMIN/SUPER_ADMIN)"
```

---

## Task 3: UTM Capture — Registration Flow

**Files:**

- Modify: `apps/api/src/routes/auth.ts` (register endpoint)
- Modify: `apps/web/src/app/[locale]/auth/page.tsx` (register form)
- Modify: `apps/web/src/lib/api.ts` (register function)

**Step 1: Extend register schema in auth.ts**

Add optional UTM fields to `registerSchema` (line ~29):

```typescript
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  referrerUrl: z.string().optional(),
});
```

**Step 2: Save UTM in register handler**

In the `prisma.user.create()` call (line ~198), add UTM fields:

```typescript
const user = await prisma.user.create({
  data: {
    email: body.email,
    passwordHash: hash,
    name: body.name || null,
    utmSource: body.utmSource || null,
    utmMedium: body.utmMedium || null,
    utmCampaign: body.utmCampaign || null,
    referrerUrl: body.referrerUrl || null,
  },
});
```

**Step 3: Update lastLoginAt on login**

In the login endpoint handler, after successful JWT generation, add:

```typescript
await prisma.user.update({
  where: { id: user.id },
  data: { lastLoginAt: new Date() },
});
```

**Step 4: Update frontend register function in api.ts**

Update `register()` function to accept UTM params:

```typescript
export async function register(
  email: string,
  password: string,
  name?: string,
  utmSource?: string,
  utmMedium?: string,
  utmCampaign?: string,
  referrerUrl?: string,
): Promise<AuthResponse> {
  return apiFetch("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      name,
      utmSource,
      utmMedium,
      utmCampaign,
      referrerUrl,
    }),
  });
}
```

**Step 5: Capture UTM in auth page**

In `apps/web/src/app/[locale]/auth/page.tsx`, read UTM from URL on mount:

```typescript
import { useSearchParams } from "next/navigation";

// Inside component:
const searchParams = useSearchParams();
const utmSource = searchParams.get("utm_source") || undefined;
const utmMedium = searchParams.get("utm_medium") || undefined;
const utmCampaign = searchParams.get("utm_campaign") || undefined;
const referrerUrl =
  typeof document !== "undefined" ? document.referrer || undefined : undefined;

// In handleRegister:
const res = await register(
  email,
  password,
  name,
  utmSource,
  utmMedium,
  utmCampaign,
  referrerUrl,
);
```

**Step 6: Run tests and commit**

```bash
pnpm test
git add apps/api/src/routes/auth.ts apps/web/src/app/*/auth/page.tsx apps/web/src/lib/api.ts
git commit -m "feat(auth): capture UTM params and referrer on registration, track lastLoginAt"
```

---

## Task 4: Admin API — User Management Enhanced

**Files:**

- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/__tests__/admin.test.ts`

**Step 1: Add user status management endpoint**

New endpoint `PATCH /admin/users/:id/status`:

```typescript
// Schema
const statusChangeSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
  reason: z.string().optional(),
});

// Handler — requires ADMIN role
fastify.patch(
  "/admin/users/:id/status",
  {
    schema: {
      body: statusChangeSchema,
      params: z.object({ id: z.string().uuid() }),
    },
    onRequest: [requireRole("ADMIN")],
  },
  async (request, reply) => {
    const { id } = request.params;
    const { status, reason } = request.body;

    // Cannot change own status
    if (id === request.userId) {
      return reply.status(400).send({
        data: null,
        error: {
          message: "Cannot change own status",
          code: "SELF_STATUS_CHANGE",
        },
      });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status },
    });

    // Log admin action
    await prisma.auditLog.create({
      data: {
        userId: request.userId,
        action: "UPDATE",
        entityType: "User",
        entityId: id,
        details: { field: "status", newValue: status, reason },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] || "",
      },
    });

    return { data: user, error: null };
  },
);
```

**Step 2: Enhance user detail response**

Update `GET /admin/users/:id` to include subscription, lastLoginAt, UTM, status, emailVerified:

```typescript
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    email: true,
    name: true,
    role: true,
    status: true,
    emailVerified: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
    utmSource: true,
    utmMedium: true,
    utmCampaign: true,
    referrerUrl: true,
    subscription: {
      select: {
        plan: true,
        status: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
      },
    },
    _count: {
      select: {
        transactions: true,
        dataSources: true,
        taxLots: true,
        taxReports: true,
      },
    },
  },
});
```

**Step 3: Add manual subscription management endpoint**

New endpoint `PATCH /admin/users/:id/subscription` — requires SUPER_ADMIN:

```typescript
const subscriptionChangeSchema = z.object({
  plan: z.enum(["FREE", "PRO", "CPA"]),
  reason: z.string().optional(),
});

// Upsert subscription for user
fastify.patch(
  "/admin/users/:id/subscription",
  {
    schema: {
      body: subscriptionChangeSchema,
      params: z.object({ id: z.string().uuid() }),
    },
    onRequest: [requireRole("SUPER_ADMIN")],
  },
  async (request, reply) => {
    const { id } = request.params;
    const { plan, reason } = request.body;

    const subscription = await prisma.subscription.upsert({
      where: { userId: id },
      update: { plan, status: "active" },
      create: {
        userId: id,
        plan,
        status: "active",
        taxYear: new Date().getFullYear(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: request.userId,
        action: "SUBSCRIPTION_CHANGE",
        entityType: "Subscription",
        entityId: subscription.id,
        details: { userId: id, newPlan: plan, reason, adminAction: true },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] || "",
      },
    });

    return { data: subscription, error: null };
  },
);
```

**Step 4: Add global audit log endpoint**

New endpoint `GET /admin/audit` — requires ADMIN:

```typescript
fastify.get(
  "/admin/audit",
  {
    schema: {
      querystring: z.object({
        userId: z.string().uuid().optional(),
        action: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(50),
        offset: z.coerce.number().min(0).default(0),
      }),
    },
    onRequest: [requireRole("ADMIN")],
  },
  async (request) => {
    const { userId, action, from, to, limit, offset } = request.query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { data: { logs: data, total }, error: null };
  },
);
```

**Step 5: Add tests for new endpoints and commit**

Add tests: status change (200, 400 self, 403 support), subscription management (200, 403 admin), global audit (200).

```bash
pnpm test
git add apps/api/
git commit -m "feat(admin): user status management, manual subscription, global audit log"
```

---

## Task 5: Admin API — Analytics & Revenue Endpoints

**Files:**

- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/__tests__/admin.test.ts`

**Step 1: Add revenue analytics endpoint**

New endpoint `GET /admin/analytics/revenue` — requires ADMIN:

```typescript
fastify.get(
  "/admin/analytics/revenue",
  {
    onRequest: [requireRole("ADMIN")],
  },
  async () => {
    const subscriptions = await prisma.subscription.groupBy({
      by: ["plan"],
      where: { status: "active" },
      _count: true,
    });

    const planCounts: Record<string, number> = { FREE: 0, PRO: 0, CPA: 0 };
    for (const s of subscriptions) planCounts[s.plan] = s._count;

    // MRR: PRO=$49/12, CPA=$499/12
    const mrr = (planCounts.PRO * 49 + planCounts.CPA * 499) / 12;

    return {
      data: {
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(mrr * 12 * 100) / 100,
        planDistribution: planCounts,
        totalPaying: planCounts.PRO + planCounts.CPA,
      },
      error: null,
    };
  },
);
```

**Step 2: Add user funnel endpoint**

New endpoint `GET /admin/analytics/funnel` — requires ADMIN:

```typescript
fastify.get(
  "/admin/analytics/funnel",
  {
    onRequest: [requireRole("ADMIN")],
  },
  async () => {
    const [totalUsers, verifiedUsers, usersWithData, payingUsers] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { emailVerified: true } }),
        prisma.user.count({ where: { dataSources: { some: {} } } }),
        prisma.subscription.count({
          where: { plan: { in: ["PRO", "CPA"] }, status: "active" },
        }),
      ]);

    return {
      data: {
        registered: totalUsers,
        verified: verifiedUsers,
        imported: usersWithData,
        paid: payingUsers,
      },
      error: null,
    };
  },
);
```

**Step 3: Add recent registrations endpoint**

New endpoint `GET /admin/analytics/registrations` — requires ADMIN:

```typescript
fastify.get(
  "/admin/analytics/registrations",
  {
    schema: {
      querystring: z.object({
        days: z.coerce.number().min(1).max(90).default(30),
      }),
    },
    onRequest: [requireRole("ADMIN")],
  },
  async (request) => {
    const since = new Date();
    since.setDate(since.getDate() - request.query.days);

    const users = await prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        utmSource: true,
        utmMedium: true,
        emailVerified: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Source aggregation
    const sourceCount: Record<string, number> = {};
    for (const u of users) {
      const src = u.utmSource || "direct";
      sourceCount[src] = (sourceCount[src] || 0) + 1;
    }

    return {
      data: { users, sourceDistribution: sourceCount, total: users.length },
      error: null,
    };
  },
);
```

**Step 4: Add product insights endpoint**

New endpoint `GET /admin/analytics/insights` — requires ADMIN:

```typescript
fastify.get(
  "/admin/analytics/insights",
  {
    onRequest: [requireRole("ADMIN")],
  },
  async (request) => {
    // Top exchanges by import count
    const topExchanges = await prisma.dataSource.groupBy({
      by: ["format"],
      _count: true,
      orderBy: { _count: { format: "desc" } },
      take: 10,
    });

    // Feature usage from audit logs
    const featureUsage = await prisma.auditLog.groupBy({
      by: ["action"],
      _count: true,
      orderBy: { _count: { action: "desc" } },
    });

    return {
      data: {
        topExchanges: topExchanges.map((e) => ({
          format: e.format,
          count: e._count,
        })),
        featureUsage: featureUsage.map((f) => ({
          action: f.action,
          count: f._count,
        })),
      },
      error: null,
    };
  },
);
```

**Step 5: Add tests and commit**

```bash
pnpm test
git add apps/api/
git commit -m "feat(admin): revenue analytics, user funnel, registration sources, product insights"
```

---

## Task 6: Admin API — System Settings (AI Config, Maintenance, Announcements)

**Files:**

- Create: `apps/api/src/routes/system.ts`
- Modify: `apps/api/src/index.ts` (register new route)

**Step 1: Create system settings routes**

Create `apps/api/src/routes/system.ts`:

```typescript
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../plugins/auth";

/**
 * System configuration routes.
 * Config keys: "ai_config", "maintenance_mode", "registration_open", "announcement"
 */
export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = fastify.prisma;

  // GET /system/config — Read all system configs (ADMIN+)
  fastify.get(
    "/system/config",
    {
      onRequest: [requireRole("ADMIN")],
    },
    async () => {
      const configs = await prisma.systemConfig.findMany();
      const result: Record<string, any> = {};
      for (const c of configs) result[c.key] = c.value;
      return { data: result, error: null };
    },
  );

  // GET /system/config/:key — Read single config (ADMIN+)
  fastify.get(
    "/system/config/:key",
    {
      schema: { params: z.object({ key: z.string() }) },
      onRequest: [requireRole("ADMIN")],
    },
    async (request, reply) => {
      const config = await prisma.systemConfig.findUnique({
        where: { key: request.params.key },
      });
      if (!config)
        return reply
          .status(404)
          .send({
            data: null,
            error: { message: "Config not found", code: "NOT_FOUND" },
          });
      return { data: config.value, error: null };
    },
  );

  // PUT /system/config/:key — Upsert config (SUPER_ADMIN only)
  fastify.put(
    "/system/config/:key",
    {
      schema: {
        params: z.object({ key: z.string() }),
        body: z.object({ value: z.any() }),
      },
      onRequest: [requireRole("SUPER_ADMIN")],
    },
    async (request) => {
      const { key } = request.params;
      const { value } = request.body;

      const config = await prisma.systemConfig.upsert({
        where: { key },
        update: { value, updatedBy: request.userId },
        create: { key, value, updatedBy: request.userId },
      });

      await prisma.auditLog.create({
        data: {
          userId: request.userId,
          action: "SETTINGS_CHANGE",
          entityType: "SystemConfig",
          entityId: config.id,
          details: { key, value },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] || "",
        },
      });

      return { data: config.value, error: null };
    },
  );

  // GET /system/status — Public endpoint for maintenance mode check (no auth)
  fastify.get("/system/status", async () => {
    const maintenance = await prisma.systemConfig.findUnique({
      where: { key: "maintenance_mode" },
    });
    const announcement = await prisma.systemConfig.findUnique({
      where: { key: "announcement" },
    });

    return {
      data: {
        maintenance: (maintenance?.value as any)?.enabled ?? false,
        maintenanceMessage: (maintenance?.value as any)?.message ?? null,
        announcement: (announcement?.value as any)?.enabled
          ? (announcement?.value as any)?.message
          : null,
      },
      error: null,
    };
  });
};
```

**Step 2: Register route in index.ts**

Add to route registration section:

```typescript
import { systemRoutes } from "./routes/system";
fastify.register(systemRoutes, { prefix: "/api/v1" });
```

Add `/api/v1/system/status` to auth whitelist in `auth.ts`.

**Step 3: Add tests and commit**

```bash
pnpm test
git add apps/api/src/
git commit -m "feat(api): system config routes for AI, maintenance mode, announcements"
```

---

## Task 7: Frontend API Client — New Admin Types & Functions

**Files:**

- Modify: `apps/web/src/lib/api.ts`

**Step 1: Add new TypeScript interfaces**

```typescript
// Enhanced admin user detail
export interface AdminUserDetailV2 {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerUrl: string | null;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    stripeCustomerId: string | null;
  } | null;
  _count: {
    transactions: number;
    dataSources: number;
    taxLots: number;
    taxReports: number;
  };
}

export interface RevenueAnalytics {
  mrr: number;
  arr: number;
  planDistribution: Record<string, number>;
  totalPaying: number;
}

export interface FunnelData {
  registered: number;
  verified: number;
  imported: number;
  paid: number;
}

export interface RegistrationData {
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    utmSource: string | null;
    utmMedium: string | null;
    emailVerified: boolean;
  }>;
  sourceDistribution: Record<string, number>;
  total: number;
}

export interface ProductInsights {
  topExchanges: Array<{ format: string; count: number }>;
  featureUsage: Array<{ action: string; count: number }>;
}

export interface SystemConfig {
  ai_config?: {
    classificationModel: string;
    chatModel: string;
    apiKeyConfigured: boolean;
    monthlyBudget: number | null;
    quotaFree: number;
    quotaPro: number;
    quotaCpa: number;
  };
  maintenance_mode?: { enabled: boolean; message: string };
  registration_open?: { enabled: boolean };
  announcement?: { enabled: boolean; message: string; type: string };
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, any>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { email: string; name: string | null };
}
```

**Step 2: Add new API functions**

```typescript
// User status
export async function updateUserStatus(
  userId: string,
  status: string,
  reason?: string,
) {
  return apiFetch(`/api/v1/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
}

// Manual subscription
export async function updateUserSubscription(
  userId: string,
  plan: string,
  reason?: string,
) {
  return apiFetch(`/api/v1/admin/users/${userId}/subscription`, {
    method: "PATCH",
    body: JSON.stringify({ plan, reason }),
  });
}

// Global audit log
export async function getAdminAuditLogs(params: {
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: { logs: AuditLogEntry[]; total: number } }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined) qs.set(k, String(v));
  return apiFetch(`/api/v1/admin/audit?${qs}`);
}

// Analytics
export async function getRevenueAnalytics(): Promise<{
  data: RevenueAnalytics;
}> {
  return apiFetch("/api/v1/admin/analytics/revenue");
}

export async function getFunnelData(): Promise<{ data: FunnelData }> {
  return apiFetch("/api/v1/admin/analytics/funnel");
}

export async function getRegistrationData(
  days?: number,
): Promise<{ data: RegistrationData }> {
  return apiFetch(
    `/api/v1/admin/analytics/registrations${days ? `?days=${days}` : ""}`,
  );
}

export async function getProductInsights(): Promise<{ data: ProductInsights }> {
  return apiFetch("/api/v1/admin/analytics/insights");
}

// System config
export async function getSystemConfig(): Promise<{ data: SystemConfig }> {
  return apiFetch("/api/v1/system/config");
}

export async function updateSystemConfig(key: string, value: any) {
  return apiFetch(`/api/v1/system/config/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export async function getSystemStatus(): Promise<{
  data: {
    maintenance: boolean;
    maintenanceMessage: string | null;
    announcement: string | null;
  };
}> {
  return apiFetch("/api/v1/system/status");
}
```

**Step 3: Run type check and commit**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add admin analytics, system config, user management API types and functions"
```

---

## Task 8: Admin Frontend — Dashboard Overhaul

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/page.tsx`
- Modify: `apps/web/messages/en.json` (admin section)
- Modify: `apps/web/messages/zh.json` (admin section)
- Modify: `apps/web/messages/zh-Hant.json`, `ja.json`, `ko.json`, `es.json`, `pt.json`

**Step 1: Rewrite admin dashboard page**

Replace the admin page with enhanced version:

- Role check: `SUPPORT`, `ADMIN`, or `SUPER_ADMIN` (not just ADMIN)
- Stats cards: existing 6 + MRR card + conversion rate card
- User funnel: 4-step horizontal bar (registered → verified → imported → paid)
- Recent registrations: table with source column
- Quick links: Users, Audit Log, Analytics, System Settings (conditional on role)
- Navigation tabs at top for sub-pages

**Key layout:**

```
┌─────────────────────────────────────────────────┐
│ Admin Dashboard          [Users] [Audit] [Settings]  │
├────────┬────────┬────────┬────────┬────────┬────────┤
│ Users  │ MRR    │ PRO    │ CPA    │ Tx     │ Conv%  │
│ 1,234  │ $892   │ 45     │ 8      │ 98,765 │ 3.2%   │
├────────┴────────┴────────┴────────┴────────┴────────┤
│ User Funnel                                          │
│ Registered (1234) → Verified (890) → Imported (456) → Paid (53)  │
├──────────────────────────────────────────────────────│
│ Recent Registrations (last 7 days)                   │
│ Email         | Source  | Verified | Date             │
│ user@...      | github  | ✓        | 2026-03-17       │
└──────────────────────────────────────────────────────┘
```

**Step 2: Add admin nav component**

Create navigation links at top of admin layout (shared by all admin pages):

- Dashboard → `/admin`
- Users → `/admin/users`
- Audit Log → `/admin/audit` (ADMIN+)
- Analytics → `/admin/analytics` (ADMIN+)
- System → `/admin/system` (SUPER_ADMIN only)

**Step 3: Add i18n keys to all 7 locales**

New keys needed:

```
admin.mrr, admin.arr, admin.conversionRate
admin.funnel, admin.funnelRegistered, admin.funnelVerified, admin.funnelImported, admin.funnelPaid
admin.recentRegistrations, admin.source, admin.verified
admin.navDashboard, admin.navUsers, admin.navAudit, admin.navAnalytics, admin.navSystem
admin.status, admin.active, admin.suspended, admin.banned
admin.subscription, admin.lastLogin, admin.utmSource
admin.manageSubscription, admin.changePlan, admin.suspendUser, admin.banUser, admin.activateUser
admin.systemSettings, admin.maintenance, admin.announcements, admin.aiConfig, admin.registrationToggle
```

**Step 4: Run build and commit**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
pnpm --filter @dtax/web build
git add apps/web/
git commit -m "feat(admin): enhanced dashboard with MRR, funnel, recent registrations, role-based nav"
```

---

## Task 9: Admin Frontend — User Management Enhanced

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/users/page.tsx`

**Step 1: Enhance user list table**

Add columns:

- Status badge (ACTIVE=green, SUSPENDED=yellow, BANNED=red)
- Plan badge (FREE=gray, PRO=blue, CPA=purple)
- Last login date
- Registration source (utmSource or "direct")

**Step 2: Enhance user detail expansion**

When expanded, show:

- Subscription details (plan, status, period end, Stripe link)
- UTM tracking info (source, medium, campaign, referrer)
- Email verification status
- Last login timestamp
- Action buttons:
  - Change Status (Active/Suspended/Banned) — requires ADMIN
  - Change Plan (FREE/PRO/CPA) — requires SUPER_ADMIN
  - Change Role — requires ADMIN (existing, update for new roles)

**Step 3: Add confirmation modals**

- Status change modal with optional reason field
- Subscription change modal with reason field
- Both log admin action via audit

**Step 4: Run build and commit**

```bash
pnpm --filter @dtax/web build
git add apps/web/
git commit -m "feat(admin): enhanced user management with status, subscription, UTM display"
```

---

## Task 10: Admin Frontend — Analytics Page

**Files:**

- Create: `apps/web/src/app/[locale]/admin/analytics/page.tsx`

**Step 1: Create analytics page**

Layout:

```
┌──────────────────────────────────────────────────┐
│ Analytics Dashboard                               │
├──────────┬──────────┬──────────┬─────────────────┤
│ MRR      │ ARR      │ Paying   │ Conversion      │
│ $892.33  │ $10,708  │ 53       │ 3.2%            │
├──────────┴──────────┴──────────┴─────────────────┤
│ Subscription Distribution                         │
│ ████████████████████ FREE (1181)                  │
│ █████ PRO (45)                                    │
│ █ CPA (8)                                         │
├──────────────────────────────────────────────────┤
│ Registration Sources (30 days)                    │
│ direct: 45 | github: 23 | blog: 12 | google: 8  │
├──────────────────────────────────────────────────┤
│ Top Exchanges          │ Feature Usage             │
│ 1. Binance (234)       │ CALCULATE (1,234)         │
│ 2. Coinbase (189)      │ IMPORT (890)              │
│ 3. Etherscan (123)     │ EXPORT (456)              │
│ 4. Kraken (98)         │ AI_CLASSIFY (234)         │
└──────────────────────────────────────────────────┘
```

Use simple CSS bar charts (no external charting library — YAGNI).

**Step 2: Add i18n keys and commit**

```bash
pnpm --filter @dtax/web build
git add apps/web/
git commit -m "feat(admin): analytics page with revenue, sources, exchanges, feature usage"
```

---

## Task 11: Admin Frontend — Global Audit Log Page

**Files:**

- Create: `apps/web/src/app/[locale]/admin/audit/page.tsx`

**Step 1: Create audit log page**

Features:

- Filter by: user email (search), action type (dropdown), date range
- Table: Timestamp | User | Action | Entity | Details | IP
- Pagination (50 per page)
- Admin actions highlighted with accent color
- Requires ADMIN role

**Step 2: Add i18n keys and commit**

```bash
pnpm --filter @dtax/web build
git add apps/web/
git commit -m "feat(admin): global audit log page with filters and pagination"
```

---

## Task 12: Admin Frontend — System Settings Page

**Files:**

- Create: `apps/web/src/app/[locale]/admin/system/page.tsx`

**Step 1: Create system settings page**

Requires SUPER_ADMIN. Sections:

**AI Configuration:**

- Classification model selector (dropdown: claude-haiku-4-5, claude-sonnet-4-6)
- Chat model selector (dropdown: claude-haiku-4-5, claude-sonnet-4-6)
- Monthly budget input ($)
- Plan quotas: FREE/PRO/CPA daily chat limits
- Display: AI usage stats (if available from audit logs)

**Maintenance Mode:**

- Toggle switch
- Maintenance message textarea
- Preview banner

**Registration:**

- Toggle switch (open/closed)

**System Announcement:**

- Toggle switch
- Message textarea
- Type selector (info/warning/urgent)
- Preview banner

All changes save via `PUT /system/config/:key` and log to audit.

**Step 2: Add i18n keys and commit**

```bash
pnpm --filter @dtax/web build
git add apps/web/
git commit -m "feat(admin): system settings page with AI config, maintenance, announcements"
```

---

## Task 13: User Settings — AI Preferences & Notifications

**Files:**

- Modify: `apps/web/src/app/[locale]/settings/page.tsx`
- Modify: `apps/api/src/routes/auth.ts` (user preferences endpoint)

**Step 1: Add user preferences API endpoint**

In auth.ts, add `PATCH /auth/preferences`:

```typescript
const preferencesSchema = z.object({
  chatModel: z.enum(["fast", "smart"]).optional(),
  autoClassify: z.boolean().optional(),
  defaultMethod: z.string().optional(),
  jurisdiction: z.string().optional(),
  displayCurrency: z.string().optional(),
  emailNotifications: z.boolean().optional(),
});
```

Store as JSON in a new `preferences` Json field on User model (or use SystemConfig per-user).

**Step 2: Add AI Preferences section to settings page**

After the existing Preferences section, add:

- Chat model: "Fast (Haiku)" / "Smart (Sonnet)" radio buttons
- Auto-classify toggle: on/off switch
- Jurisdiction dropdown: US, DE, FR, JP, UK, AU, CA, KR, IN, etc.
- Display currency: USD, EUR, GBP, JPY, AUD, CAD, KRW

**Step 3: Add notification preferences section**

- Email notifications master toggle
- Sub-toggles: import complete, report ready, subscription expiring

**Step 4: Add i18n keys to all 7 locales and commit**

```bash
pnpm test
pnpm --filter @dtax/web build
git add apps/web/ apps/api/
git commit -m "feat(settings): AI preferences, jurisdiction, display currency, notification toggles"
```

---

## Summary

| Task | Description                              | Priority | Role Required |
| ---- | ---------------------------------------- | -------- | ------------- |
| 1    | Schema: roles, status, UTM, SystemConfig | P0       | —             |
| 2    | Auth middleware: role-level guards       | P0       | —             |
| 3    | UTM capture: registration flow           | P0       | —             |
| 4    | Admin API: user mgmt enhanced            | P0       | ADMIN+        |
| 5    | Admin API: analytics endpoints           | P0       | ADMIN+        |
| 6    | Admin API: system settings               | P0       | SUPER_ADMIN   |
| 7    | Frontend: API types & functions          | P0       | —             |
| 8    | Frontend: dashboard overhaul             | P0       | SUPPORT+      |
| 9    | Frontend: user mgmt enhanced             | P0       | ADMIN+        |
| 10   | Frontend: analytics page                 | P0       | ADMIN+        |
| 11   | Frontend: audit log page                 | P0       | ADMIN+        |
| 12   | Frontend: system settings page           | P0       | SUPER_ADMIN   |
| 13   | User settings: AI + notifications        | P0       | USER+         |

**Execution order:** Tasks 1-7 are backend/infrastructure (must be sequential). Tasks 8-12 are frontend admin pages (can be sequential). Task 13 is independent user settings.
