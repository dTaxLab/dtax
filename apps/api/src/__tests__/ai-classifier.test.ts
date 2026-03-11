/**
 * AI Classifier 单元测试
 * 测试 Claude API 集成、模型路由、graceful degradation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config before imports
vi.mock("../config", () => ({
  config: {
    anthropicApiKey: "",
  },
}));

// Mock @anthropic-ai/sdk
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    constructor() {}
  },
}));

import { config } from "../config";
import {
  classifyTransaction,
  classifyBatch,
  isSimpleTransaction,
  formatTransactionForPrompt,
  resetClient,
  type ClassificationInput,
} from "../lib/ai-classifier";

const mutableConfig = config as { anthropicApiKey: string };

function mockToolResponse(type: string, confidence: number, reasoning: string) {
  return {
    content: [
      {
        type: "tool_use",
        id: "toolu_test",
        name: "classify_transaction",
        input: { type, confidence, reasoning },
      },
    ],
  };
}

describe("AI Classifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClient();
    mutableConfig.anthropicApiKey = "";
  });

  afterEach(() => {
    mutableConfig.anthropicApiKey = "";
    resetClient();
  });

  describe("classifyTransaction", () => {
    it("无 API key 时返回 null（graceful degradation）", async () => {
      mutableConfig.anthropicApiKey = "";
      const result = await classifyTransaction({
        type: "UNKNOWN",
        sentAsset: "ETH",
        sentAmount: 1.0,
      });
      expect(result).toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("有 API key + CEX 交易使用 Haiku 模型", async () => {
      mutableConfig.anthropicApiKey = "sk-test-key";
      mockCreate.mockResolvedValueOnce(
        mockToolResponse("BUY", 0.95, "Fiat to crypto purchase on Coinbase"),
      );

      const result = await classifyTransaction({
        type: "UNKNOWN",
        receivedAsset: "BTC",
        receivedAmount: 0.5,
        source: "coinbase",
      });

      expect(result).not.toBeNull();
      expect(result!.classifiedType).toBe("BUY");
      expect(result!.model).toBe("claude-haiku-4-5-20251001");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-haiku-4-5-20251001",
        }),
      );
    });

    it("有 API key + DeFi 交易使用 Sonnet 模型", async () => {
      mutableConfig.anthropicApiKey = "sk-test-key";
      mockCreate.mockResolvedValueOnce(
        mockToolResponse("DEX_SWAP", 0.88, "Uniswap token swap"),
      );

      const result = await classifyTransaction({
        type: "UNKNOWN",
        sentAsset: "ETH",
        sentAmount: 1.0,
        receivedAsset: "USDC",
        receivedAmount: 3000,
        source: "etherscan",
      });

      expect(result).not.toBeNull();
      expect(result!.classifiedType).toBe("DEX_SWAP");
      expect(result!.model).toBe("claude-sonnet-4-6");
    });

    it("正确解析 tool_use block", async () => {
      mutableConfig.anthropicApiKey = "sk-test-key";
      mockCreate.mockResolvedValueOnce(
        mockToolResponse("WRAP", 0.92, "ETH to WETH wrapping"),
      );

      const result = await classifyTransaction({
        type: "UNKNOWN",
        sentAsset: "ETH",
        sentAmount: 5.0,
        receivedAsset: "WETH",
        receivedAmount: 5.0,
        source: "etherscan",
      });

      expect(result).toEqual({
        classifiedType: "WRAP",
        confidence: 0.92,
        reasoning: "ETH to WETH wrapping",
        model: "claude-sonnet-4-6",
      });
    });

    it("confidence clamp 到 [0, 1] 范围", async () => {
      mutableConfig.anthropicApiKey = "sk-test-key";
      mockCreate.mockResolvedValueOnce(
        mockToolResponse("BUY", 1.5, "Over-confident"),
      );

      const result = await classifyTransaction({
        type: "UNKNOWN",
        receivedAsset: "BTC",
        source: "coinbase",
      });

      expect(result!.confidence).toBe(1.0);
    });

    it("负 confidence clamp 到 0", async () => {
      mutableConfig.anthropicApiKey = "sk-test-key";
      mockCreate.mockResolvedValueOnce(
        mockToolResponse("UNKNOWN", -0.5, "Uncertain"),
      );

      const result = await classifyTransaction({
        type: "UNKNOWN",
        source: "coinbase",
      });

      expect(result!.confidence).toBe(0);
    });

    it("API 返回无 tool_use block 时返回 null", async () => {
      mutableConfig.anthropicApiKey = "sk-test-key";
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "I cannot classify this" }],
      });

      const result = await classifyTransaction({
        type: "UNKNOWN",
        source: "etherscan",
      });

      expect(result).toBeNull();
    });

    it("使用 prompt caching 的 cache_control", async () => {
      mutableConfig.anthropicApiKey = "sk-test-key";
      mockCreate.mockResolvedValueOnce(
        mockToolResponse("SELL", 0.9, "Crypto to fiat"),
      );

      await classifyTransaction({
        type: "UNKNOWN",
        sentAsset: "BTC",
        source: "coinbase",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.arrayContaining([
            expect.objectContaining({
              cache_control: { type: "ephemeral" },
            }),
          ]),
        }),
      );
    });

    it("使用 strict tool_choice", async () => {
      mutableConfig.anthropicApiKey = "sk-test-key";
      mockCreate.mockResolvedValueOnce(
        mockToolResponse("BUY", 0.9, "Purchase"),
      );

      await classifyTransaction({
        type: "UNKNOWN",
        source: "coinbase",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_choice: { type: "tool", name: "classify_transaction" },
        }),
      );
    });
  });

  describe("classifyBatch", () => {
    it("批量处理多个交易", async () => {
      mutableConfig.anthropicApiKey = "sk-test-key";
      mockCreate
        .mockResolvedValueOnce(mockToolResponse("BUY", 0.95, "Buy BTC"))
        .mockResolvedValueOnce(mockToolResponse("SELL", 0.9, "Sell ETH"));

      const inputs: ClassificationInput[] = [
        { type: "UNKNOWN", receivedAsset: "BTC", source: "coinbase" },
        { type: "UNKNOWN", sentAsset: "ETH", source: "coinbase" },
      ];

      const results = await classifyBatch(inputs);

      expect(results).toHaveLength(2);
      expect(results[0]!.classifiedType).toBe("BUY");
      expect(results[1]!.classifiedType).toBe("SELL");
    });

    it("无 API key 时全部返回 null", async () => {
      mutableConfig.anthropicApiKey = "";
      const results = await classifyBatch([
        { type: "UNKNOWN" },
        { type: "UNKNOWN" },
      ]);
      expect(results).toEqual([null, null]);
    });
  });

  describe("isSimpleTransaction", () => {
    it("CEX 来源识别为简单交易", () => {
      expect(isSimpleTransaction({ type: "UNKNOWN", source: "coinbase" })).toBe(
        true,
      );
      expect(isSimpleTransaction({ type: "UNKNOWN", source: "binance" })).toBe(
        true,
      );
      expect(isSimpleTransaction({ type: "UNKNOWN", source: "kraken" })).toBe(
        true,
      );
    });

    it("DeFi 来源识别为复杂交易", () => {
      expect(
        isSimpleTransaction({ type: "UNKNOWN", source: "etherscan" }),
      ).toBe(false);
      expect(
        isSimpleTransaction({ type: "UNKNOWN", source: "solscan_defi" }),
      ).toBe(false);
    });

    it("无来源识别为复杂交易", () => {
      expect(isSimpleTransaction({ type: "UNKNOWN" })).toBe(false);
    });
  });

  describe("formatTransactionForPrompt", () => {
    it("正确格式化完整交易数据", () => {
      const prompt = formatTransactionForPrompt({
        type: "UNKNOWN",
        sentAsset: "ETH",
        sentAmount: 1.5,
        receivedAsset: "USDC",
        receivedAmount: 3000,
        feeAsset: "ETH",
        feeAmount: 0.005,
        notes: "Uniswap V3 swap",
        source: "etherscan",
      });

      expect(prompt).toContain("Current type: UNKNOWN");
      expect(prompt).toContain("Source: etherscan");
      expect(prompt).toContain("Sent: 1.5 ETH");
      expect(prompt).toContain("Received: 3000 USDC");
      expect(prompt).toContain("Fee: 0.005 ETH");
      expect(prompt).toContain("Notes: Uniswap V3 swap");
    });

    it("省略空字段", () => {
      const prompt = formatTransactionForPrompt({
        type: "UNKNOWN",
        receivedAsset: "BTC",
        receivedAmount: 0.5,
      });

      expect(prompt).toContain("Current type: UNKNOWN");
      expect(prompt).toContain("Received: 0.5 BTC");
      expect(prompt).not.toContain("Sent:");
      expect(prompt).not.toContain("Fee:");
      expect(prompt).not.toContain("Source:");
    });

    it("truncate rawData 超过 500 字符", () => {
      const longData: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        longData[`key_${i}`] = `value_${i}_${"x".repeat(20)}`;
      }

      const prompt = formatTransactionForPrompt({
        type: "UNKNOWN",
        rawData: longData,
      });

      const rawLine = prompt.split("\n").find((l) => l.startsWith("Raw data:"));
      expect(rawLine).toBeDefined();
      // "Raw data: " is 10 chars, truncated JSON is 500
      expect(rawLine!.length).toBeLessThanOrEqual(510);
    });
  });
});
