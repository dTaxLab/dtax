/**
 * Text from a file is data, never an instruction.
 *
 * A CSV cell (a note, a coin name) can hold sentences written to steer an AI
 * assistant. Results therefore carry only numbers and dates, and the one kind of
 * text from a file that does appear, an asset symbol, must look like a symbol.
 *
 * @license AGPL-3.0
 */

const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,19}$/;

export const UNKNOWN_ASSET = "UNKNOWN_ASSET";

/** A coin symbol as it may be shown, or a fixed placeholder. */
export function safeAsset(value: unknown): string {
  return typeof value === "string" && SYMBOL.test(value)
    ? value
    : UNKNOWN_ASSET;
}

/** A finite number rounded to cents, or null. */
export function money(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/** An ISO date (day) from a Date or timestamp, or null. */
export function day(value: unknown): string | null {
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
