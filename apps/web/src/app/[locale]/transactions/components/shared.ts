/** Shared utilities and styles for transaction components */

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getBadgeClass(type: string) {
  if (
    [
      "BUY",
      "AIRDROP",
      "STAKING_REWARD",
      "MINING_REWARD",
      "LP_REWARD",
      "NFT_MINT",
    ].includes(type)
  )
    return "badge badge-buy";
  if (["SELL", "LIQUIDATION", "NFT_SALE"].includes(type))
    return "badge badge-sell";
  if (["TRADE", "DEX_SWAP", "NFT_PURCHASE"].includes(type))
    return "badge badge-trade";
  if (
    ["WRAP", "UNWRAP", "BRIDGE_OUT", "BRIDGE_IN", "CONTRACT_APPROVAL"].includes(
      type,
    )
  )
    return "badge badge-other";
  return "badge badge-other";
}

export const TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "TRADE",
  "AIRDROP",
  "STAKING_REWARD",
  "MINING_REWARD",
  "INTEREST",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "GIFT_RECEIVED",
  "GIFT_SENT",
  // DeFi
  "DEX_SWAP",
  "LP_DEPOSIT",
  "LP_WITHDRAWAL",
  "LP_REWARD",
  "WRAP",
  "UNWRAP",
  "BRIDGE_OUT",
  "BRIDGE_IN",
  // NFT
  "NFT_MINT",
  "NFT_PURCHASE",
  "NFT_SALE",
];

export const BUY_TYPES = [
  "BUY",
  "AIRDROP",
  "STAKING_REWARD",
  "MINING_REWARD",
  "INTEREST",
  "FORK",
  "GIFT_RECEIVED",
  "LP_REWARD",
  "NFT_MINT",
  "BRIDGE_IN",
  "UNWRAP",
];

/** Types that involve both sent and received sides (swap/exchange) */
export const TWO_SIDED_TYPES = [
  "TRADE",
  "DEX_SWAP",
  "NFT_PURCHASE",
  "LP_DEPOSIT",
  "LP_WITHDRAWAL",
];

/** Types where the asset is an NFT (use collection:tokenId format) */
export const NFT_TYPES = ["NFT_MINT", "NFT_PURCHASE", "NFT_SALE"];

export const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontSize: "14px",
  outline: "none",
};

export const labelStyle = {
  display: "block" as const,
  fontSize: "12px",
  color: "var(--text-muted)",
  marginBottom: "6px",
  fontWeight: 500,
};
