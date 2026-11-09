import { describe, it, expect } from "vitest";
import { parsedToLot, parsedToEvent } from "../csv-mapping";
import type { ParsedTransaction } from "../parsers/types";

const tx = (over: Partial<ParsedTransaction>): ParsedTransaction =>
  ({
    type: "BUY",
    timestamp: "2025-03-01T00:00:00Z",
    receivedAsset: "BTC",
    receivedAmount: 1,
    receivedValueUsd: 20000,
    ...over,
  }) as ParsedTransaction;

describe("parsedToLot / parsedToEvent", () => {
  it("a purchase is a lot with its cost, not an event", () => {
    const lot = parsedToLot(tx({}), 3);
    expect(lot).toMatchObject({
      id: "lot-3",
      asset: "BTC",
      amount: 1,
      costBasisUsd: 20000,
    });
    expect(parsedToEvent(tx({}), 3)).toBeNull();
  });

  it("a sale is an event with its proceeds, not a lot", () => {
    const sale = tx({
      type: "SELL",
      sentAsset: "BTC",
      sentAmount: 0.5,
      sentValueUsd: 15000,
      receivedAsset: undefined,
      receivedAmount: undefined,
      receivedValueUsd: undefined,
    });
    expect(parsedToLot(sale, 0)).toBeNull();
    expect(parsedToEvent(sale, 0)).toMatchObject({
      id: "evt-0",
      asset: "BTC",
      amount: 0.5,
      proceedsUsd: 15000,
    });
  });

  it("a trade is both: the coin received is a lot and the coin given up is an event", () => {
    const trade = tx({
      type: "TRADE",
      sentAsset: "ETH",
      sentAmount: 2,
      sentValueUsd: 6000,
      receivedValueUsd: 6000,
    });
    expect(parsedToLot(trade, 1)).not.toBeNull();
    expect(parsedToEvent(trade, 1)).not.toBeNull();
  });

  it("a missing value is $0, not a guess (the calculator then reports the cost as incomplete)", () => {
    expect(
      parsedToLot(tx({ receivedValueUsd: undefined }), 0)?.costBasisUsd,
    ).toBe(0);
  });

  it("a year filter keeps only that year's events", () => {
    const sale = tx({
      type: "SELL",
      sentAsset: "BTC",
      sentAmount: 1,
      sentValueUsd: 1,
    });
    expect(parsedToEvent(sale, 0, 2024)).toBeNull();
    expect(parsedToEvent(sale, 0, 2025)).not.toBeNull();
  });
});
