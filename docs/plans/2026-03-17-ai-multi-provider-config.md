# AI Multi-Provider Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hard-coded Anthropic-only AI integration with a multi-provider system supporting 15+ LLM providers via 2 adapters (Anthropic native + OpenAI-compatible), with 3-layer config priority (User BYOK → SystemConfig → .env fallback).

**Architecture:** Provider Adapter pattern with `LlmAdapter` interface. `AnthropicAdapter` uses native Anthropic SDK for Claude models. `OpenAICompatAdapter` uses OpenAI SDK to hit any OpenAI-compatible endpoint (DeepSeek, Gemini, Qwen, Mistral, Groq, Ollama, SiliconFlow, OpenRouter, etc.). Config resolves in 3 layers: user BYOK preferences (PRO/CPA only) → admin SystemConfig → .env fallback (backward compatible).

**Tech Stack:** TypeScript, Fastify, Prisma, Next.js 14, `@anthropic-ai/sdk`, `openai` npm package, AES-256-CBC encryption (existing `encryptKey`/`decryptKey`), zod validation, next-intl i18n (7 locales)

---

## Context for Implementer

### Key Files You'll Touch

| File                                              | Purpose                                                    |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `apps/api/src/lib/ai-classifier.ts`               | Current hard-coded Anthropic classifier — will use adapter |
| `apps/api/src/lib/chat-service.ts`                | Current hard-coded Anthropic chat — will use adapter       |
| `apps/api/src/config.ts`                          | Env config — add new env vars                              |
| `apps/api/src/services/ccxt.ts`                   | Has `encryptKey`/`decryptKey` — extract to shared module   |
| `apps/api/src/routes/system.ts`                   | Admin system config routes — add test-connection endpoint  |
| `apps/api/src/routes/auth.ts`                     | User preferences — extend for BYOK                         |
| `apps/api/src/routes/ai-classify.ts`              | Classification endpoint — use adapter                      |
| `apps/api/src/routes/chat.ts`                     | Chat endpoint — use adapter                                |
| `apps/web/src/app/[locale]/admin/system/page.tsx` | Admin UI — overhaul AI config section                      |
| `apps/web/src/app/[locale]/settings/page.tsx`     | User settings — add BYOK card                              |
| `apps/web/src/lib/api.ts`                         | Client API functions — add test-connection, BYOK functions |
| `apps/web/messages/*.json`                        | i18n — add ~40 keys per locale (7 locales)                 |

### Provider Presets (15)

| ID               | Name                 | Adapter       | Base URL                                                | Default Model             |
| ---------------- | -------------------- | ------------- | ------------------------------------------------------- | ------------------------- |
| `anthropic`      | Anthropic            | Anthropic     | (SDK default)                                           | claude-sonnet-4-6         |
| `openai`         | OpenAI               | OpenAI-compat | https://api.openai.com/v1                               | gpt-4o                    |
| `google`         | Google Gemini        | OpenAI-compat | https://generativelanguage.googleapis.com/v1beta/openai | gemini-2.5-flash          |
| `deepseek`       | DeepSeek             | OpenAI-compat | https://api.deepseek.com/v1                             | deepseek-chat             |
| `mistral`        | Mistral AI           | OpenAI-compat | https://api.mistral.ai/v1                               | mistral-large-latest      |
| `qwen`           | Qwen (International) | OpenAI-compat | https://dashscope-intl.aliyuncs.com/compatible-mode/v1  | qwen-plus                 |
| `qwen_cn`        | Qwen (China)         | OpenAI-compat | https://dashscope.aliyuncs.com/compatible-mode/v1       | qwen-plus                 |
| `groq`           | Groq                 | OpenAI-compat | https://api.groq.com/openai/v1                          | llama-3.3-70b-versatile   |
| `siliconflow`    | SiliconFlow (Intl)   | OpenAI-compat | https://api.siliconflow.cn/v1                           | deepseek-ai/DeepSeek-V3   |
| `siliconflow_cn` | SiliconFlow (China)  | OpenAI-compat | https://api.siliconflow.cn/v1                           | deepseek-ai/DeepSeek-V3   |
| `openrouter`     | OpenRouter           | OpenAI-compat | https://openrouter.ai/api/v1                            | anthropic/claude-sonnet-4 |
| `ollama_local`   | Ollama (Local)       | OpenAI-compat | http://localhost:11434/v1                               | llama3.2                  |
| `ollama_cloud`   | Ollama (Cloud)       | OpenAI-compat | https://api.ollama.com/v1                               | llama3.2                  |
| `azure`          | Azure OpenAI         | OpenAI-compat | (user-provided)                                         | gpt-4o                    |
| `custom`         | Custom Provider      | OpenAI-compat | (user-provided)                                         | (user-provided)           |

### Existing Encryption

`encryptKey`/`decryptKey` in `apps/api/src/services/ccxt.ts` (AES-256-CBC, IV prepended). These are currently only imported by `connections.ts`. We'll extract them to a shared `apps/api/src/lib/encryption.ts` so both CCXT and AI key storage can use them.

### 3-Layer Config Resolution

```
User BYOK (preferences.aiProvider JSON)
  → SystemConfig (system_configs.ai_config JSON)
    → .env (ANTHROPIC_API_KEY — backward compatible)
```

---

## Task 1: Extract encryption utilities to shared module

**Files:**

- Create: `apps/api/src/lib/encryption.ts`
- Modify: `apps/api/src/services/ccxt.ts`
- Modify: `apps/api/src/routes/connections.ts`
- Test: `apps/api/src/__tests__/encryption.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/encryption.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encryptKey, decryptKey, maskApiKey } from "../lib/encryption";

describe("encryption", () => {
  it("encrypts and decrypts text round-trip", () => {
    const original = "sk-ant-1234567890abcdef";
    const encrypted = encryptKey(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(":");
    const decrypted = decryptKey(encrypted);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertext for same input (random IV)", () => {
    const text = "test-key";
    const a = encryptKey(text);
    const b = encryptKey(text);
    expect(a).not.toBe(b);
    expect(decryptKey(a)).toBe(text);
    expect(decryptKey(b)).toBe(text);
  });

  it("maskApiKey masks middle of key", () => {
    expect(maskApiKey("sk-ant-api03-abcdefghij1234567890")).toBe(
      "sk-ant-a...7890",
    );
    expect(maskApiKey("short")).toBe("s...t");
    expect(maskApiKey("")).toBe("****");
    expect(maskApiKey("ab")).toBe("****");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/encryption.test.ts`
Expected: FAIL — module not found

**Step 3: Write the encryption module**

Create `apps/api/src/lib/encryption.ts`:

```typescript
/**
 * Shared encryption utilities for API keys and secrets.
 * AES-256-CBC with random IV.
 */
import crypto from "crypto";
import { config } from "../config";

const ENCRYPTION_KEY = Buffer.from(
  (config.encryptionKey || "0".repeat(32)).padEnd(32, "0"),
);
const IV_LENGTH = 16;

export function encryptKey(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptKey(text: string): string {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

/** Mask API key for display: "sk-ant-a...7890" */
export function maskApiKey(key: string): string {
  if (!key || key.length < 4) return "****";
  return key.slice(0, 7) + "..." + key.slice(-4);
}
```

**Step 4: Update ccxt.ts to re-export from shared module**

In `apps/api/src/services/ccxt.ts`, replace the encryption section (lines 6-32) with:

```typescript
// Re-export from shared encryption module
export { encryptKey, decryptKey } from "../lib/encryption";
```

Remove the `crypto` import (line 7), the `ENCRYPTION_KEY`/`IV_LENGTH` constants, and the `encryptKey`/`decryptKey` function bodies. Keep the `import { config } from "../config"` only if still needed by CcxtService below.

**Step 5: Run tests to verify everything passes**

Run: `cd apps/api && npx vitest run src/__tests__/encryption.test.ts && npx vitest run src/__tests__/routes.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add apps/api/src/lib/encryption.ts apps/api/src/__tests__/encryption.test.ts apps/api/src/services/ccxt.ts
git commit -m "refactor: extract encryption utilities to shared lib/encryption module"
```

---

## Task 2: Create LlmAdapter interface and provider presets

**Files:**

- Create: `apps/api/src/lib/llm/types.ts`
- Create: `apps/api/src/lib/llm/presets.ts`
- Test: `apps/api/src/__tests__/llm-presets.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/llm-presets.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PROVIDER_PRESETS, getPreset } from "../lib/llm/presets";
import type { ProviderPreset } from "../lib/llm/types";

describe("LLM provider presets", () => {
  it("has 15 presets", () => {
    expect(Object.keys(PROVIDER_PRESETS)).toHaveLength(15);
  });

  it("every preset has required fields", () => {
    for (const [id, preset] of Object.entries(PROVIDER_PRESETS)) {
      expect(preset.id).toBe(id);
      expect(preset.name).toBeTruthy();
      expect(["anthropic", "openai_compat"]).toContain(preset.adapter);
      expect(preset.defaultModel).toBeTruthy();
    }
  });

  it("anthropic preset uses anthropic adapter", () => {
    const p = getPreset("anthropic");
    expect(p?.adapter).toBe("anthropic");
    expect(p?.baseUrl).toBeUndefined();
  });

  it("deepseek preset uses openai_compat adapter", () => {
    const p = getPreset("deepseek");
    expect(p?.adapter).toBe("openai_compat");
    expect(p?.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  it("ollama_local has no requiresApiKey", () => {
    const p = getPreset("ollama_local");
    expect(p?.requiresApiKey).toBe(false);
  });

  it("getPreset returns undefined for unknown id", () => {
    expect(getPreset("nonexistent")).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/llm-presets.test.ts`
Expected: FAIL — module not found

**Step 3: Create types**

Create `apps/api/src/lib/llm/types.ts`:

```typescript
/**
 * LLM Adapter interfaces and types for multi-provider AI support.
 */

export interface LlmAdapter {
  /**
   * Send a message with tool use (for transaction classification).
   * Returns tool call result or null if no tool was called.
   */
  classify(params: ClassifyParams): Promise<ClassifyResult | null>;

  /**
   * Send a chat message and get a complete response.
   * Handles tool use loops internally.
   */
  chat(params: ChatParams): Promise<ChatResult>;

  /**
   * Stream a chat completion via async generator.
   */
  chatStream(params: ChatParams): AsyncGenerator<StreamEvent>;

  /**
   * Test the connection to the provider. Returns true if successful.
   */
  testConnection(): Promise<boolean>;
}

export interface ClassifyParams {
  model: string;
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  toolChoice: string;
  maxTokens?: number;
}

export interface ClassifyResult {
  toolName: string;
  toolInput: Record<string, unknown>;
  model: string;
}

export interface ChatParams {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: ToolDefinition[];
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

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

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ProviderPreset {
  id: string;
  name: string;
  adapter: "anthropic" | "openai_compat";
  baseUrl?: string;
  defaultModel: string;
  models: string[];
  requiresApiKey: boolean;
  /** Hint for users about where to get an API key */
  apiKeyUrl?: string;
}

export interface ProviderConfig {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}
```

**Step 4: Create presets**

Create `apps/api/src/lib/llm/presets.ts`:

```typescript
/**
 * Provider presets — static metadata for 15 supported LLM providers.
 */
import type { ProviderPreset } from "./types";

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    adapter: "anthropic",
    defaultModel: "claude-sonnet-4-6",
    models: [
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
      "claude-opus-4-6",
    ],
    requiresApiKey: true,
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    adapter: "openai_compat",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
    requiresApiKey: true,
    apiKeyUrl: "https://platform.openai.com/api-keys",
  },
  google: {
    id: "google",
    name: "Google Gemini",
    adapter: "openai_compat",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    requiresApiKey: true,
    apiKeyUrl: "https://aistudio.google.com/apikey",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    adapter: "openai_compat",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    requiresApiKey: true,
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    adapter: "openai_compat",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    models: [
      "mistral-large-latest",
      "mistral-medium-latest",
      "mistral-small-latest",
    ],
    requiresApiKey: true,
    apiKeyUrl: "https://console.mistral.ai/api-keys",
  },
  qwen: {
    id: "qwen",
    name: "Qwen (International)",
    adapter: "openai_compat",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-turbo", "qwen-max"],
    requiresApiKey: true,
    apiKeyUrl: "https://dashscope.console.aliyun.com/apiKey",
  },
  qwen_cn: {
    id: "qwen_cn",
    name: "Qwen (中国)",
    adapter: "openai_compat",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-turbo", "qwen-max"],
    requiresApiKey: true,
    apiKeyUrl: "https://dashscope.console.aliyun.com/apiKey",
  },
  groq: {
    id: "groq",
    name: "Groq",
    adapter: "openai_compat",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
    ],
    requiresApiKey: true,
    apiKeyUrl: "https://console.groq.com/keys",
  },
  siliconflow: {
    id: "siliconflow",
    name: "SiliconFlow (International)",
    adapter: "openai_compat",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    requiresApiKey: true,
    apiKeyUrl: "https://cloud.siliconflow.cn/account/ak",
  },
  siliconflow_cn: {
    id: "siliconflow_cn",
    name: "SiliconFlow (中国)",
    adapter: "openai_compat",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    requiresApiKey: true,
    apiKeyUrl: "https://cloud.siliconflow.cn/account/ak",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    adapter: "openai_compat",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4",
    models: [
      "anthropic/claude-sonnet-4",
      "openai/gpt-4o",
      "google/gemini-2.5-flash",
      "deepseek/deepseek-chat-v3",
    ],
    requiresApiKey: true,
    apiKeyUrl: "https://openrouter.ai/keys",
  },
  ollama_local: {
    id: "ollama_local",
    name: "Ollama (Local)",
    adapter: "openai_compat",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    models: ["llama3.2", "llama3.1", "mistral", "qwen2.5", "deepseek-r1"],
    requiresApiKey: false,
  },
  ollama_cloud: {
    id: "ollama_cloud",
    name: "Ollama (Cloud)",
    adapter: "openai_compat",
    baseUrl: "https://api.ollama.com/v1",
    defaultModel: "llama3.2",
    models: ["llama3.2", "llama3.1", "mistral", "qwen2.5"],
    requiresApiKey: true,
    apiKeyUrl: "https://ollama.com/settings/keys",
  },
  azure: {
    id: "azure",
    name: "Azure OpenAI",
    adapter: "openai_compat",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini"],
    requiresApiKey: true,
    apiKeyUrl: "https://portal.azure.com",
  },
  custom: {
    id: "custom",
    name: "Custom Provider",
    adapter: "openai_compat",
    defaultModel: "",
    models: [],
    requiresApiKey: true,
  },
};

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS[id];
}
```

**Step 5: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/llm-presets.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/lib/llm/types.ts apps/api/src/lib/llm/presets.ts apps/api/src/__tests__/llm-presets.test.ts
git commit -m "feat: add LlmAdapter interface and 15 provider presets"
```

---

## Task 3: Implement AnthropicAdapter

**Files:**

- Create: `apps/api/src/lib/llm/anthropic-adapter.ts`
- Test: `apps/api/src/__tests__/anthropic-adapter.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/anthropic-adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicAdapter } from "../lib/llm/anthropic-adapter";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  const mockStream = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate, stream: mockStream },
    })),
    __mockCreate: mockCreate,
    __mockStream: mockStream,
  };
});

describe("AnthropicAdapter", () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter({ apiKey: "test-key" });
  });

  it("testConnection resolves true with valid key", async () => {
    const { __mockCreate } = (await import("@anthropic-ai/sdk")) as any;
    __mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
    });
    const result = await adapter.testConnection();
    expect(result).toBe(true);
  });

  it("testConnection resolves false with invalid key", async () => {
    const { __mockCreate } = (await import("@anthropic-ai/sdk")) as any;
    __mockCreate.mockRejectedValueOnce(new Error("401 Unauthorized"));
    const result = await adapter.testConnection();
    expect(result).toBe(false);
  });

  it("classify extracts tool call from response", async () => {
    const { __mockCreate } = (await import("@anthropic-ai/sdk")) as any;
    __mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "classify_transaction",
          input: { type: "BUY", confidence: 0.95, reasoning: "test" },
        },
      ],
    });

    const result = await adapter.classify({
      model: "claude-haiku-4-5-20251001",
      systemPrompt: "test",
      userMessage: "test tx",
      tools: [
        {
          name: "classify_transaction",
          description: "classify",
          inputSchema: {},
        },
      ],
      toolChoice: "classify_transaction",
      maxTokens: 300,
    });

    expect(result).toEqual({
      toolName: "classify_transaction",
      toolInput: { type: "BUY", confidence: 0.95, reasoning: "test" },
      model: "claude-haiku-4-5-20251001",
    });
  });

  it("classify returns null when no tool block in response", async () => {
    const { __mockCreate } = (await import("@anthropic-ai/sdk")) as any;
    __mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "I cannot classify this" }],
    });

    const result = await adapter.classify({
      model: "claude-haiku-4-5-20251001",
      systemPrompt: "test",
      userMessage: "test tx",
      tools: [
        {
          name: "classify_transaction",
          description: "classify",
          inputSchema: {},
        },
      ],
      toolChoice: "classify_transaction",
    });

    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/anthropic-adapter.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the adapter**

Create `apps/api/src/lib/llm/anthropic-adapter.ts`:

```typescript
/**
 * Anthropic native adapter — uses @anthropic-ai/sdk directly.
 * Used only for Anthropic's Claude models.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmAdapter,
  ClassifyParams,
  ClassifyResult,
  ChatParams,
  ChatResult,
  StreamEvent,
} from "./types";

interface AnthropicAdapterConfig {
  apiKey: string;
}

export class AnthropicAdapter implements LlmAdapter {
  private client: Anthropic;

  constructor(config: AnthropicAdapterConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async classify(params: ClassifyParams): Promise<ClassifyResult | null> {
    const tools: Anthropic.Tool[] = params.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 300,
      system: [
        {
          type: "text",
          text: params.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools,
      tool_choice: { type: "tool", name: params.toolChoice },
      messages: [{ role: "user", content: params.userMessage }],
    });

    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolBlock) return null;

    return {
      toolName: toolBlock.name,
      toolInput: toolBlock.input as Record<string, unknown>,
      model: params.model,
    };
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const tools: Anthropic.Tool[] = (params.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const apiMessages: Anthropic.MessageParam[] = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> =
      [];
    let finalContent = "";

    for (let i = 0; i < 5; i++) {
      const response = await this.client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens ?? 1500,
        system: [
          {
            type: "text",
            text: params.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        ...(tools.length > 0 ? { tools } : {}),
        messages: apiMessages,
      });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );

      if (toolUseBlocks.length === 0) {
        finalContent = textBlocks.map((b) => b.text).join("\n");
        break;
      }

      // Tool use — return the tool calls for the caller to execute
      // (chat-service handles tool execution, not the adapter)
      finalContent = textBlocks.map((b) => b.text).join("\n");
      for (const tb of toolUseBlocks) {
        toolCalls.push({
          name: tb.name,
          input: tb.input as Record<string, unknown>,
        });
      }
      break; // Let caller handle tool execution loop
    }

    return { content: finalContent, toolCalls };
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    const tools: Anthropic.Tool[] = (params.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const apiMessages: Anthropic.MessageParam[] = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const stream = this.client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens ?? 1500,
      system: [
        {
          type: "text",
          text: params.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      ...(tools.length > 0 ? { tools } : {}),
      messages: apiMessages,
    });

    let fullContent = "";
    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> =
      [];

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          yield {
            event: "tool_start",
            data: { name: event.content_block.name },
          };
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta" && "text" in event.delta) {
          fullContent += event.delta.text;
          yield { event: "text", data: { chunk: event.delta.text } };
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    const toolUseBlocks = finalMessage.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    for (const tb of toolUseBlocks) {
      toolCalls.push({
        name: tb.name,
        input: tb.input as Record<string, unknown>,
      });
      yield { event: "tool_end", data: { name: tb.name } };
    }

    yield { event: "done", data: { content: fullContent, toolCalls } };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 5,
        messages: [{ role: "user", content: "hi" }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/anthropic-adapter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/lib/llm/anthropic-adapter.ts apps/api/src/__tests__/anthropic-adapter.test.ts
git commit -m "feat: implement AnthropicAdapter for native Claude API"
```

---

## Task 4: Implement OpenAICompatAdapter

**Files:**

- Create: `apps/api/src/lib/llm/openai-compat-adapter.ts`
- Test: `apps/api/src/__tests__/openai-compat-adapter.test.ts`

**Step 1: Install the openai package**

Run: `cd apps/api && pnpm add openai`

**Step 2: Write the failing test**

Create `apps/api/src/__tests__/openai-compat-adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatAdapter } from "../lib/llm/openai-compat-adapter";

// Mock the OpenAI SDK
vi.mock("openai", () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
    __mockCreate: mockCreate,
  };
});

describe("OpenAICompatAdapter", () => {
  let adapter: OpenAICompatAdapter;

  beforeEach(() => {
    adapter = new OpenAICompatAdapter({
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com/v1",
    });
  });

  it("testConnection resolves true with valid key", async () => {
    const { __mockCreate } = (await import("openai")) as any;
    __mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" } }],
    });
    const result = await adapter.testConnection();
    expect(result).toBe(true);
  });

  it("classify extracts tool call from response", async () => {
    const { __mockCreate } = (await import("openai")) as any;
    __mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: "classify_transaction",
                  arguments: JSON.stringify({
                    type: "SELL",
                    confidence: 0.9,
                    reasoning: "fiat received",
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const result = await adapter.classify({
      model: "deepseek-chat",
      systemPrompt: "test",
      userMessage: "test tx",
      tools: [
        {
          name: "classify_transaction",
          description: "classify",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      toolChoice: "classify_transaction",
    });

    expect(result?.toolName).toBe("classify_transaction");
    expect(result?.toolInput.type).toBe("SELL");
    expect(result?.model).toBe("deepseek-chat");
  });

  it("chat returns text content", async () => {
    const { __mockCreate } = (await import("openai")) as any;
    __mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "Hello! I can help with your taxes.",
            tool_calls: undefined,
          },
        },
      ],
    });

    const result = await adapter.chat({
      model: "deepseek-chat",
      systemPrompt: "You are a tax assistant",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.content).toBe("Hello! I can help with your taxes.");
    expect(result.toolCalls).toHaveLength(0);
  });
});
```

**Step 3: Implement the adapter**

Create `apps/api/src/lib/llm/openai-compat-adapter.ts`:

```typescript
/**
 * OpenAI-compatible adapter — works with any provider that supports
 * the OpenAI chat completions API format.
 *
 * Covers: OpenAI, DeepSeek, Gemini, Qwen, Mistral, Groq, SiliconFlow,
 * OpenRouter, Ollama (local & cloud), Azure OpenAI, Custom.
 */
import OpenAI from "openai";
import type {
  LlmAdapter,
  ClassifyParams,
  ClassifyResult,
  ChatParams,
  ChatResult,
  StreamEvent,
} from "./types";

interface OpenAICompatConfig {
  apiKey?: string;
  baseUrl: string;
}

export class OpenAICompatAdapter implements LlmAdapter {
  private client: OpenAI;

  constructor(config: OpenAICompatConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey || "ollama",
      baseURL: config.baseUrl,
    });
  }

  async classify(params: ClassifyParams): Promise<ClassifyResult | null> {
    const tools: OpenAI.ChatCompletionTool[] = params.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 300,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userMessage },
      ],
      tools,
      tool_choice: { type: "function", function: { name: params.toolChoice } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) return null;

    return {
      toolName: toolCall.function.name,
      toolInput: JSON.parse(toolCall.function.arguments),
      model: params.model,
    };
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const tools: OpenAI.ChatCompletionTool[] | undefined = params.tools?.map(
      (t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }),
    );

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: params.systemPrompt },
      ...params.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 1500,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    const msg = response.choices[0]?.message;
    const toolCalls = (msg?.tool_calls ?? []).map((tc) => ({
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments),
    }));

    return {
      content: msg?.content ?? "",
      toolCalls,
    };
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    const tools: OpenAI.ChatCompletionTool[] | undefined = params.tools?.map(
      (t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }),
    );

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: params.systemPrompt },
      ...params.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const stream = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 1500,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      stream: true,
    });

    let fullContent = "";
    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> =
      [];
    const toolArgs: Record<number, { name: string; args: string }> = {};

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        fullContent += delta.content;
        yield { event: "text", data: { chunk: delta.content } };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolArgs[tc.index]) {
            toolArgs[tc.index] = { name: "", args: "" };
          }
          if (tc.function?.name) {
            toolArgs[tc.index].name = tc.function.name;
            yield { event: "tool_start", data: { name: tc.function.name } };
          }
          if (tc.function?.arguments) {
            toolArgs[tc.index].args += tc.function.arguments;
          }
        }
      }
    }

    // Finalize tool calls
    for (const tc of Object.values(toolArgs)) {
      try {
        toolCalls.push({ name: tc.name, input: JSON.parse(tc.args) });
      } catch {
        toolCalls.push({ name: tc.name, input: {} });
      }
      yield { event: "tool_end", data: { name: tc.name } };
    }

    yield { event: "done", data: { content: fullContent, toolCalls } };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: "gpt-4o-mini", // Will be overridden by each provider's actual model
        max_tokens: 5,
        messages: [{ role: "user", content: "hi" }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/openai-compat-adapter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/lib/llm/openai-compat-adapter.ts apps/api/src/__tests__/openai-compat-adapter.test.ts
git commit -m "feat: implement OpenAICompatAdapter for 14 providers"
```

---

## Task 5: Create adapter factory and config resolver

**Files:**

- Create: `apps/api/src/lib/llm/factory.ts`
- Create: `apps/api/src/lib/llm/index.ts`
- Test: `apps/api/src/__tests__/llm-factory.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/llm-factory.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("../lib/prisma", () => ({
  prisma: {
    systemConfig: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

// Mock config
vi.mock("../config", () => ({
  config: { anthropicApiKey: "env-key", encryptionKey: "0".repeat(32) },
}));

// Mock adapters
vi.mock("../lib/llm/anthropic-adapter", () => ({
  AnthropicAdapter: vi
    .fn()
    .mockImplementation(() => ({ testConnection: vi.fn() })),
}));
vi.mock("../lib/llm/openai-compat-adapter", () => ({
  OpenAICompatAdapter: vi
    .fn()
    .mockImplementation(() => ({ testConnection: vi.fn() })),
}));

import { resolveProvider } from "../lib/llm/factory";
import { prisma } from "../lib/prisma";
import { AnthropicAdapter } from "../lib/llm/anthropic-adapter";
import { OpenAICompatAdapter } from "../lib/llm/openai-compat-adapter";

describe("resolveProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to .env Anthropic key when no SystemConfig or user BYOK", async () => {
    (prisma.systemConfig.findUnique as any).mockResolvedValue(null);

    const { adapter, model } = await resolveProvider("classification");
    expect(AnthropicAdapter).toHaveBeenCalledWith({ apiKey: "env-key" });
    expect(model).toBe("claude-haiku-4-5-20251001");
  });

  it("uses SystemConfig when available", async () => {
    (prisma.systemConfig.findUnique as any).mockResolvedValue({
      value: {
        provider: "deepseek",
        apiKey: "encrypted-deepseek-key",
        classificationModel: "deepseek-chat",
        chatModel: "deepseek-chat",
      },
    });

    const { adapter, model } = await resolveProvider("classification");
    expect(OpenAICompatAdapter).toHaveBeenCalled();
    expect(model).toBe("deepseek-chat");
  });

  it("uses user BYOK when userId is provided", async () => {
    (prisma.systemConfig.findUnique as any).mockResolvedValue(null);
    (prisma.user.findUnique as any).mockResolvedValue({
      preferences: {
        aiProvider: {
          providerId: "groq",
          apiKey: "encrypted-groq-key",
          model: "llama-3.3-70b-versatile",
        },
      },
    });

    const { adapter, model } = await resolveProvider("chat", "user-123");
    expect(OpenAICompatAdapter).toHaveBeenCalled();
    expect(model).toBe("llama-3.3-70b-versatile");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/llm-factory.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the factory**

Create `apps/api/src/lib/llm/factory.ts`:

```typescript
/**
 * Adapter factory with 3-layer config resolution:
 * User BYOK → SystemConfig → .env fallback
 */
import { config } from "../../config";
import { prisma } from "../prisma";
import { decryptKey } from "../encryption";
import { getPreset } from "./presets";
import { AnthropicAdapter } from "./anthropic-adapter";
import { OpenAICompatAdapter } from "./openai-compat-adapter";
import type { LlmAdapter, ProviderConfig } from "./types";

type Purpose = "classification" | "chat";

interface ResolvedProvider {
  adapter: LlmAdapter;
  model: string;
  providerId: string;
}

/** Default models for .env Anthropic fallback */
const ENV_DEFAULTS = {
  classification: "claude-haiku-4-5-20251001",
  chat: "claude-sonnet-4-6",
};

function createAdapter(
  providerId: string,
  apiKey: string | undefined,
  baseUrl?: string,
): LlmAdapter {
  const preset = getPreset(providerId);
  const adapterType = preset?.adapter ?? "openai_compat";

  if (adapterType === "anthropic") {
    return new AnthropicAdapter({ apiKey: apiKey ?? "" });
  }

  const url = baseUrl ?? preset?.baseUrl ?? "";
  return new OpenAICompatAdapter({ apiKey, baseUrl: url });
}

function safeDecrypt(encrypted: string | undefined): string | undefined {
  if (!encrypted) return undefined;
  try {
    return decryptKey(encrypted);
  } catch {
    return undefined;
  }
}

/**
 * Resolve the LLM provider and model for a given purpose.
 * Priority: User BYOK → SystemConfig → .env
 */
export async function resolveProvider(
  purpose: Purpose,
  userId?: string,
): Promise<ResolvedProvider> {
  // Layer 1: User BYOK (if userId provided)
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const prefs = user?.preferences as Record<string, unknown> | null;
    const aiProvider = prefs?.aiProvider as ProviderConfig | undefined;

    if (aiProvider?.providerId) {
      const preset = getPreset(aiProvider.providerId);
      const apiKey = safeDecrypt(aiProvider.apiKey);
      const model = aiProvider.model ?? preset?.defaultModel ?? "";
      const adapter = createAdapter(
        aiProvider.providerId,
        apiKey,
        aiProvider.baseUrl,
      );
      return { adapter, model, providerId: aiProvider.providerId };
    }
  }

  // Layer 2: SystemConfig
  const sysConfig = await prisma.systemConfig.findUnique({
    where: { key: "ai_config" },
  });

  if (sysConfig?.value) {
    const cfg = sysConfig.value as Record<string, unknown>;
    const providerId = cfg.provider as string | undefined;

    if (providerId && providerId !== "anthropic") {
      const preset = getPreset(providerId);
      const apiKey = safeDecrypt(cfg.apiKey as string | undefined);
      const model =
        ((purpose === "classification"
          ? cfg.classificationModel
          : cfg.chatModel) as string) ??
        preset?.defaultModel ??
        "";
      const adapter = createAdapter(
        providerId,
        apiKey,
        cfg.baseUrl as string | undefined,
      );
      return { adapter, model, providerId };
    }

    // SystemConfig with anthropic provider or legacy format
    if (
      providerId === "anthropic" ||
      cfg.classificationModel ||
      cfg.chatModel
    ) {
      const apiKey =
        safeDecrypt(cfg.apiKey as string | undefined) ?? config.anthropicApiKey;
      const model =
        ((purpose === "classification"
          ? cfg.classificationModel
          : cfg.chatModel) as string) ?? ENV_DEFAULTS[purpose];
      const adapter = new AnthropicAdapter({ apiKey });
      return { adapter, model, providerId: "anthropic" };
    }
  }

  // Layer 3: .env fallback (backward compatible)
  if (!config.anthropicApiKey) {
    // Return adapter anyway — callers check for empty key or use testConnection
    return {
      adapter: new AnthropicAdapter({ apiKey: "" }),
      model: ENV_DEFAULTS[purpose],
      providerId: "anthropic",
    };
  }

  return {
    adapter: new AnthropicAdapter({ apiKey: config.anthropicApiKey }),
    model: ENV_DEFAULTS[purpose],
    providerId: "anthropic",
  };
}
```

**Step 4: Create index barrel**

Create `apps/api/src/lib/llm/index.ts`:

```typescript
export { resolveProvider } from "./factory";
export { PROVIDER_PRESETS, getPreset } from "./presets";
export { AnthropicAdapter } from "./anthropic-adapter";
export { OpenAICompatAdapter } from "./openai-compat-adapter";
export type {
  LlmAdapter,
  ClassifyParams,
  ClassifyResult,
  ChatParams,
  ChatResult,
  StreamEvent,
  ToolDefinition,
  ProviderPreset,
  ProviderConfig,
} from "./types";
```

**Step 5: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/llm-factory.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/lib/llm/factory.ts apps/api/src/lib/llm/index.ts apps/api/src/__tests__/llm-factory.test.ts
git commit -m "feat: add adapter factory with 3-layer config resolution"
```

---

## Task 6: Migrate ai-classifier.ts to use adapters

**Files:**

- Modify: `apps/api/src/lib/ai-classifier.ts`
- Modify: `apps/api/src/__tests__/ai-classify.test.ts`

**Step 1: Refactor ai-classifier.ts**

Replace the entire file with adapter-based implementation. Key changes:

- Remove direct Anthropic SDK usage
- Remove `getClient()`, `client` singleton
- Use `resolveProvider("classification", userId)` to get adapter
- `classifyTransaction` now takes optional `userId` for BYOK resolution
- Keep `SYSTEM_PROMPT`, `CLASSIFY_TOOL` schema, `TX_TYPE_ENUM`, `isSimpleTransaction`, `formatTransactionForPrompt` unchanged

The refactored `classifyTransaction` function:

```typescript
import { resolveProvider } from "./llm";
import type { ToolDefinition } from "./llm";

// ... keep TX_TYPE_ENUM, SYSTEM_PROMPT, ClassificationInput, ClassificationResult,
// isSimpleTransaction, formatTransactionForPrompt unchanged ...

const CLASSIFY_TOOL_DEF: ToolDefinition = {
  name: "classify_transaction",
  description:
    "Classify a cryptocurrency transaction into its correct tax type",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: TX_TYPE_ENUM,
        description: "The classified transaction type",
      },
      confidence: { type: "number", description: "Confidence score 0.0-1.0" },
      reasoning: {
        type: "string",
        description: "Brief explanation of classification logic",
      },
    },
    required: ["type", "confidence", "reasoning"],
  },
};

export async function classifyTransaction(
  input: ClassificationInput,
  userId?: string,
): Promise<ClassificationResult | null> {
  const { adapter, model: resolvedModel } = await resolveProvider(
    "classification",
    userId,
  );

  // For Anthropic, still use smart/fast model routing
  const model = resolvedModel.startsWith("claude-")
    ? isSimpleTransaction(input)
      ? "claude-haiku-4-5-20251001"
      : "claude-sonnet-4-6"
    : resolvedModel;

  const userMessage = formatTransactionForPrompt(input);

  try {
    const result = await adapter.classify({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      tools: [CLASSIFY_TOOL_DEF],
      toolChoice: "classify_transaction",
      maxTokens: 300,
    });

    if (!result) return null;

    const input_ = result.toolInput as {
      type: TxType;
      confidence: number;
      reasoning: string;
    };
    return {
      classifiedType: input_.type,
      confidence: Math.min(1, Math.max(0, input_.confidence)),
      reasoning: input_.reasoning,
      model: result.model,
    };
  } catch {
    return null;
  }
}
```

Remove `import Anthropic from "@anthropic-ai/sdk"`, remove `CLASSIFY_TOOL` (Anthropic format), remove `getClient`, remove `resetClient`, remove `client` variable.

For `classifyBatch`, add optional `userId` param:

```typescript
export async function classifyBatch(
  inputs: ClassificationInput[],
  userId?: string,
): Promise<(ClassificationResult | null)[]> {
  const results: (ClassificationResult | null)[] = [];
  for (const input of inputs) {
    results.push(await classifyTransaction(input, userId));
    if (inputs.length > 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return results;
}
```

**Step 2: Update existing tests**

In `apps/api/src/__tests__/ai-classify.test.ts`, update mocks:

- Replace `vi.mock("../lib/ai-classifier")` to mock the new `resolveProvider` from `"../lib/llm"` if needed, or keep mocking `classifyTransaction` directly since it's still exported from `ai-classifier.ts`.
- Ensure tests still pass with the same behavior.

**Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/ai-classify.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/lib/ai-classifier.ts apps/api/src/__tests__/ai-classify.test.ts
git commit -m "refactor: migrate ai-classifier to use LlmAdapter"
```

---

## Task 7: Migrate chat-service.ts to use adapters

**Files:**

- Modify: `apps/api/src/lib/chat-service.ts`
- Modify: `apps/api/src/__tests__/chat.test.ts`

**Step 1: Refactor chat-service.ts**

Key changes:

- Remove direct Anthropic SDK usage
- Use `resolveProvider("chat", ctx.userId)` to get adapter
- Keep `SYSTEM_PROMPT`, `CHAT_TOOLS` definitions, `executeTool`, `ChatToolContext` unchanged
- Convert `CHAT_TOOLS` from Anthropic format to `ToolDefinition[]`
- `chatCompletion` and `chatCompletionStream` now use adapter
- The tool execution loop stays in chat-service (not in adapter) — adapter returns one round of tool calls, service loops

The refactored `chatCompletion`:

```typescript
import { resolveProvider } from "./llm";
import type { ToolDefinition } from "./llm";

// Convert CHAT_TOOLS to ToolDefinition format
const CHAT_TOOL_DEFS: ToolDefinition[] = [
  {
    name: "get_tax_summary",
    description:
      "Get the user's tax summary for a specific year and cost basis method",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "number", description: "Tax year (e.g., 2025)" },
        method: {
          type: "string",
          enum: ["FIFO", "LIFO", "HIFO"],
          description: "Cost basis method",
        },
      },
      required: ["year"],
    },
  },
  // ... same for other 3 tools, converted from Anthropic format to inputSchema
];

export async function chatCompletion(
  messages: ChatMessage[],
  ctx: ChatToolContext,
): Promise<{
  content: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}> {
  const { adapter, model } = await resolveProvider("chat", ctx.userId);

  const allToolCalls: Array<{ name: string; input: Record<string, unknown> }> =
    [];
  let currentMessages = [...messages];

  // Tool use loop (max 5 iterations)
  for (let i = 0; i < 5; i++) {
    const result = await adapter.chat({
      model,
      systemPrompt: SYSTEM_PROMPT,
      messages: currentMessages,
      tools: CHAT_TOOL_DEFS,
      maxTokens: 1500,
    });

    if (result.toolCalls.length === 0) {
      return { content: result.content, toolCalls: allToolCalls };
    }

    // Execute tools and continue
    for (const tc of result.toolCalls) {
      allToolCalls.push(tc);
      const toolResult = await executeTool(tc.name, tc.input, ctx);
      // Append assistant message + tool result as user message for next round
      currentMessages = [
        ...currentMessages,
        {
          role: "assistant" as const,
          content: result.content || `[Calling ${tc.name}]`,
        },
        {
          role: "user" as const,
          content: `Tool ${tc.name} result: ${toolResult}`,
        },
      ];
    }
  }

  return {
    content:
      "I encountered an issue processing your request. Please try again.",
    toolCalls: allToolCalls,
  };
}
```

**Important:** The streaming version (`chatCompletionStream`) follows the same pattern but uses `adapter.chatStream()`.

Remove: `import Anthropic from "@anthropic-ai/sdk"`, remove `getClient`, `resetChatClient`, `client` variable, remove `CHAT_TOOLS` (Anthropic format).

Keep: `executeTool`, `ChatToolContext`, `ChatMessage`, `SYSTEM_PROMPT` — these are service-level concerns, not adapter concerns.

**Step 2: Update tests**

Update `apps/api/src/__tests__/chat.test.ts` to mock `resolveProvider` from `"../lib/llm"` instead of mocking the Anthropic SDK directly. Or keep mocking `chatCompletion`/`chatCompletionStream` at the function level since tests likely mock those.

**Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/chat.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/lib/chat-service.ts apps/api/src/__tests__/chat.test.ts
git commit -m "refactor: migrate chat-service to use LlmAdapter"
```

---

## Task 8: Add test-connection endpoints and update system routes

**Files:**

- Modify: `apps/api/src/routes/system.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/__tests__/system.test.ts`

**Step 1: Add POST /system/ai/test-connection to system.ts**

After the existing PUT route, add:

```typescript
import { getPreset } from "../lib/llm/presets";
import { AnthropicAdapter } from "../lib/llm/anthropic-adapter";
import { OpenAICompatAdapter } from "../lib/llm/openai-compat-adapter";

// POST /system/ai/test-connection — Test an AI provider connection (SUPER_ADMIN)
r.post(
  "/system/ai/test-connection",
  {
    onRequest: [requireRole("SUPER_ADMIN")],
    schema: {
      tags: ["system"],
      operationId: "testAiConnection",
      description: "Test connection to an AI provider",
      body: z.object({
        providerId: z.string(),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        model: z.string().optional(),
      }),
      response: {
        200: z.object({
          data: z.object({
            success: z.boolean(),
            error: z.string().optional(),
          }),
          error: z.null(),
        }),
        403: errorResponseSchema,
      },
    },
  },
  async (request) => {
    const { providerId, apiKey, baseUrl, model } = request.body as {
      providerId: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
    const preset = getPreset(providerId);
    const adapterType = preset?.adapter ?? "openai_compat";
    const testModel = model ?? preset?.defaultModel ?? "gpt-4o-mini";

    try {
      let adapter;
      if (adapterType === "anthropic") {
        adapter = new AnthropicAdapter({ apiKey: apiKey ?? "" });
      } else {
        const url = baseUrl ?? preset?.baseUrl ?? "";
        adapter = new OpenAICompatAdapter({ apiKey, baseUrl: url });
      }
      const success = await adapter.testConnection();
      return { data: { success }, error: null };
    } catch (err: any) {
      return { data: { success: false, error: err.message }, error: null };
    }
  },
);
```

**Step 2: Add GET /system/ai/presets to system.ts**

```typescript
import { PROVIDER_PRESETS } from "../lib/llm/presets";

// GET /system/ai/presets — List all provider presets (ADMIN+)
r.get(
  "/system/ai/presets",
  {
    onRequest: [requireRole("ADMIN")],
    schema: {
      tags: ["system"],
      operationId: "getAiPresets",
      description: "List all available AI provider presets",
      response: {
        200: z.object({ data: z.array(z.any()), error: z.null() }),
      },
    },
  },
  async () => {
    // Return presets without sensitive defaults
    const presets = Object.values(PROVIDER_PRESETS).map((p) => ({
      id: p.id,
      name: p.name,
      adapter: p.adapter,
      baseUrl: p.baseUrl,
      defaultModel: p.defaultModel,
      models: p.models,
      requiresApiKey: p.requiresApiKey,
      apiKeyUrl: p.apiKeyUrl,
    }));
    return { data: presets, error: null };
  },
);
```

**Step 3: Update system.ts PUT handler to encrypt API key**

In the PUT `/system/config/:key` handler, when key is `ai_config`, encrypt the apiKey before storing:

```typescript
import { encryptKey } from "../lib/encryption";

// Inside the PUT handler, before upsert:
if (key === "ai_config" && typeof value === "object" && value !== null) {
  const v = value as Record<string, unknown>;
  if (v.apiKey && typeof v.apiKey === "string" && !v.apiKey.includes(":")) {
    // Encrypt raw API key (if not already encrypted — encrypted keys contain ":")
    v.apiKey = encryptKey(v.apiKey);
  }
}
```

**Step 4: Add POST /auth/ai/test-connection to auth.ts**

For user BYOK testing (PRO/CPA only). Add after the preferences endpoints:

```typescript
// POST /auth/ai/test-connection — Test user's AI provider connection
r.post(
  "/auth/ai/test-connection",
  {
    schema: {
      tags: ["auth"],
      operationId: "testUserAiConnection",
      body: z.object({
        providerId: z.string(),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        model: z.string().optional(),
      }),
      response: {
        200: z.object({
          data: z.object({
            success: z.boolean(),
            error: z.string().optional(),
          }),
          error: z.null(),
        }),
      },
    },
  },
  async (request) => {
    // Same logic as system endpoint but accessible to authenticated users
    const { providerId, apiKey, baseUrl, model } = request.body as {
      providerId: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
    const preset = getPreset(providerId);
    const adapterType = preset?.adapter ?? "openai_compat";

    try {
      let adapter;
      if (adapterType === "anthropic") {
        adapter = new AnthropicAdapter({ apiKey: apiKey ?? "" });
      } else {
        const url = baseUrl ?? preset?.baseUrl ?? "";
        adapter = new OpenAICompatAdapter({ apiKey, baseUrl: url });
      }
      const success = await adapter.testConnection();
      return { data: { success }, error: null };
    } catch (err: any) {
      return { data: { success: false, error: err.message }, error: null };
    }
  },
);
```

Add import: `import { getPreset } from "../lib/llm/presets";` and `import { AnthropicAdapter } from "../lib/llm/anthropic-adapter";` and `import { OpenAICompatAdapter } from "../lib/llm/openai-compat-adapter";`

Also add `/api/v1/auth/ai/test-connection` to verification-exempt paths in `apps/api/src/plugins/auth.ts`.

**Step 5: Update auth.ts PATCH /auth/preferences to encrypt BYOK apiKey**

In the PATCH preferences handler, encrypt the API key if aiProvider is being set:

```typescript
import { encryptKey } from "../lib/encryption";

// In the PATCH handler, before updating:
if (body.aiProvider && typeof body.aiProvider === "object") {
  const ap = body.aiProvider as Record<string, unknown>;
  if (ap.apiKey && typeof ap.apiKey === "string" && !ap.apiKey.includes(":")) {
    ap.apiKey = encryptKey(ap.apiKey);
  }
}
```

Also extend the `updatePreferencesBodySchema` to include `aiProvider`:

```typescript
const updatePreferencesBodySchema = z
  .object({
    chatModel: z.enum(["fast", "smart"]).optional(),
    autoClassify: z.boolean().optional(),
    defaultMethod: z.string().optional(),
    jurisdiction: z.string().optional(),
    displayCurrency: z.string().optional(),
    emailNotifications: z.boolean().optional(),
    importCompleteNotif: z.boolean().optional(),
    reportReadyNotif: z.boolean().optional(),
    subscriptionExpiringNotif: z.boolean().optional(),
    aiProvider: z
      .object({
        providerId: z.string(),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        model: z.string().optional(),
      })
      .optional(),
  })
  .openapi({ ref: "UpdatePreferencesBody" });
```

**Step 6: Write tests and run**

Run: `cd apps/api && npx vitest run src/__tests__/system.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/api/src/routes/system.ts apps/api/src/routes/auth.ts apps/api/src/plugins/auth.ts apps/api/src/__tests__/system.test.ts
git commit -m "feat: add test-connection endpoints and provider presets API"
```

---

## Task 9: Update ai-classify routes to pass userId

**Files:**

- Modify: `apps/api/src/routes/ai-classify.ts`

**Step 1: Pass userId to classifyTransaction calls**

In `ai-classify.ts`, update the classify calls to pass `request.userId`:

```typescript
// In POST /transactions/ai-classify handler:
const result = await classifyTransaction(classInput, request.userId);

// In POST /transactions/ai-classify-all handler:
results.push(await classifyTransaction(classInput, request.userId));
```

**Step 2: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/ai-classify.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/api/src/routes/ai-classify.ts
git commit -m "feat: pass userId to AI classifier for BYOK resolution"
```

---

## Task 10: Add client-side API functions

**Files:**

- Modify: `apps/web/src/lib/api.ts`

**Step 1: Add new API functions**

Add at the end of the file (before the closing export or at the end):

```typescript
// ─── AI Provider Management ─────────────────────

export interface AiPreset {
  id: string;
  name: string;
  adapter: "anthropic" | "openai_compat";
  baseUrl?: string;
  defaultModel: string;
  models: string[];
  requiresApiKey: boolean;
  apiKeyUrl?: string;
}

export async function getAiPresets(): Promise<{ data: AiPreset[] }> {
  return apiFetch("/system/ai/presets");
}

export async function testAiConnection(params: {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<{ data: { success: boolean; error?: string } }> {
  return apiFetch("/system/ai/test-connection", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function testUserAiConnection(params: {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<{ data: { success: boolean; error?: string } }> {
  return apiFetch("/auth/ai/test-connection", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add AI provider API functions to web client"
```

---

## Task 11: Overhaul Admin System AI Config UI

**Files:**

- Modify: `apps/web/src/app/[locale]/admin/system/page.tsx`
- Modify: `apps/web/messages/en.json` (then copy keys to other 6 locales)

**Step 1: Add i18n keys**

Add to `admin` section of `en.json`:

```json
"aiProvider": "AI Provider",
"aiProviderDesc": "Select the LLM provider and configure API credentials",
"selectProvider": "Select Provider",
"apiKey": "API Key",
"apiKeyPlaceholder": "Enter API key",
"apiKeyHelp": "Get your API key at",
"baseUrl": "Base URL",
"baseUrlPlaceholder": "Custom endpoint URL",
"testConnection": "Test Connection",
"testing": "Testing...",
"connectionSuccess": "Connection successful",
"connectionFailed": "Connection failed",
"classificationModel": "Classification Model",
"chatModel": "Chat Model",
"customModel": "Custom Model",
"customModelPlaceholder": "Enter model name"
```

Add the same keys (translated) to zh.json, zh-Hant.json, es.json, ja.json, ko.json, pt.json.

**Step 2: Rewrite the AI Configuration card**

Replace the current AI Configuration card in `admin/system/page.tsx` with:

```tsx
// New state variables (replace the old classification/chat model states)
const [providerId, setProviderId] = useState("anthropic");
const [apiKey, setApiKey] = useState("");
const [baseUrl, setBaseUrl] = useState("");
const [classModel, setClassModel] = useState("");
const [chatModelVal, setChatModelVal] = useState("");
const [presets, setPresets] = useState<AiPreset[]>([]);
const [testStatus, setTestStatus] = useState<
  "" | "testing" | "success" | "error"
>("");
const [customClassModel, setCustomClassModel] = useState("");
const [customChatModel, setCustomChatModel] = useState("");
```

Import `getAiPresets`, `testAiConnection`, `type AiPreset` from `@/lib/api`.

Load presets in `loadConfig`:

```typescript
const presetsRes = await getAiPresets();
setPresets(presetsRes.data);
```

When loading ai_config from SystemConfig:

```typescript
if (cfg.ai_config) {
  setProviderId(cfg.ai_config.provider || "anthropic");
  // API key is encrypted — show masked "••••" if exists
  setApiKey(cfg.ai_config.apiKey ? "••••••••" : "");
  setBaseUrl(cfg.ai_config.baseUrl || "");
  setClassModel(cfg.ai_config.classificationModel || "");
  setChatModelVal(cfg.ai_config.chatModel || "");
  // Keep quotas
  setQuotaFree(cfg.ai_config.quotaFree ?? 5);
  setQuotaPro(cfg.ai_config.quotaPro ?? 50);
  setQuotaCpa(cfg.ai_config.quotaCpa ?? 100);
}
```

The UI card renders:

1. Provider dropdown (from presets)
2. API Key input (password type, with link to apiKeyUrl)
3. Base URL input (shown for azure/custom, or editable override)
4. Classification Model dropdown (from selected preset's models + custom input)
5. Chat Model dropdown (from selected preset's models + custom input)
6. Test Connection button
7. Budget and Quotas (keep existing)
8. Save button

When saving:

```typescript
const handleSaveAiConfig = () => {
  const value: Record<string, unknown> = {
    provider: providerId,
    classificationModel: customClassModel || classModel,
    chatModel: customChatModel || chatModelVal,
    monthlyBudget: monthlyBudget ? Number(monthlyBudget) : null,
    quotaFree,
    quotaPro,
    quotaCpa,
  };
  // Only include apiKey if it was changed (not the masked placeholder)
  if (apiKey && apiKey !== "••••••••") {
    value.apiKey = apiKey;
  }
  if (baseUrl) {
    value.baseUrl = baseUrl;
  }
  saveSection("ai_config", value);
};
```

Test connection handler:

```typescript
const handleTestConnection = async () => {
  setTestStatus("testing");
  try {
    const res = await testAiConnection({
      providerId,
      apiKey: apiKey !== "••••••••" ? apiKey : undefined,
      baseUrl: baseUrl || undefined,
      model: customClassModel || classModel || undefined,
    });
    setTestStatus(res.data.success ? "success" : "error");
  } catch {
    setTestStatus("error");
  }
  setTimeout(() => setTestStatus(""), 3000);
};
```

**Step 3: Run type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add "apps/web/src/app/[locale]/admin/system/page.tsx" apps/web/messages/*.json
git commit -m "feat: overhaul admin AI config UI with multi-provider support"
```

---

## Task 12: Add BYOK card to User Settings page

**Files:**

- Modify: `apps/web/src/app/[locale]/settings/page.tsx`
- Modify: `apps/web/messages/en.json` (then copy to other 6 locales)

**Step 1: Add i18n keys**

Add to `settings` section of `en.json`:

```json
"byokTitle": "Custom AI Provider (BYOK)",
"byokSubtitle": "PRO/CPA users can configure their own LLM provider and API key",
"byokProvider": "Provider",
"byokApiKey": "API Key",
"byokModel": "Model",
"byokBaseUrl": "Base URL (optional)",
"byokTest": "Test Connection",
"byokTesting": "Testing...",
"byokSuccess": "Connected",
"byokFailed": "Connection failed",
"byokSave": "Save Provider",
"byokSaved": "Provider saved",
"byokClear": "Use System Default",
"byokFreePlan": "Custom AI provider is available for PRO and CPA plans"
```

Translate to all 6 other locales.

**Step 2: Add BYOK card in settings page**

After the existing "AI & Notification Preferences" card, add a new card that:

1. Checks if user plan is PRO or CPA (show upgrade prompt if FREE)
2. Shows provider dropdown (from presets fetched via `getAiPresets()`)
3. Shows API key input, model selector, optional base URL
4. Test Connection button
5. Save button (calls `updateUserPreferences({ aiProvider: { providerId, apiKey, model, baseUrl } })`)
6. "Use System Default" button to clear BYOK

Load BYOK state from `getUserPreferences()` on mount.

**Step 3: Run type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add "apps/web/src/app/[locale]/settings/page.tsx" apps/web/messages/*.json
git commit -m "feat: add BYOK AI provider card to user settings"
```

---

## Task 13: Run full test suite and type checks

**Files:** (No new files — validation only)

**Step 1: Run all API tests**

Run: `cd apps/api && npx vitest run`
Expected: ALL PASS (313+ tests)

**Step 2: Run web type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 3: Run tax-engine tests**

Run: `cd packages/tax-engine && npx vitest run`
Expected: ALL PASS (819 tests)

**Step 4: Fix any failures**

If any test fails, fix the issue before proceeding.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test failures from AI multi-provider migration"
```

---

## Execution Summary

| Task | Description                             | New Files  | Modified Files      |
| ---- | --------------------------------------- | ---------- | ------------------- |
| 1    | Extract encryption to shared module     | 2          | 1                   |
| 2    | LlmAdapter interface + 15 presets       | 2 + 1 test | 0                   |
| 3    | AnthropicAdapter                        | 1 + 1 test | 0                   |
| 4    | OpenAICompatAdapter + openai pkg        | 1 + 1 test | 0                   |
| 5    | Factory + config resolver               | 2 + 1 test | 0                   |
| 6    | Migrate ai-classifier                   | 0          | 2                   |
| 7    | Migrate chat-service                    | 0          | 2                   |
| 8    | Test-connection endpoints + presets API | 0          | 3                   |
| 9    | Pass userId to classify                 | 0          | 1                   |
| 10   | Client API functions                    | 0          | 1                   |
| 11   | Admin system AI config UI overhaul      | 0          | 8 (7 i18n + 1 page) |
| 12   | User BYOK settings card                 | 0          | 8 (7 i18n + 1 page) |
| 13   | Full test suite validation              | 0          | varies              |

**Total: ~10 new files, ~26 file modifications, ~15 provider presets**
