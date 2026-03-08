# Phase 6: Authentication + Admin Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add JWT authentication, replace all hardcoded TEMP_USER_ID with real user context, add admin role + admin endpoints, and harden security.

**Architecture:** Fastify `@fastify/jwt` plugin for stateless JWT auth. A `preHandler` hook decorates `request.userId` and `request.userRole` from token. All existing routes extract userId from request instead of constant. Admin routes gated by role check. Password hashed with bcrypt.

**Tech Stack:** @fastify/jwt, bcryptjs, Prisma schema updates (password, role fields)

---

## Task BB: Auth Infrastructure — JWT Middleware + userId Extraction

**Goal:** Create auth middleware that decorates every request with `userId` and `userRole`. Replace TEMP_USER_ID in all 6 route files.

**Files:**
- Create: `apps/api/src/plugins/auth.ts`
- Modify: `apps/api/src/config.ts` (add JWT_SECRET)
- Modify: `apps/api/src/index.ts` (register auth plugin)
- Modify: `apps/api/prisma/schema.prisma` (add passwordHash, role to User)
- Modify: `apps/api/src/routes/transactions.ts` (replace TEMP_USER_ID)
- Modify: `apps/api/src/routes/import.ts` (replace TEMP_USER_ID)
- Modify: `apps/api/src/routes/tax.ts` (replace TEMP_USER_ID)
- Modify: `apps/api/src/routes/connections.ts` (replace TEMP_USER_ID)
- Modify: `apps/api/src/routes/transfers.ts` (replace TEMP_USER_ID)
- Modify: `apps/api/src/routes/portfolio.ts` (replace TEMP_USER_ID)
- Modify: `apps/api/src/__tests__/test-helpers.ts` (add auth mock)

**Step 1: Install dependencies**

```bash
cd apps/api && pnpm add @fastify/jwt bcryptjs && pnpm add -D @types/bcryptjs
```

**Step 2: Update Prisma schema — add passwordHash and role to User**

In `apps/api/prisma/schema.prisma`, update User model:

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  name         String?
  role         UserRole @default(USER)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  // Relations
  dataSources  DataSource[]
  transactions Transaction[]
  taxLots      TaxLot[]
  taxReports   TaxReport[]

  @@map("users")
}

enum UserRole {
  USER
  ADMIN
}
```

Run: `cd apps/api && npx prisma generate`

**Step 3: Add JWT_SECRET to config**

In `apps/api/src/config.ts`:

```typescript
export const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '3001', 10),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
} as const;
```

**Step 4: Create auth plugin**

Create `apps/api/src/plugins/auth.ts`:

```typescript
/**
 * Authentication plugin.
 * Registers @fastify/jwt, decorates request with userId/userRole,
 * and provides authenticate preHandler hook.
 */

import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';

// Extend Fastify types
declare module 'fastify' {
    interface FastifyRequest {
        userId: string;
        userRole: string;
    }
}

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: { sub: string; role: string };
        user: { sub: string; role: string };
    }
}

async function authPlugin(app: FastifyInstance) {
    await app.register(jwt, {
        secret: config.jwtSecret,
        sign: { expiresIn: '7d' },
    });

    // Decorate request with defaults
    app.decorateRequest('userId', '');
    app.decorateRequest('userRole', '');

    // Auth hook — skips health and auth routes
    app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        const url = request.url;

        // Public routes — no auth required
        if (url.startsWith('/api/health') ||
            url.startsWith('/api/v1/auth/')) {
            return;
        }

        try {
            const decoded = await request.jwtVerify();
            request.userId = decoded.sub;
            request.userRole = decoded.role;
        } catch {
            return reply.status(401).send({
                error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' },
            });
        }
    });
}

export default fp(authPlugin, { name: 'auth' });
```

Also install fastify-plugin: `pnpm add fastify-plugin`

**Step 5: Register auth plugin in index.ts**

In `apps/api/src/index.ts`, after multipart registration (line 78), add:

```typescript
import authPlugin from './plugins/auth';
// ... after multipart registration:
await app.register(authPlugin);
```

**Step 6: Replace TEMP_USER_ID in all 6 route files**

In each route file, delete the `const TEMP_USER_ID = ...` line and replace all usages of `TEMP_USER_ID` with `request.userId`.

Files and patterns:
- `transactions.ts:48` → delete line. Lines 60,90,107,132,155,187,205,230 → `request.userId`
- `import.ts:33` → delete line. Lines 107,146,155 → `request.userId`
- `tax.ts:13` → delete line. Lines 32,40,155,164,281,290 → `request.userId`
- `connections.ts:12` → delete line. Lines 50,70,82 → `request.userId`
- `transfers.ts:15` → delete line. Lines 24,83,125 → `request.userId`
- `portfolio.ts:12` → delete line. Lines 38,47 → `request.userId`

**Step 7: Update test helpers**

In `apps/api/src/__tests__/test-helpers.ts`, add auth mock to `buildApp()`:

```typescript
/** Creates a Fastify app with mocked auth (no DB, no plugins) */
export function buildApp() {
    const app = Fastify({ logger: false });

    // Mock auth — decorate request with test user
    app.decorateRequest('userId', '');
    app.decorateRequest('userRole', '');
    app.addHook('onRequest', async (request) => {
        request.userId = '00000000-0000-0000-0000-000000000001';
        request.userRole = 'USER';
    });

    // ... existing error handler ...
}
```

**Step 8: Build & test**

```bash
cd /Users/ericw/project/dtax
npx prisma generate (from apps/api)
npx turbo build
npx turbo test
```

Expected: All 204 tests pass, build succeeds.

**Step 9: Commit**

```bash
git add -A && git commit -m "feat(api): JWT auth middleware + replace TEMP_USER_ID with request.userId"
```

---

## Task CC: Auth Routes — Register + Login + Me

**Goal:** Create `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/me` endpoints.

**Files:**
- Create: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/index.ts` (register auth routes)
- Create: `apps/api/src/__tests__/auth.test.ts`

**Step 1: Create auth routes**

Create `apps/api/src/routes/auth.ts`:

```typescript
/**
 * Authentication routes.
 * POST /auth/register — Create account
 * POST /auth/login    — Get JWT token
 * GET  /auth/me       — Get current user
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
    // POST /auth/register
    app.post('/auth/register', async (request, reply) => {
        const body = registerSchema.parse(request.body);

        const existing = await prisma.user.findUnique({ where: { email: body.email } });
        if (existing) {
            return reply.status(409).send({
                error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
            });
        }

        const passwordHash = await bcrypt.hash(body.password, 12);
        const user = await prisma.user.create({
            data: { email: body.email, passwordHash, name: body.name },
        });

        const token = app.jwt.sign({ sub: user.id, role: user.role });

        return reply.status(201).send({
            data: { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } },
        });
    });

    // POST /auth/login
    app.post('/auth/login', async (request, reply) => {
        const body = loginSchema.parse(request.body);

        const user = await prisma.user.findUnique({ where: { email: body.email } });
        if (!user) {
            return reply.status(401).send({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
            });
        }

        const valid = await bcrypt.compare(body.password, user.passwordHash);
        if (!valid) {
            return reply.status(401).send({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
            });
        }

        const token = app.jwt.sign({ sub: user.id, role: user.role });

        return { data: { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } } };
    });

    // GET /auth/me — requires auth (not in public path list)
    app.get('/auth/me', async (request) => {
        const user = await prisma.user.findUnique({
            where: { id: request.userId },
            select: { id: true, email: true, name: true, role: true, createdAt: true },
        });

        return { data: user };
    });
}
```

Note: `/auth/register` and `/auth/login` are public (auth plugin skips `/api/v1/auth/` paths). `/auth/me` requires moving it outside the skip path OR checking manually. Better approach: make the skip pattern only match `/api/v1/auth/register` and `/api/v1/auth/login`.

Update auth plugin public routes check:
```typescript
if (url.startsWith('/api/health') ||
    url === '/api/v1/auth/register' ||
    url === '/api/v1/auth/login') {
    return;
}
```

**Step 2: Register auth routes in index.ts**

```typescript
import { authRoutes } from './routes/auth';
// ... with other route registrations:
await app.register(authRoutes, { prefix: '/api/v1' });
```

**Step 3: Write tests for auth routes**

Create `apps/api/src/__tests__/auth.test.ts` with mocked Prisma + bcrypt tests for register, login, duplicate email, wrong password, /me endpoint.

**Step 4: Build & test**

```bash
npx turbo build && npx turbo test
```

**Step 5: Commit**

```bash
git commit -m "feat(api): auth routes — register, login, me endpoints"
```

---

## Task DD: Web Auth — Login Page + Token Management + Protected Layout

**Goal:** Add login/register page, store JWT in cookie/localStorage, inject auth header in API client, protect all pages.

**Files:**
- Create: `apps/web/src/app/[locale]/auth/page.tsx`
- Create: `apps/web/src/lib/auth-context.tsx`
- Modify: `apps/web/src/lib/api.ts` (inject Authorization header)
- Modify: `apps/web/src/app/[locale]/layout.tsx` (wrap with AuthProvider)
- Modify: `apps/web/src/app/[locale]/nav.tsx` (add login/logout)
- Modify: `apps/web/messages/en.json` + `zh.json` (auth i18n keys)

**Step 1: Create auth context provider**

`apps/web/src/lib/auth-context.tsx` — React context that stores token + user, provides login/logout/register functions, persists to localStorage.

**Step 2: Update API client**

In `apps/web/src/lib/api.ts`, modify `apiFetch` to read token from localStorage and add `Authorization: Bearer <token>` header.

**Step 3: Create login/register page**

`apps/web/src/app/[locale]/auth/page.tsx` — Tab-switched form (Login / Register), calls auth API, redirects on success.

**Step 4: Protect layout**

In `layout.tsx`, wrap children with `AuthProvider`. If no token, redirect to `/auth`.

**Step 5: Update nav**

Add user email display + logout button to nav.

**Step 6: Add i18n keys**

Add `auth.*` keys to both en.json and zh.json.

**Step 7: Build & test**

```bash
npx turbo build --filter=@dtax/web
```

**Step 8: Commit**

```bash
git commit -m "feat(web): login/register page + auth context + protected routes"
```

---

## Task EE: Admin Role + Admin API Endpoints

**Goal:** Add admin-only endpoints for user management and system overview.

**Files:**
- Create: `apps/api/src/plugins/admin-guard.ts`
- Create: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/index.ts` (register admin routes)

**Step 1: Create admin guard**

`apps/api/src/plugins/admin-guard.ts` — Fastify preHandler that checks `request.userRole === 'ADMIN'`, returns 403 otherwise.

**Step 2: Create admin routes**

`apps/api/src/routes/admin.ts`:
- `GET /admin/users` — List all users (paginated)
- `GET /admin/users/:id` — Get user detail with stats
- `PATCH /admin/users/:id/role` — Change user role
- `GET /admin/stats` — System overview (total users, transactions, data sources)
- `DELETE /admin/users/:id` — Soft-delete user

All routes use admin guard preHandler.

**Step 3: Register routes, build, test, commit**

---

## Task FF: Encryption Hardening

**Goal:** Replace weak DATABASE_URL-derived encryption key with proper ENCRYPTION_KEY env var.

**Files:**
- Modify: `apps/api/src/config.ts` (add encryptionKey)
- Modify: `apps/api/src/services/ccxt.ts` (use config.encryptionKey)

**Step 1: Add ENCRYPTION_KEY to config**

```typescript
encryptionKey: process.env.ENCRYPTION_KEY || config.databaseUrl.slice(0, 32).padEnd(32, '0'),
```

**Step 2: Update ccxt.ts to use config**

Replace line 12 derivation with `Buffer.from(config.encryptionKey)`.

**Step 3: Build, test, commit**

---

## Task GG: Rate Limiting + Audit Logging

**Goal:** Add rate limiting middleware and basic audit logging.

**Files:**
- Create: `apps/api/src/plugins/rate-limit.ts`
- Modify: `apps/api/prisma/schema.prisma` (add AuditLog model)
- Create: `apps/api/src/plugins/audit-log.ts`
- Modify: `apps/api/src/index.ts` (register plugins)

**Step 1: Install @fastify/rate-limit**

```bash
pnpm add @fastify/rate-limit
```

**Step 2: Create rate limit plugin**

Global: 100 req/min. Auth routes: 10 req/min.

**Step 3: Add AuditLog model**

```prisma
model AuditLog {
  id        String   @id @default(uuid())
  userId    String?  @map("user_id")
  action    String   // e.g., "LOGIN", "CREATE_TRANSACTION", "DELETE_TRANSACTION"
  resource  String?  // e.g., "transaction:uuid"
  ip        String?
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt])
  @@map("audit_logs")
}
```

**Step 4: Create audit log plugin — onResponse hook**

Logs POST/PUT/DELETE requests to AuditLog table.

**Step 5: Build, test, commit**

---

## Execution Order & Dependencies

```
BB (Auth middleware) ← foundation for everything
  ↓
CC (Auth routes) ← depends on BB
  ↓
DD (Web auth UI) ← depends on CC
  ↓
EE (Admin routes) ← depends on BB+CC
  ↓
FF (Encryption) ← independent, can be done after BB
  ↓
GG (Rate limit + Audit) ← independent, can be done after BB
```

Tasks FF and GG are independent and can run in parallel after BB.
