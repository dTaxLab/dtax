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
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  chatCompletion,
  chatCompletionStream,
  type ChatMessage,
} from "../lib/chat-service";
import { checkChatQuota } from "../plugins/plan-guard";

export async function chatRoutes(app: FastifyInstance) {
  // POST /chat/conversations — create new conversation
  app.post(
    "/chat/conversations",
    {
      schema: {
        tags: ["chat"],
        summary: "Create a new conversation",
        body: {
          type: "object" as const,
          additionalProperties: true,
          properties: { title: { type: "string" as const } },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: { type: "object" as const, additionalProperties: true },
            },
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
          429: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request) => {
      const body = z
        .object({
          title: z.string().max(200).optional(),
        })
        .parse(request.body ?? {});

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
  app.get(
    "/chat/conversations",
    {
      schema: {
        tags: ["chat"],
        summary: "List conversations (paginated)",
        querystring: {
          type: "object" as const,
          additionalProperties: true,
          properties: {
            page: { type: "integer" as const },
            limit: { type: "integer" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: { type: "array" as const },
              meta: { type: "object" as const, additionalProperties: true },
            },
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
          429: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        })
        .parse(request.query);

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
  app.get(
    "/chat/conversations/:id",
    {
      schema: {
        tags: ["chat"],
        summary: "Get conversation with messages",
        params: {
          type: "object" as const,
          required: ["id"],
          properties: { id: { type: "string" as const } },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: { type: "object" as const, additionalProperties: true },
            },
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
          429: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

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
  app.delete(
    "/chat/conversations/:id",
    {
      schema: {
        tags: ["chat"],
        summary: "Delete a conversation",
        params: {
          type: "object" as const,
          required: ["id"],
          properties: { id: { type: "string" as const } },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: { type: "object" as const, additionalProperties: true },
            },
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
          429: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

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
  app.post(
    "/chat/conversations/:id/messages",
    {
      schema: {
        tags: ["chat"],
        summary: "Send message and get AI response",
        params: {
          type: "object" as const,
          required: ["id"],
          properties: { id: { type: "string" as const } },
        },
        body: {
          type: "object" as const,
          additionalProperties: true,
          required: ["content"],
          properties: { content: { type: "string" as const } },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: { type: "object" as const, additionalProperties: true },
            },
          },
          404: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
          429: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              error: { type: "object" as const, additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

      const body = z
        .object({
          content: z.string().min(1).max(10000),
        })
        .parse(request.body);

      // Verify conversation belongs to user
      const conversation = await prisma.chatConversation.findFirst({
        where: { id, userId: request.userId },
      });

      if (!conversation) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Conversation not found" },
        });
      }

      // Check chat quota
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

      // Load conversation history
      const existingMessages = await prisma.chatMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      });

      // Build message array for Claude
      const chatMessages: ChatMessage[] = [
        ...existingMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: body.content },
      ];

      // Save user message
      const userMessage = await prisma.chatMessage.create({
        data: {
          conversationId: id,
          role: "user",
          content: body.content,
        },
      });

      // Get AI response
      const aiResponse = await chatCompletion(chatMessages, {
        userId: request.userId,
      });

      // Save assistant message
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

      // Auto-generate title from first user message
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

      // Touch conversation updatedAt
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
  app.post(
    "/chat/conversations/:id/messages/stream",
    {
      schema: {
        tags: ["chat"],
        summary: "Send message and stream AI response via SSE",
        params: {
          type: "object" as const,
          required: ["id"],
          properties: { id: { type: "string" as const } },
        },
        body: {
          type: "object" as const,
          additionalProperties: true,
          required: ["content"],
          properties: { content: { type: "string" as const } },
        },
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

      const body = z
        .object({ content: z.string().min(1).max(10000) })
        .parse(request.body);

      // Verify ownership
      const conversation = await prisma.chatConversation.findFirst({
        where: { id, userId: request.userId },
      });
      if (!conversation) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Conversation not found" },
        });
      }

      // Quota check
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

      // Load history
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

      // Save user message immediately
      const userMessage = await prisma.chatMessage.create({
        data: { conversationId: id, role: "user", content: body.content },
      });

      // Set SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Send user message ID as first event
      reply.raw.write(
        `event: user_message\ndata: ${JSON.stringify({ id: userMessage.id })}\n\n`,
      );

      // Stream AI response
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

      // Save assistant message after stream completes
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

      // Send saved message ID
      reply.raw.write(
        `event: saved\ndata: ${JSON.stringify({ assistantMessageId: assistantMessage.id })}\n\n`,
      );

      // Auto-title on first message
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
