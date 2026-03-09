/**
 * CSV Parser Integration Tests (parseCsv unified entry)
 *
 * Includes cross-format detection matrix to verify all 16 formats
 * are correctly detected without conflicts.
 *
 * @license AGPL-3.0
 */

import { describe, it, expect } from "vitest";
import { parseCsv, detectCsvFormat } from "../parsers";
import type { CsvFormat } from "../parsers";

/**
 * Canonical header samples for all supported formats.
 * Each entry: [expected format, representative header line]
 */
const FORMAT_HEADERS: [CsvFormat, string][] = [
  [
    "coinbase",
    '"Timestamp","Transaction Type","Asset","Quantity Transacted","Spot Price Currency","Spot Price at Transaction"',
  ],
  ["binance", "Date(UTC),Pair,Side,Price,Executed,Amount,Fee"],
  ["binance_us", "Date,Type,Asset,Amount,Status,Balance,Fee"],
  [
    "kraken",
    '"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"',
  ],
  [
    "etherscan",
    '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","ContractAddress","Value_IN(ETH)","Value_OUT(ETH)","CurrentValue","TxnFee(ETH)","TxnFee(USD)"',
  ],
  [
    "etherscan_erc20",
    '"Txhash","Blockno","UnixTimestamp","DateTime (UTC)","From","To","TokenValue","USDValueDayOfTx","ContractAddress","TokenName","TokenSymbol"',
  ],
  [
    "gemini",
    "Date,Time (UTC),Type,Symbol,Specification,Liquidity Indicator,Trading Fee Rate,Amount,Price,Fee,Fee Currency,Total",
  ],
  [
    "crypto_com",
    "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind",
  ],
  [
    "kucoin",
    "tradeCreatedAt,symbol,direction,deal_price,amount,funds,fee,feeCurrency",
  ],
  [
    "okx",
    "Order ID,Trade ID,Trade Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency",
  ],
  [
    "bybit",
    "Order No,Symbol,Side,Avg. Filled Price,Filled Qty,Total,Fee,Fee Currency,Order Time,Order Type",
  ],
  [
    "gate",
    "No,Currency Pair,Side,Role,Filled Price,Filled Amount,Total,Fee,Fee Currency,Date",
  ],
  [
    "bitget",
    "Order ID,Trading Pair,Side,Filled Price,Filled Amount,Total,Fee,Fee Currency,Order Time,Order Type",
  ],
  ["mexc", "Pairs,Time,Side,Filled Price,Executed Amount,Total,Fee,Role"],
  ["htx", "Time,Pair,Side,Price,Amount,Total,Fee,Fee Currency,Role"],
];

describe("detectCsvFormat — cross-format matrix", () => {
  for (const [expected, header] of FORMAT_HEADERS) {
    it(`detects ${expected}`, () => {
      expect(detectCsvFormat(header + "\n")).toBe(expected);
    });
  }

  it("defaults to generic for unknown headers", () => {
    expect(detectCsvFormat("Date,Type,Amount\n")).toBe("generic");
  });

  it("all format headers are unique (no cross-detection)", () => {
    const detected = FORMAT_HEADERS.map(([expected, header]) => ({
      expected,
      actual: detectCsvFormat(header + "\n"),
    }));
    const mismatches = detected.filter((d) => d.expected !== d.actual);
    expect(mismatches).toEqual([]);
  });
});

describe("detectCsvFormat — API/alternate headers", () => {
  it("detects MEXC API format (commissionAsset)", () => {
    expect(
      detectCsvFormat(
        "symbol,id,orderId,price,qty,quoteQty,commission,commissionAsset,time,isBuyerMaker\n",
      ),
    ).toBe("mexc");
  });

  it("detects HTX API format (filled-amount)", () => {
    expect(
      detectCsvFormat(
        "order-id,symbol,type,price,filled-amount,filled-fees,fee-deduct-currency,role,created-at\n",
      ),
    ).toBe("htx");
  });

  it("detects Bitget API format (priceAvg)", () => {
    expect(
      detectCsvFormat(
        "orderId,symbol,side,priceAvg,size,baseVolume,quoteVolume,fee,feeCurrency,cTime\n",
      ),
    ).toBe("bitget");
  });

  it("detects Bybit API format (execPrice)", () => {
    expect(
      detectCsvFormat(
        "orderId,symbol,side,execPrice,execQty,execValue,execFee,feeCurrency,execTime\n",
      ),
    ).toBe("bybit");
  });

  it("detects KuCoin format (trade_id + direction)", () => {
    expect(
      detectCsvFormat(
        "trade_id,symbol,direction,deal_price,amount,funds,fee,feeCurrency,time\n",
      ),
    ).toBe("kucoin");
  });
});

describe("parseCsv (auto-detect)", () => {
  it("auto-detects and parses Coinbase CSV", () => {
    const csv = `"Timestamp","Transaction Type","Asset","Quantity Transacted","Spot Price Currency","Spot Price at Transaction","Subtotal","Total (inclusive of fees and/or spread)","Fees and/or Spread","Notes"
"2024-01-15T10:30:00Z","Buy","BTC","0.5","USD","43000","21500","21625","125","Test"
`;
    const result = parseCsv(csv);

    expect(result.summary.format).toBe("coinbase");
    expect(result.summary.parsed).toBe(1);
  });

  it("falls back to generic for unknown format", () => {
    const csv = [
      "Type,Timestamp,Received Asset,Received Amount",
      "BUY,2024-01-15T00:00:00Z,BTC,0.5",
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.summary.format).toBe("generic");
    expect(result.summary.parsed).toBe(1);
  });

  it("allows forced format override", () => {
    const csv = [
      "Type,Timestamp,Received Asset,Received Amount",
      "BUY,2024-01-15T00:00:00Z,BTC,0.5",
    ].join("\n");

    const result = parseCsv(csv, { format: "generic" });
    expect(result.summary.format).toBe("generic");
  });
});
