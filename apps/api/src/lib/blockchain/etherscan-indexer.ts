/**
 * Etherscan-compatible blockchain indexer.
 * Fetches transaction history via Etherscan/Polygonscan/BSCscan public APIs.
 * Requires ETHERSCAN_API_KEY in env.
 */

const CHAIN_API_URLS: Record<string, string> = {
  ethereum: "https://api.etherscan.io/api",
  polygon: "https://api.polygonscan.com/api",
  bsc: "https://api.bscscan.com/api",
  arbitrum: "https://api.arbiscan.io/api",
  optimism: "https://api-optimistic.etherscan.io/api",
};

interface EtherscanRawTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  gasUsed: string;
  timeStamp: string;
  isError: string;
  functionName: string;
  contractAddress: string;
}

export interface NormalizedBlockchainTx {
  hash: string;
  type: "TRANSFER_IN" | "TRANSFER_OUT" | "CONTRACT_CALL" | "UNKNOWN";
  from: string;
  to: string;
  valueWei: string;
  gasFeeWei: string;
  timestamp: Date;
  isError: boolean;
  chain: string;
}

export function normalizeEtherscanTx(
  raw: EtherscanRawTx,
  userAddress: string,
  chain: string,
): NormalizedBlockchainTx {
  const from = raw.from.toLowerCase();
  const to = raw.to.toLowerCase();
  const user = userAddress.toLowerCase();

  let type: NormalizedBlockchainTx["type"] = "UNKNOWN";
  if (from === user && to === user) {
    type = "CONTRACT_CALL";
  } else if (from === user) {
    type = "TRANSFER_OUT";
  } else if (to === user) {
    type = "TRANSFER_IN";
  }

  // If the tx has a contractAddress or functionName, it may be a contract call
  if (raw.contractAddress || raw.functionName) {
    type = "CONTRACT_CALL";
  }

  return {
    hash: raw.hash,
    type,
    from: raw.from,
    to: raw.to,
    valueWei: raw.value,
    gasFeeWei: (BigInt(raw.gasPrice) * BigInt(raw.gasUsed)).toString(),
    timestamp: new Date(parseInt(raw.timeStamp, 10) * 1000),
    isError: raw.isError === "1",
    chain,
  };
}

interface FetchConfig {
  address: string;
  apiKey: string;
  chain?: string;
  startBlock?: number;
  endBlock?: number;
}

export async function fetchEtherscanTransactions(
  config: FetchConfig,
): Promise<NormalizedBlockchainTx[]> {
  const chain = config.chain || "ethereum";
  const baseUrl = CHAIN_API_URLS[chain];
  if (!baseUrl) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  if (!config.apiKey) {
    throw new Error("Etherscan API key is required");
  }

  const params = new URLSearchParams({
    module: "account",
    action: "txlist",
    address: config.address,
    startblock: String(config.startBlock ?? 0),
    endblock: String(config.endBlock ?? 99999999),
    sort: "asc",
    apikey: config.apiKey,
  });

  const response = await fetch(`${baseUrl}?${params}`);
  if (!response.ok) {
    throw new Error(`Etherscan API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    status: string;
    message: string;
    result: EtherscanRawTx[] | string;
  };
  if (data.status !== "1" && data.message !== "No transactions found") {
    // Rate limited or error
    if (
      typeof data.result === "string" &&
      data.result.includes("Max rate limit")
    ) {
      throw new Error("RATE_LIMITED");
    }
    return [];
  }

  const rawTxs: EtherscanRawTx[] = Array.isArray(data.result)
    ? data.result
    : [];
  return rawTxs.map((tx) => normalizeEtherscanTx(tx, config.address, chain));
}
