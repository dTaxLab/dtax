/**
 * Shared column name resolver for multi-language CSV parsers.
 * @license AGPL-3.0
 */

/**
 * Normalize a string for comparison: NFC normalize + strip combining marks.
 * Handles Turkish İ→i̇ (i + combining dot) and similar issues.
 */
export function normalizeKey(s: string): string {
  return s.normalize("NFC").replace(/\u0307/g, "");
}

/**
 * Find the first matching column value from a row given a list of candidate names.
 * Headers are already lowercased + trimmed by csv-core.
 * Uses Unicode normalization to handle Turkish İ and similar cases.
 */
export function resolveCol(
  row: Record<string, string>,
  candidates: string[],
): string {
  // Fast path: direct key lookup
  for (const key of candidates) {
    const val = row[key];
    if (val !== undefined && val !== "") return val;
  }
  // Slow path: normalized comparison (handles Turkish İ → i̇ etc.)
  const normalizedCandidates = candidates.map(normalizeKey);
  for (const [rowKey, rowVal] of Object.entries(row)) {
    if (!rowVal) continue;
    const nk = normalizeKey(rowKey);
    if (normalizedCandidates.includes(nk)) return rowVal;
  }
  return "";
}
