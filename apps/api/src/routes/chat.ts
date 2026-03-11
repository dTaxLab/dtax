/**
 * Chat Routes — AI Tax Assistant
 *
 * POST   /chat/conversations              — Create conversation
 * GET    /chat/conversations              — List conversations (paginated)
 * GET    /chat/conversations/:id          — Get conversation with messages
 * DELETE /chat/conversations/:id          — Delete conversation
 * POST   /chat/conversations/:id/messages — Send message (returns AI response)
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { chatCompletion, type ChatMessage } from "../lib/chat-service";
import { checkChatQuota } from "../plugins/plan-guard";

export async function chatRoutes(app: FastifyInstance) {
  // POST /chat/conversations — create new conversation
  app.post("/chat/conversations", async (request) => {
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
  });

  // GET /chat/conversations — list user's conversations
  app.get("/chat/conversations", async (request) => {
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
  });

  // GET /chat/conversations/:id — get conversation with messages
  app.get("/chat/conversations/:id", async (request, reply) => {
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
      return reply
        .status(404)
        .send({
          error: { code: "NOT_FOUND", message: "Conversation not found" },
        });
    }

    return { data: conversation };
  });

  // DELETE /chat/conversations/:id
  app.delete("/chat/conversations/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const conversation = await prisma.chatConversation.findFirst({
      where: { id, userId: request.userId },
    });

    if (!conversation) {
      return reply
        .status(404)
        .send({
          error: { code: "NOT_FOUND", message: "Conversation not found" },
        });
    }

    await prisma.chatConversation.delete({ where: { id } });

    return { data: { deleted: true } };
  });

  // POST /chat/conversations/:id/messages — send message, get AI response
  app.post("/chat/conversations/:id/messages", async (request, reply) => {
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
      return reply
        .status(404)
        .send({
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
  });
}
