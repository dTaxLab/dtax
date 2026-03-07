/**
 * Core CSV line parser.
 * Zero external dependencies — handles quoted fields, commas in values, etc.
 *
 * @license AGPL-3.0
 */

/**
 * Parse a CSV string into rows of string arrays.
 * Handles: quoted fields, commas inside quotes, escaped quotes (""), CRLF/LF.
 */
export function parseCsvRows(csv: string): string[][] {
    const rows: string[][] = [];
    let current = '';
    let inQuotes = false;
    let row: string[] = [];

    for (let i = 0; i < csv.length; i++) {
        const char = csv[i];
        const next = csv[i + 1];

        if (inQuotes) {
            if (char === '"' && next === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(current.trim());
                current = '';
            } else if (char === '\n') {
                row.push(current.trim());
                current = '';
                if (row.some(cell => cell.length > 0)) {
                    rows.push(row);
                }
                row = [];
            } else if (char === '\r') {
                // Skip (handle CRLF)
            } else {
                current += char;
            }
        }
    }

    // Last row (no trailing newline)
    if (current.length > 0 || row.length > 0) {
        row.push(current.trim());
        if (row.some(cell => cell.length > 0)) {
            rows.push(row);
        }
    }

    return rows;
}

/**
 * Parse CSV string into array of objects keyed by header names.
 */
export function parseCsvToObjects(csv: string): Record<string, string>[] {
    const rows = parseCsvRows(csv);
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const objects: Record<string, string>[] = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const obj: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = row[j] ?? '';
        }
        objects.push(obj);
    }

    return objects;
}

/**
 * Safely parse a number, returning undefined for invalid values.
 */
export function safeParseNumber(value: string | undefined): number | undefined {
    if (!value || value.trim() === '') return undefined;
    const cleaned = value.replace(/[$,]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
}

/**
 * Parse a date string into ISO format, with common format support.
 */
export function safeParseDateToIso(value: string): string | null {
    if (!value || value.trim() === '') return null;

    const trimmed = value.trim();

    // Try ISO format first
    const isoDate = new Date(trimmed);
    if (!isNaN(isoDate.getTime())) {
        return isoDate.toISOString();
    }

    // Try MM/DD/YYYY format
    const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (mdyMatch) {
        const [, month, day, year, hour, min, sec] = mdyMatch;
        const d = new Date(
            parseInt(year), parseInt(month) - 1, parseInt(day),
            parseInt(hour || '0'), parseInt(min || '0'), parseInt(sec || '0')
        );
        if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Try YYYY/MM/DD format
    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (ymdMatch) {
        const [, year, month, day, hour, min, sec] = ymdMatch;
        const d = new Date(
            parseInt(year), parseInt(month) - 1, parseInt(day),
            parseInt(hour || '0'), parseInt(min || '0'), parseInt(sec || '0')
        );
        if (!isNaN(d.getTime())) return d.toISOString();
    }

    return null;
}
