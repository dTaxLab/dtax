/**
 * CPA Guard — Access control for CPA multi-client management.
 *
 * Verifies that a user has an active CPA subscription and that
 * they have permission to access a specific client's data.
 */

import { prisma } from "../lib/prisma";

export interface CpaAccessResult {
  allowed: boolean;
  reason?: string;
}

export interface CpaClientAccessResult {
  allowed: boolean;
  clientUserId?: string;
}

/**
 * Check whether a user has an active CPA plan subscription.
 *
 * Args:
 *   userId: The authenticated user's ID.
 *
 * Returns:
 *   CpaAccessResult with allowed flag and optional rejection reason.
 */
export async function checkCpaAccess(userId: string): Promise<CpaAccessResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  if (!subscription || subscription.plan !== "CPA") {
    return { allowed: false, reason: "CPA_PLAN_REQUIRED" };
  }
  return { allowed: true };
}

/**
 * Verify that a CPA user has access to a specific client.
 *
 * Args:
 *   cpaUserId: The CPA user's ID.
 *   clientId: The client record ID to verify access for.
 *
 * Returns:
 *   CpaClientAccessResult with allowed flag and the client's linked userId.
 */
export async function verifyCpaClientAccess(
  cpaUserId: string,
  clientId: string,
): Promise<CpaClientAccessResult> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, cpaUserId, status: "ACTIVE" },
  });
  if (!client || !client.userId) {
    return { allowed: false };
  }
  return { allowed: true, clientUserId: client.userId };
}
