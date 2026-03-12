# Phase G2: SSE 流式 Chat 响应 — 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 AI 税务助手从同步等待改为 SSE 逐字流式推送，消除用户等待空白期

**Architecture:**

- 后端: Anthropic SDK `.stream()` → Fastify `reply.raw` SSE 推送
- 前端: `fetch()` + `ReadableStream` 解析 SSE（POST 不能用 EventSource）
- 工具调用: 流中暂停 → 服务端执行 → 继续流式输出
- 保留现有非流式端点作为降级方案

**Tech Stack:** @anthropic-ai/sdk streaming, Fastify raw response, ReadableStream API

---

## Task G2.1: Chat Service 流式函数

**Files:**

- Modify: `apps/api/src/lib/chat-service.ts`
- Test: `apps/api/src/__tests__/chat-service.test.ts`

新增 `chatCompletionStream()` 生成器函数，yield SSE 事件：

- `event: text` + `data: {"chunk":"..."}` — 文本片段
- `event: tool_start` + `data: {"name":"get_tax_summary"}` — 工具开始
- `event: tool_end` + `data: {"name":"get_tax_summary"}` — 工具完成
- `event: done` + `data: {"content":"完整文本","toolCalls":[...]}` — 流结束
- `event: error` + `data: {"message":"..."}` — 错误

## Task G2.2: SSE 路由端点

**Files:**

- Modify: `apps/api/src/routes/chat.ts`
- Test: `apps/api/src/__tests__/chat.test.ts`

新增 `POST /chat/conversations/:id/messages/stream` 端点：

- 复用现有验证逻辑（对话归属、配额检查）
- 设置 SSE 头: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- 消费 `chatCompletionStream()` 生成器写入 `reply.raw`
- 流结束后保存消息到 Prisma

## Task G2.3: 前端 SSE 消费

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/[locale]/ai-assistant/page.tsx`
- Modify: `apps/web/src/app/[locale]/ai-assistant/message-list.tsx`

新增 `sendChatMessageStream()` 函数：

- 使用 `fetch()` POST → `response.body.getReader()` 读取 SSE
- 解析 `event:` 和 `data:` 行
- 回调: `onText(chunk)`, `onToolStart(name)`, `onToolEnd(name)`, `onDone(full)`, `onError(msg)`
- 前端实时追加文本到 assistant message state
