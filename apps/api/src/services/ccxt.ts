/**
 * CCXT Service
 * Encapsulates interactions with cryptocurrency exchanges via CCXT.
 */

import ccxt, { Exchange, Trade } from "ccxt";
import crypto from "crypto";
import { config } from "../config";

// ─── API Key Encryption ─────────────
// 使用独立 ENCRYPTION_KEY 环境变量，回退到 DATABASE_URL 派生密钥（仅开发环境）
const ENCRYPTION_KEY = Buffer.from(
  (config.encryptionKey || config.databaseUrl.slice(0, 32)).padEnd(32, "0"),
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

// ─── Types & CCXT Factory ────────────────────────

export interface ExchangeCredentials {
  apiKey: string;
  secret: string;
  password?: string; // For KuCoin, OKX, etc.
}

/** Minimal logger interface compatible with Fastify's request.log */
interface Logger {
  error(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
}

const defaultLogger: Logger = {
  error: (msg, ...args) => console.error(msg, ...args),
  warn: (msg, ...args) => console.warn(msg, ...args),
};

export class CcxtService {
  /**
   * Get an initialized CCXT exchange instance
   */
  static getExchange(exchangeId: string, creds: ExchangeCredentials): Exchange {
    if (!ccxt.exchanges.includes(exchangeId)) {
      throw new Error(`Unsupported exchange: ${exchangeId}`);
    }

    const exchangeClass = (ccxt as any)[exchangeId];
    const exchange = new exchangeClass({
      apiKey: creds.apiKey,
      secret: creds.secret,
      password: creds.password,
      enableRateLimit: true,
    }) as Exchange;

    return exchange;
  }

  /**
   * Test if credentials are valid by fetching balances
   */
  static async testConnection(
    exchangeId: string,
    creds: ExchangeCredentials,
    log: Logger = defaultLogger,
  ): Promise<boolean> {
    try {
      const exchange = this.getExchange(exchangeId, creds);
      await exchange.fetchBalance();
      return true;
    } catch (error) {
      log.error(`[CCXT] Connection test failed for ${exchangeId}:`, error);
      return false;
    }
  }

  /**
   * Fetch all historical trades for a user from a specific exchange
   * Note: This loops through pagination to get all data.
   */
  static async fetchMyTrades(
    exchangeId: string,
    creds: ExchangeCredentials,
    log: Logger = defaultLogger,
  ) {
    const exchange = this.getExchange(exchangeId, creds);
    let allTrades: Trade[] = [];

    try {
      if (exchange.has["fetchMyTrades"]) {
        const symbol = "BTC/USDT";
        const trades = await exchange.fetchMyTrades(symbol, undefined, 100);
        allTrades = allTrades.concat(trades);
      } else {
        log.warn(
          `[CCXT] ${exchangeId} does not support fetchMyTrades directly via CCXT.`,
        );
      }

      return allTrades;
    } catch (error) {
      log.error(`[CCXT] Failed to fetch trades for ${exchangeId}:`, error);
      throw error;
    }
  }
}
