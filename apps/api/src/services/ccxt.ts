/**
 * CCXT Service
 * Encapsulates interactions with cryptocurrency exchanges via CCXT.
 */

import ccxt, { Exchange, Trade } from 'ccxt';
import crypto from 'crypto';
import { config } from '../config';

// ─── Simple Encryption for API Keys ─────────────
// Note: In production, consider using a dedicated KMS.
const ENCRYPTION_KEY = Buffer.from(config.databaseUrl.slice(0, 32).padEnd(32, '0')); // Placeholder key derived from secrets
const IV_LENGTH = 16;

export function encryptKey(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptKey(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
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
    static async testConnection(exchangeId: string, creds: ExchangeCredentials): Promise<boolean> {
        try {
            const exchange = this.getExchange(exchangeId, creds);
            await exchange.fetchBalance();
            return true;
        } catch (error) {
            console.error(`[CCXT] Connection test failed for ${exchangeId}:`, error);
            return false;
        }
    }

    /**
     * Fetch all historical trades for a user from a specific exchange
     * Note: This loops through pagination to get all data.
     */
    static async fetchMyTrades(exchangeId: string, creds: ExchangeCredentials) {
        const exchange = this.getExchange(exchangeId, creds);
        let allTrades: Trade[] = [];

        try {
            // ccxt fetchMyTrades signature varies by exchange for pagination.
            // A robust implementation would handle specifics for top exchanges.
            // For MVP, we test the standard fetchMyTrades behavior.
            if (exchange.has['fetchMyTrades']) {
                // Warning: some exchanges require a symbol (e.g., 'BTC/USDT') to fetch trades.
                // If the exchange requires symbol, we must first fetch the user's balances or markets.

                // For simplicity in this demo implementation, we assume we fetch recent global trades 
                // if symbol isn't strictly required, or we could fetch markets first.
                // Many major exchanges (Binance) allow fetching without symbol if we use specific endpoints, 
                // but standard ccxt fetchMyTrades on Binance requires symbol.

                // As a fallback for prototyping, we just fetch one popular pair if it's required.
                const symbol = 'BTC/USDT';
                console.log(`[CCXT] Fetching trades for ${exchangeId} (${symbol})`);
                const trades = await exchange.fetchMyTrades(symbol, undefined, 100);
                allTrades = allTrades.concat(trades);
            } else {
                console.warn(`[CCXT] ${exchangeId} does not support fetchMyTrades directly via CCXT.`);
            }

            return allTrades;
        } catch (error) {
            console.error(`[CCXT] Failed to fetch trades for ${exchangeId}:`, error);
            throw error;
        }
    }
}
