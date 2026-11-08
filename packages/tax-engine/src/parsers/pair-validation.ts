/**
 * Shared check for a trading pair that has already been split into
 * [base, quote]. A pair that fails is rejected (the row is reported as an
 * invalid symbol) instead of being stored with junk in the asset name:
 * separators, spaces, control characters, formula prefixes such as "=" or "@",
 * dated futures suffixes ("27DEC24") or a pair of one asset against itself.
 */

const BASE = /^[A-Z0-9]{1,20}$/;
// A quote starts with a letter: "USDT", "USD1" pass, a dated future "27DEC24" does not.
const QUOTE = /^[A-Z][A-Z0-9]{1,9}$/;

export function cleanPair(
  base: string,
  quote: string,
): [string, string] | null {
  const b = base.trim().toUpperCase();
  const q = quote.trim().toUpperCase();
  if (!BASE.test(b) || !QUOTE.test(q) || b === q) return null;
  return [b, q];
}
