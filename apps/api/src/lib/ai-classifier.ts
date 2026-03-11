/**
 * AI Transaction Classifier
 *
 * Uses Claude API with strict tool use to classify crypto transactions
 * into TxType enum values with 100% type safety.
 *
 * Model routing:
 * - Simple CEX transactions → Haiku (fast, cheap ~$0.00025/tx)
 * - Complex DeFi/NFT → Sonnet (accurate ~$0.003/tx)
 *
 * Graceful degradation: no ANTHROPIC_API_KEY → returns null (skip AI)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TxType } from "@dtax/shared-types";
import { config } from "../config";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";

/** CEX sources that typically have simple BUY/SELL/TRADE transactions */
const SIMPLE_SOURCES = new Set([
  "coinbase",
  "binance",
  "binance_us",
  "kraken",
  "gemini",
  "kucoin",
  "okx",
  "bybit",
  "gate",
  "bitget",
  "mexc",
  "htx",
  "bitfinex",
  "poloniex",
  "crypto_com",
]);

const TX_TYPE_ENUM: TxType[] = [
  "BUY",
  "SELL",
  "TRADE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "AIRDROP",
  "STAKING_REWARD",
  "MINING_REWARD",
  "INTEREST",
  "GIFT_RECEIVED",
  "GIFT_SENT",
  "LOST",
  "STOLEN",
  "FORK",
  "MARGIN_TRADE",
  "LIQUIDATION",
  "INTERNAL_TRANSFER",
  "DEX_SWAP",
  "LP_DEPOSIT",
  "LP_WITHDRAWAL",
  "LP_REWARD",
  "WRAP",
  "UNWRAP",
  "BRIDGE_OUT",
  "BRIDGE_IN",
  "CONTRACT_APPROVAL",
  "NFT_MINT",
  "NFT_PURCHASE",
  "NFT_SALE",
  "UNKNOWN",
];

export interface ClassificationInput {
  type: string;
  sentAsset?: string;
  sentAmount?: number;
  receivedAsset?: string;
  receivedAmount?: number;
  feeAsset?: string;
  feeAmount?: number;
  notes?: string;
  source?: string;
  rawData?: Record<string, unknown>;
}

export interface ClassificationResult {
  classifiedType: TxType;
  confidence: number;
  reasoning: string;
  model: string;
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_transaction",
  description:
    "Classify a cryptocurrency transaction into its correct tax type",
  input_schema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: TX_TYPE_ENUM,
        description: "The classified transaction type",
      },
      confidence: {
        type: "number",
        description: "Confidence score 0.0-1.0",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of classification logic",
      },
    },
    required: ["type", "confidence", "reasoning"],
  },
};

const SYSTEM_PROMPT = `You are a cryptocurrency tax classification expert. Given transaction data, classify it into the correct tax type.

Rules:
- BUY: Fiat → crypto acquisition
- SELL: Crypto → fiat disposal
- TRADE: Crypto → crypto exchange (taxable)
- DEX_SWAP: Decentralized exchange swap (taxable, like TRADE)
- TRANSFER_IN/OUT: Moving assets between own wallets (not taxable)
- INTERNAL_TRANSFER: Confirmed transfer between own accounts
- WRAP/UNWRAP: Token wrapping (e.g., ETH→WETH, not taxable)
- BRIDGE_OUT/BRIDGE_IN: Cross-chain bridge (not taxable if same asset)
- LP_DEPOSIT: Adding liquidity to a pool
- LP_WITHDRAWAL: Removing liquidity from a pool
- LP_REWARD: Liquidity provider reward (income)
- STAKING_REWARD: Staking income
- MINING_REWARD: Mining income
- AIRDROP: Free token distribution (income at FMV)
- INTEREST: Interest income from lending
- NFT_MINT: Minting an NFT
- NFT_PURCHASE: Buying an NFT
- NFT_SALE: Selling an NFT
- CONTRACT_APPROVAL: Token approval (not taxable, no amount)
- MARGIN_TRADE: Margin/leveraged trade
- LIQUIDATION: Forced liquidation
- GIFT_RECEIVED/GIFT_SENT: Gift transfer
- LOST/STOLEN: Lost or stolen assets
- FORK: Blockchain fork (income)
- UNKNOWN: Cannot determine with confidence

Key indicators:
- WETH/WBTC/stETH wrapping: WRAP/UNWRAP, not TRADE
- Same asset in/out with different chains: BRIDGE
- approve() function call: CONTRACT_APPROVAL
- Zero or dust amounts with contract interaction: likely CONTRACT_APPROVAL
- LP tokens received after deposit: LP_DEPOSIT
- Reward/yield tokens: check source for staking vs LP vs interest`;

export function isSimpleTransaction(input: ClassificationInput): boolean {
  const source = (input.source || "").toLowerCase();
  return SIMPLE_SOURCES.has(source);
}

export function formatTransactionForPrompt(input: ClassificationInput): string {
  const parts: string[] = [];
  parts.push(`Current type: ${input.type}`);
  if (input.source) parts.push(`Source: ${input.source}`);
  if (input.sentAsset)
    parts.push(`Sent: ${input.sentAmount} ${input.sentAsset}`);
  if (input.receivedAsset)
    parts.push(`Received: ${input.receivedAmount} ${input.receivedAsset}`);
  if (input.feeAsset) parts.push(`Fee: ${input.feeAmount} ${input.feeAsset}`);
  if (input.notes) parts.push(`Notes: ${input.notes}`);
  if (input.rawData) {
    const raw = JSON.stringify(input.rawData).slice(0, 500);
    parts.push(`Raw data: ${raw}`);
  }
  return parts.join("\n");
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
export function resetClient(): void {
  client = null;
}

export async function classifyTransaction(
  input: ClassificationInput,
): Promise<ClassificationResult | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const model = isSimpleTransaction(input) ? HAIKU_MODEL : SONNET_MODEL;
  const userMessage = formatTransactionForPrompt(input);

  const response = await anthropic.messages.create({
    model,
    max_tokens: 300,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_transaction" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) return null;

  const result = toolBlock.input as {
    type: TxType;
    confidence: number;
    reasoning: string;
  };

  return {
    classifiedType: result.type,
    confidence: Math.min(1, Math.max(0, result.confidence)),
    reasoning: result.reasoning,
    model,
  };
}

export async function classifyBatch(
  inputs: ClassificationInput[],
): Promise<(ClassificationResult | null)[]> {
  const results: (ClassificationResult | null)[] = [];
  for (const input of inputs) {
    results.push(await classifyTransaction(input));
    if (inputs.length > 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return results;
}
