/**
 * AI Tax Assistant Chat Service
 *
 * Context-aware chat powered by Claude with tool use for:
 * - Reading user tax summaries and transaction data
 * - Running risk scans
 * - Explaining tax concepts and IRS rules
 *
 * Uses streaming for real-time response delivery.
 *
 * @license Commercial
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TxType } from "@dtax/shared-types";
import { config } from "../config";
import { prisma } from "./prisma";

const CHAT_MODEL = "claude-sonnet-4-6";

export interface ChatToolContext {
  userId: string;
}

const SYSTEM_PROMPT = `You are DTax AI Tax Assistant, a knowledgeable crypto tax expert. You help users understand their crypto tax obligations, review their transaction data, and optimize their tax positions.

Core capabilities:
- Explain IRS crypto tax rules (capital gains, income, wash sales, holding periods)
- Analyze user's tax data using available tools
- Suggest corrections for misclassified transactions
- Explain risk scan findings and recommend fixes
- Guide users on Form 8949, Schedule D, and 1099-DA reconciliation

Important rules:
- Always caveat that you provide informational guidance, not professional tax advice
- Be specific when referencing the user's actual data (use tools to fetch real numbers)
- For US tax context: IRS treats crypto as property, FIFO and Specific ID are the only officially allowed methods
- Explain concepts clearly for non-experts
- Keep responses concise but thorough
- When uncertain, say so and suggest consulting a CPA

Transaction types you should know:
BUY, SELL, TRADE, DEX_SWAP (all taxable dispositions except BUY)
TRANSFER_IN/OUT, INTERNAL_TRANSFER, BRIDGE_IN/OUT (not taxable)
WRAP/UNWRAP (not taxable — e.g., ETH→WETH)
STAKING_REWARD, MINING_REWARD, AIRDROP, INTEREST, LP_REWARD (income at FMV)
NFT_MINT, NFT_PURCHASE, NFT_SALE (treated like property)
CONTRACT_APPROVAL (not taxable)
MARGIN_TRADE, LIQUIDATION (special handling)`;

const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_tax_summary",
    description:
      "Get the user's tax summary for a specific year and cost basis method",
    input_schema: {
      type: "object" as const,
      properties: {
        year: {
          type: "number",
          description: "Tax year (e.g., 2025)",
        },
        method: {
          type: "string",
          enum: ["FIFO", "LIFO", "HIFO"],
          description: "Cost basis method",
        },
      },
      required: ["year"],
    },
  },
  {
    name: "get_transaction_stats",
    description:
      "Get statistics about the user's transactions (counts by type, total count)",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "search_transactions",
    description: "Search the user's transactions by asset, type, or date range",
    input_schema: {
      type: "object" as const,
      properties: {
        asset: {
          type: "string",
          description: "Asset symbol to filter (e.g., BTC, ETH)",
        },
        type: {
          type: "string",
          description: "Transaction type to filter",
        },
        limit: {
          type: "number",
          description: "Max results (default 10)",
        },
      },
    },
  },
  {
    name: "get_risk_summary",
    description: "Run a pre-audit risk scan and return the risk report summary",
    input_schema: {
      type: "object" as const,
      properties: {
        year: {
          type: "number",
          description: "Tax year to scan",
        },
      },
      required: ["year"],
    },
  },
];

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ChatToolContext,
): Promise<string> {
  switch (toolName) {
    case "get_tax_summary": {
      const year = (toolInput.year as number) || new Date().getFullYear() - 1;
      const report = await prisma.taxReport.findFirst({
        where: { userId: ctx.userId, taxYear: year },
        orderBy: { createdAt: "desc" },
      });
      if (!report) {
        return JSON.stringify({
          error: `No tax report found for ${year}. User needs to calculate taxes first.`,
        });
      }
      return JSON.stringify({
        taxYear: report.taxYear,
        method: report.method,
        shortTermGains: Number(report.shortTermGains),
        shortTermLosses: Number(report.shortTermLosses),
        longTermGains: Number(report.longTermGains),
        longTermLosses: Number(report.longTermLosses),
        totalIncome: Number(report.totalIncome),
        totalTransactions: report.totalTransactions,
        status: report.status,
      });
    }

    case "get_transaction_stats": {
      const total = await prisma.transaction.count({
        where: { userId: ctx.userId },
      });
      const byType = await prisma.transaction.groupBy({
        by: ["type"],
        where: { userId: ctx.userId },
        _count: true,
      });
      const aiClassified = await prisma.transaction.count({
        where: { userId: ctx.userId, aiClassified: true },
      });
      return JSON.stringify({
        total,
        aiClassified,
        byType: byType.map((g) => ({ type: g.type, count: g._count })),
      });
    }

    case "search_transactions": {
      const where: Record<string, unknown> = { userId: ctx.userId };
      if (toolInput.asset) {
        where.OR = [
          { sentAsset: toolInput.asset as string },
          { receivedAsset: toolInput.asset as string },
        ];
      }
      if (toolInput.type) {
        where.type = toolInput.type as TxType;
      }
      const limit = Math.min((toolInput.limit as number) || 10, 20);
      const txs = await prisma.transaction.findMany({
        where,
        take: limit,
        orderBy: { timestamp: "desc" },
        select: {
          id: true,
          type: true,
          timestamp: true,
          sentAsset: true,
          sentAmount: true,
          sentValueUsd: true,
          receivedAsset: true,
          receivedAmount: true,
          receivedValueUsd: true,
          aiClassified: true,
          notes: true,
        },
      });
      return JSON.stringify(
        txs.map((tx) => ({
          ...tx,
          sentAmount: tx.sentAmount ? Number(tx.sentAmount) : null,
          sentValueUsd: tx.sentValueUsd ? Number(tx.sentValueUsd) : null,
          receivedAmount: tx.receivedAmount ? Number(tx.receivedAmount) : null,
          receivedValueUsd: tx.receivedValueUsd
            ? Number(tx.receivedValueUsd)
            : null,
        })),
      );
    }

    case "get_risk_summary": {
      const year = (toolInput.year as number) || new Date().getFullYear() - 1;
      // Import dynamically to avoid circular dependency
      const { scanRisks } = await import("@dtax/tax-engine");
      const transactions = await prisma.transaction.findMany({
        where: { userId: ctx.userId },
        select: {
          id: true,
          type: true,
          timestamp: true,
          sentAsset: true,
          sentAmount: true,
          sentValueUsd: true,
          receivedAsset: true,
          receivedAmount: true,
          receivedValueUsd: true,
          gainLoss: true,
          costBasis: true,
          aiClassified: true,
          aiConfidence: true,
        },
      });
      const scanTxs = transactions.map((tx) => ({
        id: tx.id,
        type: tx.type as TxType,
        timestamp: tx.timestamp,
        sentAsset: tx.sentAsset || undefined,
        sentAmount: tx.sentAmount ? Number(tx.sentAmount) : undefined,
        sentValueUsd: tx.sentValueUsd ? Number(tx.sentValueUsd) : undefined,
        receivedAsset: tx.receivedAsset || undefined,
        receivedAmount: tx.receivedAmount
          ? Number(tx.receivedAmount)
          : undefined,
        receivedValueUsd: tx.receivedValueUsd
          ? Number(tx.receivedValueUsd)
          : undefined,
        gainLoss: tx.gainLoss ? Number(tx.gainLoss) : undefined,
        costBasis: tx.costBasis ? Number(tx.costBasis) : undefined,
        aiClassified: tx.aiClassified,
        aiConfidence: tx.aiConfidence || undefined,
      }));
      const report = scanRisks(scanTxs, year);
      return JSON.stringify({
        overallScore: report.overallScore,
        summary: report.summary,
        risks: report.items.map((i) => ({
          category: i.category,
          severity: i.severity,
          description: i.description,
          suggestedAction: i.suggestedAction,
          potentialTaxImpact: i.potentialTaxImpact,
          affectedCount: i.affectedTransactionIds.length,
        })),
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

/** Reset client (for testing) */
export function resetChatClient(): void {
  client = null;
}

/**
 * Send a message and get a complete response (non-streaming).
 * Handles tool use loops internally.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  ctx: ChatToolContext,
): Promise<{
  content: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}> {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      content:
        "AI assistant is not configured. Please set ANTHROPIC_API_KEY in your environment.",
      toolCalls: [],
    };
  }

  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  let finalContent = "";

  // Tool use loop (max 5 iterations to prevent infinite loops)
  for (let i = 0; i < 5; i++) {
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: CHAT_TOOLS,
      messages: apiMessages,
    });

    // Check if we need to handle tool use
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );

    if (toolUseBlocks.length > 0) {
      // Execute tools and continue the conversation
      apiMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        const input = toolBlock.input as Record<string, unknown>;
        toolCalls.push({ name: toolBlock.name, input });
        const result = await executeTool(toolBlock.name, input, ctx);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: result,
        });
      }

      apiMessages.push({ role: "user", content: toolResults });
    } else {
      // No more tool calls — extract final text
      finalContent = textBlocks.map((b) => b.text).join("\n");
      break;
    }

    // If this is the last iteration, extract whatever text we have
    if (i === 4) {
      finalContent =
        textBlocks.map((b) => b.text).join("\n") ||
        "I encountered an issue processing your request. Please try again.";
    }
  }

  return { content: finalContent, toolCalls };
}

/** SSE event types emitted by chatCompletionStream */
export type StreamEvent =
  | { event: "text"; data: { chunk: string } }
  | { event: "tool_start"; data: { name: string } }
  | { event: "tool_end"; data: { name: string } }
  | {
      event: "done";
      data: {
        content: string;
        toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
      };
    }
  | { event: "error"; data: { message: string } };

/**
 * Stream a chat completion via async generator.
 * Yields SSE events for text chunks, tool execution, and final result.
 * Handles tool use loops (max 5 iterations).
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  ctx: ChatToolContext,
): AsyncGenerator<StreamEvent> {
  const anthropic = getClient();
  if (!anthropic) {
    yield {
      event: "error",
      data: {
        message:
          "AI assistant is not configured. Please set ANTHROPIC_API_KEY in your environment.",
      },
    };
    return;
  }

  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  let fullContent = "";

  for (let i = 0; i < 5; i++) {
    // Use streaming API
    const stream = anthropic.messages.stream({
      model: CHAT_MODEL,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: CHAT_TOOLS,
      messages: apiMessages,
    });

    let iterationText = "";
    const iterationToolUses: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
    }> = [];
    let currentToolName = "";

    // Process stream events
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolName = event.content_block.name;
          yield { event: "tool_start", data: { name: currentToolName } };
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta" && "text" in event.delta) {
          const chunk = event.delta.text;
          iterationText += chunk;
          yield { event: "text", data: { chunk } };
        }
      } else if (event.type === "content_block_stop") {
        // Block ended — if it was a tool, we'll process after message ends
      }
    }

    // Get the final message to extract tool use blocks
    const finalMessage = await stream.finalMessage();

    const toolUseBlocks = finalMessage.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length > 0) {
      // Execute tools
      apiMessages.push({ role: "assistant", content: finalMessage.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks) {
        const input = toolBlock.input as Record<string, unknown>;
        toolCalls.push({ name: toolBlock.name, input });
        iterationToolUses.push({
          id: toolBlock.id,
          name: toolBlock.name,
          input,
        });

        const result = await executeTool(toolBlock.name, input, ctx);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: result,
        });
        yield { event: "tool_end", data: { name: toolBlock.name } };
      }

      apiMessages.push({ role: "user", content: toolResults });
      fullContent += iterationText;
      // Continue loop for next Claude response
    } else {
      // No tool calls — streaming is complete
      fullContent += iterationText;
      yield { event: "done", data: { content: fullContent, toolCalls } };
      return;
    }

    // Last iteration fallback
    if (i === 4) {
      fullContent += iterationText;
      if (!fullContent) {
        fullContent =
          "I encountered an issue processing your request. Please try again.";
      }
      yield { event: "done", data: { content: fullContent, toolCalls } };
      return;
    }
  }
}
