/**
 * Chat Service 单元测试
 * 测试 Claude API 对话集成、tool use 循环、graceful degradation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config before imports
vi.mock("../config", () => ({
  config: {
    anthropicApiKey: "",
  },
}));

// Mock prisma
vi.mock("../lib/prisma", () => ({
  prisma: {
    taxReport: { findFirst: vi.fn() },
    transaction: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock @anthropic-ai/sdk
const mockCreate = vi.fn();
const mockStream = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate, stream: mockStream };
    constructor() {}
  },
}));

/** Helper: create a mock stream object that yields events and has finalMessage() */
function createMockStream(
  events: Array<{ type: string; [key: string]: unknown }>,
  finalMsg: { content: Array<{ type: string; [key: string]: unknown }> },
) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    },
    finalMessage: () => Promise.resolve(finalMsg),
  };
}

// Mock tax-engine scanRisks
vi.mock("@dtax/tax-engine", () => ({
  scanRisks: vi.fn().mockReturnValue({
    overallScore: 85,
    summary: { high: 1, medium: 0, low: 0, totalPotentialImpact: 5000 },
    items: [
      {
        category: "missing_cost_basis",
        severity: "high",
        description: "1 disposal missing cost basis",
        suggestedAction: "Import acquisition records",
        potentialTaxImpact: 5000,
        affectedTransactionIds: ["tx-1"],
      },
    ],
  }),
}));

import { config } from "../config";
import { prisma } from "../lib/prisma";
import {
  chatCompletion,
  chatCompletionStream,
  resetChatClient,
  type ChatMessage,
  type StreamEvent,
} from "../lib/chat-service";

const mutableConfig = config as { anthropicApiKey: string };

function textResponse(text: string) {
  return {
    content: [{ type: "text", text }],
  };
}

function toolUseResponse(
  toolName: string,
  input: Record<string, unknown>,
  toolId = "toolu_test",
) {
  return {
    content: [
      {
        type: "tool_use",
        id: toolId,
        name: toolName,
        input,
      },
    ],
  };
}

function toolUseWithTextResponse(
  toolName: string,
  input: Record<string, unknown>,
  text: string,
) {
  return {
    content: [
      { type: "tool_use", id: "toolu_test", name: toolName, input },
      { type: "text", text },
    ],
  };
}

describe("Chat Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChatClient();
    mutableConfig.anthropicApiKey = "";
  });

  afterEach(() => {
    mutableConfig.anthropicApiKey = "";
    resetChatClient();
  });

  describe("chatCompletion", () => {
    it("无 API key 时返回配置提示（graceful degradation）", async () => {
      mutableConfig.anthropicApiKey = "";
      const messages: ChatMessage[] = [
        { role: "user", content: "What are my taxes?" },
      ];

      const result = await chatCompletion(messages, { userId: "user-1" });

      expect(result.content).toContain("ANTHROPIC_API_KEY");
      expect(result.toolCalls).toEqual([]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("简单文本回复（无 tool use）", async () => {
      mutableConfig.anthropicApiKey = "sk-test";
      mockCreate.mockResolvedValueOnce(
        textResponse(
          "Crypto is treated as property by the IRS. Capital gains tax applies.",
        ),
      );

      const messages: ChatMessage[] = [
        { role: "user", content: "How is crypto taxed?" },
      ];
      const result = await chatCompletion(messages, { userId: "user-1" });

      expect(result.content).toContain("property");
      expect(result.toolCalls).toEqual([]);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("使用系统提示和 cache_control", async () => {
      mutableConfig.anthropicApiKey = "sk-test";
      mockCreate.mockResolvedValueOnce(textResponse("Hello!"));

      await chatCompletion([{ role: "user", content: "Hi" }], {
        userId: "user-1",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-6",
          system: expect.arrayContaining([
            expect.objectContaining({
              cache_control: { type: "ephemeral" },
            }),
          ]),
          tools: expect.any(Array),
        }),
      );
    });

    it("tool use: get_tax_summary 有报告", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      // First call: model requests tool
      mockCreate.mockResolvedValueOnce(
        toolUseResponse("get_tax_summary", { year: 2025 }),
      );
      // Second call: model responds with text after tool result
      mockCreate.mockResolvedValueOnce(
        textResponse("Your 2025 tax summary shows $5,000 in short-term gains."),
      );

      // Mock prisma
      (
        prisma.taxReport.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        taxYear: 2025,
        method: "FIFO",
        shortTermGains: 5000,
        shortTermLosses: 200,
        longTermGains: 1000,
        longTermLosses: 0,
        totalIncome: 500,
        totalTransactions: 42,
        status: "COMPLETE",
      });

      const result = await chatCompletion(
        [{ role: "user", content: "Show my 2025 tax summary" }],
        { userId: "user-1" },
      );

      expect(result.content).toContain("$5,000");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("get_tax_summary");
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("tool use: get_tax_summary 无报告", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      mockCreate.mockResolvedValueOnce(
        toolUseResponse("get_tax_summary", { year: 2025 }),
      );
      mockCreate.mockResolvedValueOnce(
        textResponse("You haven't calculated your 2025 taxes yet."),
      );

      (
        prisma.taxReport.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(null);

      const result = await chatCompletion(
        [{ role: "user", content: "My 2025 summary?" }],
        { userId: "user-1" },
      );

      expect(result.content).toContain("haven't calculated");
      expect(result.toolCalls).toHaveLength(1);
    });

    it("tool use: get_transaction_stats", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      mockCreate.mockResolvedValueOnce(
        toolUseResponse("get_transaction_stats", {}),
      );
      mockCreate.mockResolvedValueOnce(
        textResponse("You have 150 transactions total."),
      );

      (prisma.transaction.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(150) // total
        .mockResolvedValueOnce(20); // aiClassified
      (
        prisma.transaction.groupBy as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce([
        { type: "BUY", _count: 80 },
        { type: "SELL", _count: 70 },
      ]);

      const result = await chatCompletion(
        [{ role: "user", content: "How many transactions do I have?" }],
        { userId: "user-1" },
      );

      expect(result.content).toContain("150");
      expect(result.toolCalls[0].name).toBe("get_transaction_stats");
    });

    it("tool use: search_transactions", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      mockCreate.mockResolvedValueOnce(
        toolUseResponse("search_transactions", { asset: "BTC", limit: 5 }),
      );
      mockCreate.mockResolvedValueOnce(
        textResponse("Here are your recent BTC transactions."),
      );

      (
        prisma.transaction.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce([
        {
          id: "tx-1",
          type: "BUY",
          timestamp: new Date("2025-01-15"),
          sentAsset: null,
          sentAmount: null,
          sentValueUsd: null,
          receivedAsset: "BTC",
          receivedAmount: 0.5,
          receivedValueUsd: 45000,
          aiClassified: false,
          notes: null,
        },
      ]);

      const result = await chatCompletion(
        [{ role: "user", content: "Show my BTC transactions" }],
        { userId: "user-1" },
      );

      expect(result.content).toContain("BTC");
      expect(result.toolCalls[0].input).toEqual({ asset: "BTC", limit: 5 });
    });

    it("tool use: get_risk_summary", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      mockCreate.mockResolvedValueOnce(
        toolUseResponse("get_risk_summary", { year: 2025 }),
      );
      mockCreate.mockResolvedValueOnce(
        textResponse("Your risk score is 85/100. One high-risk item found."),
      );

      (
        prisma.transaction.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce([]);

      const result = await chatCompletion(
        [{ role: "user", content: "Run a risk scan for 2025" }],
        { userId: "user-1" },
      );

      expect(result.content).toContain("85");
      expect(result.toolCalls[0].name).toBe("get_risk_summary");
    });

    it("tool use 循环上限 5 次", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      // Return tool use every time (infinite loop scenario)
      mockCreate.mockResolvedValue(
        toolUseResponse("get_transaction_stats", {}),
      );

      (prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(
        0,
      );
      (
        prisma.transaction.groupBy as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const result = await chatCompletion([{ role: "user", content: "test" }], {
        userId: "user-1",
      });

      // Should stop after 5 iterations
      expect(mockCreate).toHaveBeenCalledTimes(5);
      expect(result.toolCalls.length).toBe(5);
    });

    it("传递多轮对话历史", async () => {
      mutableConfig.anthropicApiKey = "sk-test";
      mockCreate.mockResolvedValueOnce(textResponse("Got it."));

      const messages: ChatMessage[] = [
        { role: "user", content: "I use Coinbase" },
        { role: "assistant", content: "Great, Coinbase is supported." },
        { role: "user", content: "What about Binance?" },
      ];

      await chatCompletion(messages, { userId: "user-1" });

      const calledMessages = mockCreate.mock.calls[0][0].messages;
      expect(calledMessages).toHaveLength(3);
      expect(calledMessages[0].role).toBe("user");
      expect(calledMessages[1].role).toBe("assistant");
      expect(calledMessages[2].role).toBe("user");
    });

    it("未知工具返回错误 JSON", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      mockCreate.mockResolvedValueOnce(
        toolUseResponse("unknown_tool", { foo: "bar" }),
      );
      mockCreate.mockResolvedValueOnce(
        textResponse("Sorry, I encountered an error."),
      );

      const result = await chatCompletion([{ role: "user", content: "test" }], {
        userId: "user-1",
      });

      expect(result.toolCalls[0].name).toBe("unknown_tool");
      // The model should still produce a final text response
      expect(result.content).toBeTruthy();
    });
  });

  describe("chatCompletionStream", () => {
    async function collectEvents(
      gen: AsyncGenerator<StreamEvent>,
    ): Promise<StreamEvent[]> {
      const events: StreamEvent[] = [];
      for await (const ev of gen) {
        events.push(ev);
      }
      return events;
    }

    it("无 API key 时 yield error 事件", async () => {
      mutableConfig.anthropicApiKey = "";

      const events = await collectEvents(
        chatCompletionStream([{ role: "user", content: "Hi" }], {
          userId: "user-1",
        }),
      );

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe("error");
      expect((events[0].data as { message: string }).message).toContain(
        "ANTHROPIC_API_KEY",
      );
    });

    it("流式文本回复（无 tool use）", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      const streamEvents = [
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello " },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "world!" },
        },
        { type: "content_block_stop", index: 0 },
      ];
      const finalMsg = {
        content: [{ type: "text", text: "Hello world!" }],
      };

      mockStream.mockReturnValueOnce(createMockStream(streamEvents, finalMsg));

      const events = await collectEvents(
        chatCompletionStream([{ role: "user", content: "Hi" }], {
          userId: "user-1",
        }),
      );

      const textEvents = events.filter((e) => e.event === "text");
      expect(textEvents).toHaveLength(2);
      expect((textEvents[0].data as { chunk: string }).chunk).toBe("Hello ");
      expect((textEvents[1].data as { chunk: string }).chunk).toBe("world!");

      const doneEvent = events.find((e) => e.event === "done");
      expect(doneEvent).toBeDefined();
      expect((doneEvent!.data as { content: string }).content).toBe(
        "Hello world!",
      );
    });

    it("流式 tool use: tool_start → tool_end → 文本", async () => {
      mutableConfig.anthropicApiKey = "sk-test";

      // First stream: tool use
      const stream1Events = [
        {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_1",
            name: "get_transaction_stats",
          },
        },
        { type: "content_block_stop", index: 0 },
      ];
      const final1 = {
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "get_transaction_stats",
            input: {},
          },
        ],
      };

      // Second stream: text response
      const stream2Events = [
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "You have 50 txs." },
        },
        { type: "content_block_stop", index: 0 },
      ];
      const final2 = {
        content: [{ type: "text", text: "You have 50 txs." }],
      };

      mockStream
        .mockReturnValueOnce(createMockStream(stream1Events, final1))
        .mockReturnValueOnce(createMockStream(stream2Events, final2));

      // Mock prisma for tool execution
      (prisma.transaction.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(5);
      (
        prisma.transaction.groupBy as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce([]);

      const events = await collectEvents(
        chatCompletionStream([{ role: "user", content: "Stats?" }], {
          userId: "user-1",
        }),
      );

      const eventTypes = events.map((e) => e.event);
      expect(eventTypes).toContain("tool_start");
      expect(eventTypes).toContain("tool_end");
      expect(eventTypes).toContain("text");
      expect(eventTypes).toContain("done");

      const toolStart = events.find((e) => e.event === "tool_start");
      expect((toolStart!.data as { name: string }).name).toBe(
        "get_transaction_stats",
      );
    });
  });
});
