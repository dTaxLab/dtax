import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidAddress,
  isValidEthAddress,
  isValidSolAddress,
} from "../lib/blockchain/address-validator.js";
import {
  normalizeEtherscanTx,
  fetchEtherscanTransactions,
} from "../lib/blockchain/etherscan-indexer.js";
import {
  normalizeSolscanTx,
  fetchSolscanTransactions,
} from "../lib/blockchain/solscan-indexer.js";

describe("Address Validator", () => {
  it("should validate Ethereum addresses", () => {
    expect(
      isValidEthAddress("0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe"),
    ).toBe(true);
    expect(
      isValidEthAddress("0x0000000000000000000000000000000000000000"),
    ).toBe(true);
    expect(isValidEthAddress("invalid")).toBe(false);
    expect(isValidEthAddress("0x123")).toBe(false);
    expect(isValidEthAddress("")).toBe(false);
  });

  it("should validate Solana addresses", () => {
    expect(
      isValidSolAddress("So11111111111111111111111111111111111111112"),
    ).toBe(true);
    expect(isValidSolAddress("11111111111111111111111111111111")).toBe(true); // 32 chars
    expect(isValidSolAddress("invalid!@#")).toBe(false);
    expect(isValidSolAddress("")).toBe(false);
  });

  it("should validate by chain", () => {
    const ethAddr = "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe";
    const solAddr = "So11111111111111111111111111111111111111112";
    expect(isValidAddress(ethAddr, "ethereum")).toBe(true);
    expect(isValidAddress(ethAddr, "polygon")).toBe(true);
    expect(isValidAddress(ethAddr, "bsc")).toBe(true);
    expect(isValidAddress(solAddr, "solana")).toBe(true);
    expect(isValidAddress(ethAddr, "solana")).toBe(false);
    expect(isValidAddress(solAddr, "ethereum")).toBe(false);
    expect(isValidAddress(ethAddr, "unknown")).toBe(false);
  });
});

describe("Etherscan Indexer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should normalize Etherscan transaction", () => {
    const raw = {
      hash: "0xabc123",
      from: "0xSENDER",
      to: "0xUSER",
      value: "1000000000000000000",
      gasPrice: "20000000000",
      gasUsed: "21000",
      timeStamp: "1700000000",
      isError: "0",
      functionName: "",
      contractAddress: "",
    };

    const result = normalizeEtherscanTx(raw, "0xuser", "ethereum");
    expect(result.hash).toBe("0xabc123");
    expect(result.type).toBe("TRANSFER_IN");
    expect(result.valueWei).toBe("1000000000000000000");
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.isError).toBe(false);
    expect(result.chain).toBe("ethereum");
  });

  it("should detect TRANSFER_OUT", () => {
    const raw = {
      hash: "0xdef",
      from: "0xuser",
      to: "0xother",
      value: "500",
      gasPrice: "10",
      gasUsed: "21000",
      timeStamp: "1700000000",
      isError: "0",
      functionName: "",
      contractAddress: "",
    };
    const result = normalizeEtherscanTx(raw, "0xUSER", "ethereum");
    expect(result.type).toBe("TRANSFER_OUT");
  });

  it("should detect CONTRACT_CALL when functionName present", () => {
    const raw = {
      hash: "0xghi",
      from: "0xuser",
      to: "0xcontract",
      value: "0",
      gasPrice: "10",
      gasUsed: "50000",
      timeStamp: "1700000000",
      isError: "0",
      functionName: "swap(uint256,uint256)",
      contractAddress: "",
    };
    const result = normalizeEtherscanTx(raw, "0xuser", "ethereum");
    expect(result.type).toBe("CONTRACT_CALL");
  });

  it("should throw if API key missing", async () => {
    await expect(
      fetchEtherscanTransactions({ address: "0xabc", apiKey: "" }),
    ).rejects.toThrow("Etherscan API key is required");
  });

  it("should throw for unsupported chain", async () => {
    await expect(
      fetchEtherscanTransactions({
        address: "0xabc",
        apiKey: "key",
        chain: "fantom",
      }),
    ).rejects.toThrow("Unsupported chain: fantom");
  });

  it("should fetch and normalize transactions", async () => {
    const mockResponse = {
      status: "1",
      result: [
        {
          hash: "0x111",
          from: "0xuser",
          to: "0xother",
          value: "1000",
          gasPrice: "20",
          gasUsed: "21000",
          timeStamp: "1700000000",
          isError: "0",
          functionName: "",
          contractAddress: "",
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const txs = await fetchEtherscanTransactions({
      address: "0xuser",
      apiKey: "test-key",
      chain: "ethereum",
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].hash).toBe("0x111");
    expect(txs[0].type).toBe("TRANSFER_OUT");

    vi.unstubAllGlobals();
  });
});

describe("Solscan Indexer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should normalize Solscan transaction", () => {
    const raw = {
      txHash: "abc123sol",
      signer: ["UserAddr"],
      status: "Success",
      timestamp: 1700000000,
      fee: 5000,
      mainActions: [
        {
          type: "SOL_TRANSFER",
          data: {
            source: "UserAddr",
            destination: "OtherAddr",
            amount: 1000000000,
          },
        },
      ],
    };

    const result = normalizeSolscanTx(raw, "UserAddr");
    expect(result.hash).toBe("abc123sol");
    expect(result.type).toBe("TRANSFER_OUT");
    expect(result.feeLamports).toBe("5000");
    expect(result.chain).toBe("solana");
  });

  it("should detect TRANSFER_IN for Solana", () => {
    const raw = {
      txHash: "def456",
      signer: ["Sender"],
      status: "Success",
      timestamp: 1700000000,
      fee: 5000,
      mainActions: [
        {
          type: "SOL_TRANSFER",
          data: { source: "Sender", destination: "MyAddr", amount: 500000 },
        },
      ],
    };
    const result = normalizeSolscanTx(raw, "MyAddr");
    expect(result.type).toBe("TRANSFER_IN");
  });

  it("should detect SWAP", () => {
    const raw = {
      txHash: "swap1",
      signer: ["User"],
      status: "Success",
      timestamp: 1700000000,
      fee: 5000,
      mainActions: [{ type: "SWAP", data: {} }],
    };
    const result = normalizeSolscanTx(raw, "User");
    expect(result.type).toBe("SWAP");
  });

  it("should throw if API key missing", async () => {
    await expect(
      fetchSolscanTransactions({ address: "abc", apiKey: "" }),
    ).rejects.toThrow("Solscan API key is required");
  });

  it("should fetch and normalize Solana transactions", async () => {
    const mockResponse = {
      data: [
        {
          txHash: "sol111",
          signer: ["UserAddr"],
          status: "Success",
          timestamp: 1700000000,
          fee: 5000,
          mainActions: [
            {
              type: "SPL_TRANSFER",
              data: { source: "Other", destination: "UserAddr", amount: 100 },
            },
          ],
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const txs = await fetchSolscanTransactions({
      address: "UserAddr",
      apiKey: "test-key",
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].hash).toBe("sol111");
    expect(txs[0].type).toBe("TRANSFER_IN");

    vi.unstubAllGlobals();
  });
});
