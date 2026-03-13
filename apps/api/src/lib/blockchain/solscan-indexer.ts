/**
 * Solscan blockchain indexer.
 * Fetches Solana transaction history via Solscan public API.
 * Requires SOLSCAN_API_KEY in env.
 */

const SOLSCAN_API_URL = "https://pro-api.solscan.io/v2.0";

interface SolscanRawTx {
  txHash: string;
  signer: string[];
  status: string;
  timestamp: number;
  fee: number;
  mainActions: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
}

export interface NormalizedSolTx {
  hash: string;
  type: "TRANSFER_IN" | "TRANSFER_OUT" | "SWAP" | "UNKNOWN";
  from: string;
  to: string;
  amountLamports: string;
  feeLamports: string;
  timestamp: Date;
  isError: boolean;
  chain: "solana";
}

export function normalizeSolscanTx(
  raw: SolscanRawTx,
  userAddress: string,
): NormalizedSolTx {
  let type: NormalizedSolTx["type"] = "UNKNOWN";
  let from = "";
  let to = "";
  let amountLamports = "0";

  if (raw.mainActions && raw.mainActions.length > 0) {
    const action = raw.mainActions[0];
    if (action.type === "SOL_TRANSFER" || action.type === "SPL_TRANSFER") {
      const data = action.data as {
        source?: string;
        destination?: string;
        amount?: number;
      };
      from = (data.source || "") as string;
      to = (data.destination || "") as string;
      amountLamports = String(data.amount || 0);
      type = from === userAddress ? "TRANSFER_OUT" : "TRANSFER_IN";
    } else if (action.type === "SWAP" || action.type === "AGG_SWAP") {
      type = "SWAP";
    }
  }

  if (!from && raw.signer.length > 0) {
    from = raw.signer[0];
  }

  return {
    hash: raw.txHash,
    type,
    from,
    to,
    amountLamports,
    feeLamports: String(raw.fee),
    timestamp: new Date(raw.timestamp * 1000),
    isError: raw.status !== "Success",
    chain: "solana",
  };
}

interface SolFetchConfig {
  address: string;
  apiKey: string;
  beforeTxHash?: string;
  limit?: number;
}

export async function fetchSolscanTransactions(
  config: SolFetchConfig,
): Promise<NormalizedSolTx[]> {
  if (!config.apiKey) {
    throw new Error("Solscan API key is required");
  }

  const params = new URLSearchParams({
    address: config.address,
    page_size: String(config.limit || 40),
  });

  if (config.beforeTxHash) {
    params.set("before_tx", config.beforeTxHash);
  }

  const response = await fetch(
    `${SOLSCAN_API_URL}/account/transactions?${params}`,
    {
      headers: {
        token: config.apiKey,
      },
    },
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    throw new Error(`Solscan API error: ${response.status}`);
  }

  const data = (await response.json()) as { data: SolscanRawTx[] };
  const rawTxs: SolscanRawTx[] = data.data || [];
  return rawTxs.map((tx) => normalizeSolscanTx(tx, config.address));
}
