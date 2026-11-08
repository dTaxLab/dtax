import { describe, it, expect } from "vitest";
import { cleanPair } from "../parsers/pair-validation";

describe("cleanPair", () => {
  it("accepts ordinary pairs, trims and upper-cases", () => {
    expect(cleanPair("BTC", "USDT")).toEqual(["BTC", "USDT"]);
    expect(cleanPair(" btc ", " usdt ")).toEqual(["BTC", "USDT"]);
    expect(cleanPair("1000PEPE", "USDT")).toEqual(["1000PEPE", "USDT"]);
    expect(cleanPair("BTC", "USD1")).toEqual(["BTC", "USD1"]);
  });
  it("rejects separators, control characters and formula prefixes", () => {
    for (const bad of ["BTC/", "BTC-", "=CMD|X", "@SUM(1)", "A\nB", "", "-"]) {
      expect(cleanPair(bad, "USDT")).toBeNull();
    }
  });
  it("rejects a dated future as quote and an asset against itself", () => {
    expect(cleanPair("BTC", "27DEC24")).toBeNull();
    expect(cleanPair("USDT", "USDT")).toBeNull();
  });
  it("rejects an over-long symbol", () => {
    expect(cleanPair("A".repeat(21), "USDT")).toBeNull();
  });
});
