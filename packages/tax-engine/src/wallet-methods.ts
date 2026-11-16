/**
 * Methods the US rules apply wallet by wallet. From 1 January 2025 the
 * first-in, first-out default for digital assets applies wallet by wallet
 * (26 CFR 1.1012-1(j)(1)) or account by account (Rev. Proc. 2024-28). Other
 * countries pool or average across everything, so a wallet must never be
 * imposed on their methods: they always see every wallet.
 */
import type { CostBasisMethod } from "./types";

export const WALLET_BY_WALLET_METHODS: ReadonlySet<CostBasisMethod> =
  new Set<CostBasisMethod>(["FIFO", "LIFO", "HIFO", "SPECIFIC_ID"]);
