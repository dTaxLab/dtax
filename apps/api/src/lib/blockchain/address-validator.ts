/**
 * Blockchain address validation utilities.
 */

/** Validate an Ethereum-compatible address (0x + 40 hex chars). */
export function isValidEthAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/** Validate a Solana address (base58, 32-44 chars). */
export function isValidSolAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/** Validate address for a given chain. */
export function isValidAddress(address: string, chain: string): boolean {
  switch (chain) {
    case "ethereum":
    case "polygon":
    case "bsc":
    case "arbitrum":
    case "optimism":
      return isValidEthAddress(address);
    case "solana":
      return isValidSolAddress(address);
    default:
      return false;
  }
}
