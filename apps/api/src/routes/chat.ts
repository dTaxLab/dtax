/**
 * Chat Routes — AI Tax Assistant
 *
 * POST   /chat/conversations              — Create conversation
 * GET    /chat/conversations              — List conversations (paginated)
 * GET    /chat/conversations/:id          — Get conversation with messages
 * DELETE /chat/conversations/:id          — Delete conversation
 * POST   /chat/conversations/:id/messages — Send message (returns AI response)
 * POST   /chat/conversations/:id/messages/stream — Send message (SSE streaming)
 */

import { FastifyInstance } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  chatCompletion,
  chatCompletionStream,
  type ChatMessage,
} from "../lib/chat-service";
import { checkChatQuota } from "../plugins/plan-guard";
import { errorResponseSchema, idParamSchema } from "../schemas/common";

const messageSchema = z
  .object({
    id: z.string().uuid(),
    role: z.string().openapi({ description: "user or assistant" }),
    content: z.string(),
    toolCalls: z.any().optional(),
    createdAt: z.date(),
  })
  .openapi({ ref: "ChatMessage" });

const conversationSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi({ ref: "Conversation" });

const conversationDetailSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    messages: z.array(messageSchema),
  })
  .openapi({ ref: "ConversationDetail" });

const conversationListItemSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    messageCount: z.number().int(),
  })
  .openapi({ ref: "ConversationListItem" });

export async function chatRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // POST /chat/conversations — create new conversation
  r.post(
    "/chat/conversations",
    {
      schema: {
        tags: ["ai"],
        operationId: "createConversation",
        description: "Create a new chat conversation",
        body: z.object({
          title: z.string().max(200).optional(),
        }),
        response: {
          200: z.object({
            data: conversationSchema.extend({ userId: z.string().uuid() }),
          }),
        },
      },
    },
    async (request) => {
      const body = request.body;

      const conversation = await prisma.chatConversation.create({
        data: {
          userId: request.userId,
          title: body.title || "New conversation",
        },
      });

      return { data: conversation };
    },
  );

  // GET /chat/conversations — list user's conversations
  r.get(
    "/chat/conversations",
    {
      schema: {
        tags: ["ai"],
        operationId: "listConversations",
        description: "List user's chat conversations (paginated)",
        querystring: z.object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
        response: {
          200: z.object({
            data: z.array(conversationListItemSchema),
            meta: z.object({
              page: z.number().int(),
              limit: z.number().int(),
              total: z.number().int(),
              totalPages: z.number().int(),
            }),
          }),
        },
      },
    },
    async (request) => {
      const query = request.query;

      const [conversations, total] = await Promise.all([
        prisma.chatConversation.findMany({
          where: { userId: request.userId },
          orderBy: { updatedAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { messages: true } },
          },
        }),
        prisma.chatConversation.count({
          where: { userId: request.userId },
        }),
      ]);

      return {
        data: conversations.map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          messageCount: c._count.messages,
        })),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    },
  );

  // GET /chat/conversations/:id — get conversation with messages
  r.get(
    "/chat/conversations/:id",
    {
      schema: {
        tags: ["ai"],
        operationId: "getConversation",
        description: "Get a conversation with all its messages",
        params: idParamSchema,
        response: {
          200: z.object({
            data: conversationDetailSchema,
          }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const conversation = await prisma.chatConversation.findFirst({
        where: { id, userId: request.userId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              toolCalls: true,
              createdAt: true,
            },
          },
        },
      });

      if (!conversation) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Conversation not found" },
        });
      }

      return { data: conversation };
    },
  );

  // DELETE /chat/conversations/:id
  r.delete(
    "/chat/conversations/:id",
    {
      schema: {
        tags: ["ai"],
        operationId: "deleteConversation",
        description: "Delete a chat conversation",
        params: idParamSchema,
        response: {
          200: z.object({ data: z.object({ deleted: z.boolean() }) }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const conversation = await prisma.chatConversation.findFirst({
        where: { id, userId: request.userId },
      });

      if (!conversation) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Conversation not found" },
        });
      }

      await prisma.chatConversation.delete({ where: { id } });

      return { data: { deleted: true } };
    },
  );

  // POST /chat/conversations/:id/messages — send message, get AI response
  r.post(
    "/chat/conversations/:id/messages",
    {
      schema: {
        tags: ["ai"],
        operationId: "sendChatMessage",
        description: "Send a message and get AI response",
        params: idParamSchema,
        body: z.object({
          content: z.string().min(1).max(10000),
        }),
        response: {
          200: z.object({
            data: z.object({
              userMessage: messageSchema,
              assistantMessage: messageSchema,
            }),
          }),
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const conversation = await prisma.chatConversation.findFirst({
        where: { id, userId: request.userId },
      });

      if (!conversation) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Conversation not found" },
        });
      }

      const quota = await checkChatQuota(request.userId);
      if (!quota.allowed) {
        return reply.status(429).send({
          error: {
            code: "CHAT_QUOTA_EXCEEDED",
            message: `Free plan allows ${quota.limit} messages per day. Upgrade to PRO for unlimited.`,
            current: quota.current,
            limit: quota.limit,
          },
        });
      }

      const existingMessages = await prisma.chatMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      });

      const chatMessages: ChatMessage[] = [
        ...existingMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: body.content },
      ];

      const userMessage = await prisma.chatMessage.create({
        data: {
          conversationId: id,
          role: "user",
          content: body.content,
        },
      });

      const aiResponse = await chatCompletion(chatMessages, {
        userId: request.userId,
      });

      const assistantMessage = await prisma.chatMessage.create({
        data: {
          conversationId: id,
          role: "assistant",
          content: aiResponse.content,
          toolCalls:
            aiResponse.toolCalls.length > 0
              ? (JSON.parse(JSON.stringify(aiResponse.toolCalls)) as object)
              : undefined,
        },
      });

      if (existingMessages.length === 0) {
        const title =
          body.content.length > 60
            ? body.content.slice(0, 57) + "..."
            : body.content;
        await prisma.chatConversation.update({
          where: { id },
          data: { title },
        });
      }

      await prisma.chatConversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      return {
        data: {
          userMessage: {
            id: userMessage.id,
            role: userMessage.role,
            content: userMessage.content,
            createdAt: userMessage.createdAt,
          },
          assistantMessage: {
            id: assistantMessage.id,
            role: assistantMessage.role,
            content: assistantMessage.content,
            toolCalls: assistantMessage.toolCalls,
            createdAt: assistantMessage.createdAt,
          },
        },
      };
    },
  );

  // POST /chat/conversations/:id/messages/stream — SSE streaming message
  r.post(
    "/chat/conversations/:id/messages/stream",
    {
      schema: {
        tags: ["ai"],
        operationId: "streamChatMessage",
        description: "Send a message and get AI response via SSE stream",
        params: idParamSchema,
        body: z.object({ content: z.string().min(1).max(10000) }),
        response: {
          200: z
            .object({
              event: z.string(),
              data: z.unknown(),
            })
            .openapi({ description: "Server-Sent Events stream" }),
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const conversation = await prisma.chatConversation.findFirst({
        where: { id, userId: request.userId },
      });
      if (!conversation) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Conversation not found" },
        });
      }

      const quota = await checkChatQuota(request.userId);
      if (!quota.allowed) {
        return reply.status(429).send({
          error: {
            code: "CHAT_QUOTA_EXCEEDED",
            message: `Free plan allows ${quota.limit} messages per day. Upgrade to PRO for unlimited.`,
            current: quota.current,
            limit: quota.limit,
          },
        });
      }

      const existingMessages = await prisma.chatMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      });

      const chatMessages: ChatMessage[] = [
        ...existingMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: body.content },
      ];

      const userMessage = await prisma.chatMessage.create({
        data: { conversationId: id, role: "user", content: body.content },
      });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      reply.raw.write(
        `event: user_message\ndata: ${JSON.stringify({ id: userMessage.id })}\n\n`,
      );

      const gen = chatCompletionStream(chatMessages, {
        userId: request.userId,
      });

      let finalContent = "";
      let finalToolCalls: Array<{
        name: string;
        input: Record<string, unknown>;
      }> = [];

      for await (const ev of gen) {
        reply.raw.write(
          `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`,
        );

        if (ev.event === "done") {
          finalContent = (
            ev.data as {
              content: string;
              toolCalls: Array<{
                name: string;
                input: Record<string, unknown>;
              }>;
            }
          ).content;
          finalToolCalls = (
            ev.data as {
              content: string;
              toolCalls: Array<{
                name: string;
                input: Record<string, unknown>;
              }>;
            }
          ).toolCalls;
        } else if (ev.event === "error") {
          finalContent =
            (ev.data as { message: string }).message || "An error occurred.";
        }
      }

      const assistantMessage = await prisma.chatMessage.create({
        data: {
          conversationId: id,
          role: "assistant",
          content: finalContent,
          toolCalls:
            finalToolCalls.length > 0
              ? (JSON.parse(JSON.stringify(finalToolCalls)) as object)
              : undefined,
        },
      });

      reply.raw.write(
        `event: saved\ndata: ${JSON.stringify({ assistantMessageId: assistantMessage.id })}\n\n`,
      );

      if (existingMessages.length === 0) {
        const title =
          body.content.length > 60
            ? body.content.slice(0, 57) + "..."
            : body.content;
        await prisma.chatConversation.update({
          where: { id },
          data: { title },
        });
      }

      await prisma.chatConversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      reply.raw.end();
    },
  );
}
