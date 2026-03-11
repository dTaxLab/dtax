/**
 * Plan Guard — Quota enforcement for FREE plan users.
 *
 * Transactions: FREE=50 limit, PRO/CPA=unlimited
 * Chat messages: FREE=5/day, PRO/CPA=unlimited
 */

import { prisma } from "../lib/prisma";

const FREE_TX_LIMIT = 50;
const FREE_CHAT_DAILY_LIMIT = 5;

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

/**
 * Check whether a FREE user can send more chat messages today.
 *
 * Args:
 *   userId: The authenticated user's ID.
 *
 * Returns:
 *   QuotaResult with allowed flag, today's message count, limit, and plan name.
 */
export async function checkChatQuota(userId: string): Promise<QuotaResult> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const plan = sub?.plan ?? "FREE";

  if (plan !== "FREE") {
    return { allowed: true, current: 0, limit: Infinity, plan };
  }

  // Count today's user messages
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayCount = await prisma.chatMessage.count({
    where: {
      conversation: { userId },
      role: "user",
      createdAt: { gte: startOfDay },
    },
  });

  return {
    allowed: todayCount < FREE_CHAT_DAILY_LIMIT,
    current: todayCount,
    limit: FREE_CHAT_DAILY_LIMIT,
    plan,
  };
}
