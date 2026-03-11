# Phase G: AI 税务助手 (Chat) — 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建上下文感知 AI 税务助手，用户可通过对话获得个性化税务建议、解释风险评分、修正交易分类

**Architecture:**

- Claude API streaming 响应 + 工具调用（读取用户数据/执行操作）
- Prisma 持久化对话历史（ChatConversation + ChatMessage）
- 配额系统: FREE=5 条/天, PRO/CPA=无限
- SSE (Server-Sent Events) 实时推送 AI 回复

**Tech Stack:** @anthropic-ai/sdk (streaming), Fastify SSE, Prisma, React state

---

## Task G1: Prisma Schema + Migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/0004_chat/migration.sql`

## Task G2: Chat Service (Claude API + Tools)

**Files:**

- Create: `apps/api/src/lib/chat-service.ts`
- Test: `apps/api/src/__tests__/chat-service.test.ts`

## Task G3: Chat API Routes

**Files:**

- Create: `apps/api/src/routes/chat.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/plugins/plan-guard.ts`
- Test: `apps/api/src/__tests__/chat.test.ts`

## Task G4: Chat Frontend UI

**Files:**

- Create: `apps/web/src/app/[locale]/ai-assistant/page.tsx`
- Create: `apps/web/src/app/[locale]/ai-assistant/chat-input.tsx`
- Create: `apps/web/src/app/[locale]/ai-assistant/message-list.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/messages/en.json` + `zh.json`
- Modify: Nav component (添加 AI Assistant 入口)

---

## 详细实施

### Task G1: Prisma Schema

```prisma
model ChatConversation {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  title     String   @default("New conversation")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages ChatMessage[]

  @@index([userId, createdAt])
  @@map("chat_conversations")
}

model ChatMessage {
  id             String @id @default(uuid())
  conversationId String @map("conversation_id")
  role           String // "user" | "assistant"
  content        String
  toolCalls      Json?  @map("tool_calls")
  createdAt      DateTime @default(now()) @map("created_at")

  conversation ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("chat_messages")
}
```

### Task G2: Chat Service 设计

**系统提示**: 税务专家人设 + 用户上下文注入
**工具定义** (Claude tool use):

1. `get_tax_summary` — 获取用户指定年度税务汇总
2. `get_risk_report` — 运行风险扫描并返回结果
3. `get_transactions` — 搜索用户交易记录
4. `classify_transaction` — 修改交易分类

**流式响应**: `anthropic.messages.stream()` → SSE 推送到前端

### Task G3: API Routes

```
POST   /chat/conversations         — 创建对话
GET    /chat/conversations         — 列表（分页）
GET    /chat/conversations/:id     — 获取对话+消息
DELETE /chat/conversations/:id     — 删除对话
POST   /chat/conversations/:id/messages — 发送消息（SSE 流式响应）
```

### Task G4: Frontend

- 左侧: 对话列表 + 新建按钮
- 右侧: 消息列表 + 输入框
- 流式显示: 逐字渲染 AI 回复
- 工具调用: 显示 "正在查询税务数据..." 等状态
