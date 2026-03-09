/**
 * CSV Core Parser Unit Tests
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import {
  parseCsvRows,
  parseCsvToObjects,
  safeParseNumber,
  safeParseDateToIso,
} from "../parsers/csv-core";

describe("parseCsvRows", () => {
  it("should parse simple CSV", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6\n";
    const rows = parseCsvRows(csv);
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("should handle quoted fields", () => {
    const csv = 'name,value\n"hello, world",42\n';
    const rows = parseCsvRows(csv);
    expect(rows[1][0]).toBe("hello, world");
    expect(rows[1][1]).toBe("42");
  });

  it("should handle escaped quotes", () => {
    const csv = 'a\n"he said ""hello"""\n';
    const rows = parseCsvRows(csv);
    expect(rows[1][0]).toBe('he said "hello"');
  });

  it("should handle CRLF line endings", () => {
    const csv = "a,b\r\n1,2\r\n3,4\r\n";
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["1", "2"]);
  });

  it("should skip empty rows", () => {
    const csv = "a\n\n1\n\n2\n";
    const rows = parseCsvRows(csv);
    expect(rows).toEqual([["a"], ["1"], ["2"]]);
  });

  it("should handle no trailing newline", () => {
    const csv = "a,b\n1,2";
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["1", "2"]);
  });
});

describe("parseCsvToObjects", () => {
  it("should create objects keyed by lowercase headers", () => {
    const csv = "Name,Age\nAlice,30\nBob,25\n";
    const objects = parseCsvToObjects(csv);
    expect(objects).toHaveLength(2);
    expect(objects[0]).toEqual({ name: "Alice", age: "30" });
    expect(objects[1]).toEqual({ name: "Bob", age: "25" });
  });

  it("should return empty for header-only CSV", () => {
    const csv = "Name,Age\n";
    const objects = parseCsvToObjects(csv);
    expect(objects).toHaveLength(0);
  });
});

describe("safeParseNumber", () => {
  it("should parse regular numbers", () => {
    expect(safeParseNumber("42")).toBe(42);
    expect(safeParseNumber("3.14")).toBeCloseTo(3.14);
  });

  it("should strip currency symbols and commas", () => {
    expect(safeParseNumber("$1,234.56")).toBeCloseTo(1234.56);
    expect(safeParseNumber("$100")).toBe(100);
  });

  it("should return undefined for invalid values", () => {
    expect(safeParseNumber("")).toBeUndefined();
    expect(safeParseNumber(undefined)).toBeUndefined();
    expect(safeParseNumber("not-a-number")).toBeUndefined();
  });

  it("should handle negative numbers", () => {
    expect(safeParseNumber("-500")).toBe(-500);
  });
});

describe("safeParseDateToIso", () => {
  it("should parse ISO format", () => {
    const result = safeParseDateToIso("2024-01-15T10:30:00Z");
    expect(result).toBe("2024-01-15T10:30:00.000Z");
  });

  it("should parse MM/DD/YYYY format", () => {
    const result = safeParseDateToIso("01/15/2024");
    expect(result).not.toBeNull();
    expect(result).toContain("2024");
  });

  it("should parse MM/DD/YYYY HH:MM format", () => {
    const result = safeParseDateToIso("01/15/2024 10:30");
    expect(result).not.toBeNull();
  });

  it("should parse YYYY-MM-DD format", () => {
    const result = safeParseDateToIso("2024-06-15");
    expect(result).not.toBeNull();
    expect(result).toContain("2024");
  });

  it("should return null for invalid dates", () => {
    expect(safeParseDateToIso("")).toBeNull();
    expect(safeParseDateToIso("not-a-date")).toBeNull();
  });
});
