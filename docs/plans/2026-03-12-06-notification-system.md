# 应用内通知系统 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现应用内通知系统，让用户在关键操作完成（导入完成、税务计算完成、价格异常、wash sale 提醒）时收到及时反馈。

**Architecture:** 后端使用 Prisma 存储通知记录，API 提供 CRUD + 标记已读。前端在 Nav 中显示通知铃铛 + 下拉列表。未来可扩展为邮件/推送通知。轮询模式（30秒间隔），避免 WebSocket 复杂度。

**Tech Stack:** Prisma (Notification model), Fastify (API), Next.js (UI component)

---

### Task 1: Prisma Schema — Notification 模型

**Files:**

- Modify: `apps/api/prisma/schema.prisma`

**Step 1: 添加 Notification 模型**

```prisma
model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  type      NotificationType
  title     String
  message   String
  data      Json?    // 附加数据（如 txCount, reportId 等）
  readAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId, readAt])
  @@index([userId, createdAt])
}

enum NotificationType {
  IMPORT_COMPLETE
  TAX_CALCULATED
  WASH_SALE_DETECTED
  PRICE_ALERT
  QUOTA_WARNING
  SYSTEM
}
```

在 User 模型中添加: `notifications Notification[]`

**Step 2: Run migration**

Run: `cd apps/api && npx prisma migrate dev --name add-notification-model`

**Step 3: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(db): add Notification model for in-app notifications"
```

---

### Task 2: Notification Service

**Files:**

- Create: `apps/api/src/lib/notification.ts`
- Test: `apps/api/src/__tests__/notification.test.ts`

**Step 1: Write the failing test**

```typescript
describe("Notification Service", () => {
  it("should create a notification", async () => {
    const notif = await createNotification({
      userId: "test-user",
      type: "IMPORT_COMPLETE",
      title: "Import Complete",
      message: "Successfully imported 50 transactions from Coinbase",
      data: { transactionCount: 50, source: "Coinbase" },
    });
    expect(notif.id).toBeDefined();
    expect(notif.readAt).toBeNull();
  });

  it("should get unread count", async () => {
    const count = await getUnreadCount("test-user");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("should mark notification as read", async () => {
    await markAsRead("notif-id", "test-user");
    // Verify readAt is set
  });

  it("should mark all as read", async () => {
    await markAllAsRead("test-user");
    const count = await getUnreadCount("test-user");
    expect(count).toBe(0);
  });
});
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement**

```typescript
// apps/api/src/lib/notification.ts
import { prisma } from "./prisma.js";

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({ data: input });
}

export async function getNotifications(
  userId: string,
  limit: number = 20,
  offset: number = 0,
) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add apps/api/src/lib/notification.ts apps/api/src/__tests__/notification.test.ts
git commit -m "feat(api): add notification service with CRUD operations"
```

---

### Task 3: Notification API Routes

**Files:**

- Create: `apps/api/src/routes/notifications.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: 实现端点**

- `GET /notifications` — 分页列表 + 未读数
- `POST /notifications/:id/read` — 标记单条已读
- `POST /notifications/read-all` — 标记全部已读
- `DELETE /notifications/:id` — 删除通知

**Step 2: 注册路由**

**Step 3: 添加 OpenAPI schema**

**Step 4: Commit**

```bash
git add apps/api/src/routes/notifications.ts apps/api/src/index.ts
git commit -m "feat(api): add notification API routes"
```

---

### Task 4: 在关键操作中触发通知

**Files:**

- Modify: `apps/api/src/routes/import.ts` (导入完成 → IMPORT_COMPLETE)
- Modify: `apps/api/src/routes/tax.ts` (计算完成 → TAX_CALCULATED, wash sale → WASH_SALE_DETECTED)

**Step 1: 在 CSV 导入成功后创建通知**

```typescript
// import.ts — 导入成功后
await createNotification({
  userId: request.userId,
  type: "IMPORT_COMPLETE",
  title: "Import Complete",
  message: `Successfully imported ${count} transactions from ${sourceName}`,
  data: { transactionCount: count, sourceName },
});
```

**Step 2: 在税务计算完成后创建通知**

**Step 3: 在检测到 wash sale 后创建通知**

**Step 4: Commit**

```bash
git add apps/api/src/routes/import.ts apps/api/src/routes/tax.ts
git commit -m "feat(api): trigger notifications on import, tax calc, and wash sale"
```

---

### Task 5: Web API Client & i18n

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/messages/en.json` / `zh.json`

**Step 1: API 函数**

```typescript
export async function getNotifications(limit = 20) {
  return apiFetch<{ notifications: Notification[]; unreadCount: number }>(
    `/notifications?limit=${limit}`,
  );
}
export async function markNotificationRead(id: string) {
  /* ... */
}
export async function markAllNotificationsRead() {
  /* ... */
}
```

**Step 2: i18n**

```json
"notifications": {
  "title": "Notifications",
  "markAllRead": "Mark all as read",
  "noNotifications": "No notifications",
  "importComplete": "Import complete: {count} transactions from {source}",
  "taxCalculated": "Tax report ready for {year} ({method})",
  "washSaleDetected": "{count} wash sale(s) detected",
  "priceAlert": "Price alert: {asset} is {direction} {percent}%",
  "quotaWarning": "You've used {current} of {limit} transactions"
}
```

**Step 3: Commit**

---

### Task 6: 通知铃铛 UI 组件

**Files:**

- Create: `apps/web/src/app/[locale]/notification-bell.tsx`
- Modify: `apps/web/src/app/[locale]/nav.tsx`

**Step 1: 实现通知铃铛**

在导航栏用户区域添加铃铛图标:

- 未读数 badge（红色圆点 + 数字）
- 点击展开下拉列表（最近 10 条）
- 每条通知可点击跳转（如：点击 TAX_CALCULATED → /tax 页面）
- "Mark all as read" 按钮
- 30 秒轮询刷新未读数

**Step 2: 集成到 nav.tsx**

在用户邮箱显示旁添加 `<NotificationBell />`

**Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/notification-bell.tsx apps/web/src/app/[locale]/nav.tsx
git commit -m "feat(web): add notification bell component with unread badge"
```

---

### Task 7-9: 通知偏好设置 + 邮件通知扩展 + 五步法审计

**Task 7:** 在 Settings 中添加通知偏好开关（每种类型可开关）
**Task 8:** 可选：对重要通知（wash sale、quota warning）同时发送邮件
**Task 9:** 五步法审计

**审计重点:**

- 通知不泄露敏感数据
- 轮询频率合理（不造成 API 压力）
- i18n 完整
- 构建通过
