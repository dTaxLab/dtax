/**
 * Plan Guard — Transaction quota enforcement for FREE plan users.
 *
 * FREE plan: 50 transaction limit
 * PRO / CPA: unlimited
 */

import { prisma } from "../lib/prisma";

const FREE_TX_LIMIT = 50;

export interface QuotaResult {
  allowed: boolean;
  current: number;
  limit: number;
  plan: string;
}

/**
 * Check whether a user is allowed to create more transactions.
 *
 * Args:
 *   userId: The authenticated user's ID.
 *
 * Returns:
 *   QuotaResult with allowed flag, current count, limit, and plan name.
 */
export async function checkTransactionQuota(
  userId: string,
): Promise<QuotaResult> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const plan = sub?.plan ?? "FREE";

  if (plan !== "FREE") {
    return { allowed: true, current: 0, limit: Infinity, plan };
  }

  const count = await prisma.transaction.count({ where: { userId } });
  return {
    allowed: count < FREE_TX_LIMIT,
    current: count,
    limit: FREE_TX_LIMIT,
    plan,
  };
}
