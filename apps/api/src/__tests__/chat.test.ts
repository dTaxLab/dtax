/**
 * Chat Route Integration Tests
 *
 * Tests chat conversation CRUD + message endpoint with mocked Prisma and chat-service.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "./test-helpers";

// ─── Mocks ──────────────────────────────────────

const mockPrisma = {
  chatConversation: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  chatMessage: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
  },
};

vi.mock("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

const mockChatCompletion = vi.fn();
vi.mock("../lib/chat-service", () => ({
  chatCompletion: (...args: unknown[]) => mockChatCompletion(...args),
}));

// ─── Helpers ────────────────────────────────────

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const CONV_ID = "11111111-1111-1111-1111-111111111111";

async function buildChatApp() {
  const app = buildApp();
  const { chatRoutes } = await import("../routes/chat");
  await app.register(chatRoutes);
  return app;
}

// ─── Tests ──────────────────────────────────────

describe("Chat Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.subscription.findUnique.mockResolvedValue(null); // FREE plan
    mockPrisma.chatMessage.count.mockResolvedValue(0); // no messages today
  });

  describe("POST /chat/conversations", () => {
    it("creates a new conversation", async () => {
      const app = await buildChatApp();
      mockPrisma.chatConversation.create.mockResolvedValueOnce({
        id: CONV_ID,
        userId: TEST_USER_ID,
        title: "Tax question",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/chat/conversations",
        payload: { title: "Tax question" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.title).toBe("Tax question");
      await app.close();
    });

    it("creates with default title if none provided", async () => {
      const app = await buildChatApp();
      mockPrisma.chatConversation.create.mockResolvedValueOnce({
        id: CONV_ID,
        userId: TEST_USER_ID,
        title: "New conversation",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/chat/conversations",
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(mockPrisma.chatConversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ title: "New conversation" }),
      });
      await app.close();
    });
  });

  describe("GET /chat/conversations", () => {
    it("returns paginated conversation list", async () => {
      const app = await buildChatApp();
      mockPrisma.chatConversation.findMany.mockResolvedValueOnce([
        {
          id: CONV_ID,
          title: "My chat",
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { messages: 5 },
        },
      ]);
      mockPrisma.chatConversation.count.mockResolvedValueOnce(1);

      const res = await app.inject({
        method: "GET",
        url: "/chat/conversations?page=1&limit=10",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].messageCount).toBe(5);
      expect(body.meta.total).toBe(1);
      await app.close();
    });
  });

  describe("GET /chat/conversations/:id", () => {
    it("returns conversation with messages", async () => {
      const app = await buildChatApp();
      mockPrisma.chatConversation.findFirst.mockResolvedValueOnce({
        id: CONV_ID,
        userId: TEST_USER_ID,
        title: "My chat",
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Hello",
            toolCalls: null,
            createdAt: new Date(),
          },
        ],
      });

      const res = await app.inject({
        method: "GET",
        url: `/chat/conversations/${CONV_ID}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.messages).toHaveLength(1);
      await app.close();
    });

    it("returns 404 for non-existent conversation", async () => {
      const app = await buildChatApp();
      mockPrisma.chatConversation.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "GET",
        url: `/chat/conversations/${CONV_ID}`,
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("DELETE /chat/conversations/:id", () => {
    it("deletes a conversation", async () => {
      const app = await buildChatApp();
      mockPrisma.chatConversation.findFirst.mockResolvedValueOnce({
        id: CONV_ID,
        userId: TEST_USER_ID,
      });
      mockPrisma.chatConversation.delete.mockResolvedValueOnce({});

      const res = await app.inject({
        method: "DELETE",
        url: `/chat/conversations/${CONV_ID}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.deleted).toBe(true);
      await app.close();
    });
  });

  describe("POST /chat/conversations/:id/messages", () => {
    it("sends message and returns AI response", async () => {
      const app = await buildChatApp();

      // Conversation exists
      mockPrisma.chatConversation.findFirst.mockResolvedValueOnce({
        id: CONV_ID,
        userId: TEST_USER_ID,
      });

      // No existing messages
      mockPrisma.chatMessage.findMany.mockResolvedValueOnce([]);

      // Save user message
      mockPrisma.chatMessage.create
        .mockResolvedValueOnce({
          id: "msg-user",
          role: "user",
          content: "What is FIFO?",
          createdAt: new Date(),
        })
        // Save assistant message
        .mockResolvedValueOnce({
          id: "msg-ai",
          role: "assistant",
          content: "FIFO stands for First In, First Out...",
          toolCalls: null,
          createdAt: new Date(),
        });

      // Mock AI response
      mockChatCompletion.mockResolvedValueOnce({
        content: "FIFO stands for First In, First Out...",
        toolCalls: [],
      });

      // Update conversation
      mockPrisma.chatConversation.update.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: `/chat/conversations/${CONV_ID}/messages`,
        payload: { content: "What is FIFO?" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.userMessage.content).toBe("What is FIFO?");
      expect(body.data.assistantMessage.content).toContain("FIFO");
      await app.close();
    });

    it("rejects when chat quota exceeded (FREE plan)", async () => {
      const app = await buildChatApp();

      mockPrisma.chatConversation.findFirst.mockResolvedValueOnce({
        id: CONV_ID,
        userId: TEST_USER_ID,
      });

      // 5 messages today → quota exceeded
      mockPrisma.chatMessage.count.mockResolvedValueOnce(5);

      const res = await app.inject({
        method: "POST",
        url: `/chat/conversations/${CONV_ID}/messages`,
        payload: { content: "Another question" },
      });

      expect(res.statusCode).toBe(429);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("CHAT_QUOTA_EXCEEDED");
      await app.close();
    });

    it("returns 404 for non-existent conversation", async () => {
      const app = await buildChatApp();
      mockPrisma.chatConversation.findFirst.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: `/chat/conversations/${CONV_ID}/messages`,
        payload: { content: "Hello" },
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
