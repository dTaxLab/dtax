/**
 * Account Deletion Service for GDPR compliance.
 *
 * Provides a 30-day grace period between deletion request and execution,
 * allowing users to cancel. After the grace period, all user data is
 * permanently deleted in a single transaction.
 */

import { prisma } from "./prisma.js";

/** Grace period in days before a deletion request is executed. */
const DELETION_GRACE_PERIOD_DAYS = 30;

/**
 * Request account deletion for a user.
 *
 * Sets the deletionRequestedAt timestamp, starting the 30-day grace period.
 *
 * Args:
 *     userId: The ID of the user requesting deletion.
 *     reason: Optional reason for account deletion.
 */
export async function requestAccountDeletion(
  userId: string,
  reason?: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: new Date(),
      deletionReason: reason ?? null,
    },
  });
}

/**
 * Cancel a pending account deletion request.
 *
 * Clears the deletionRequestedAt and deletionReason fields.
 *
 * Args:
 *     userId: The ID of the user cancelling deletion.
 */
export async function cancelAccountDeletion(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: null,
      deletionReason: null,
    },
  });
}

/**
 * Execute permanent deletion of all user data.
 *
 * Deletes all related records in the correct order within a single
 * database transaction to maintain referential integrity.
 *
 * Deletion order (respecting foreign key constraints):
 *   1. ChatMessage (via ChatConversation)
 *   2. ChatConversation
 *   3. PasswordReset
 *   4. TaxReport
 *   5. TaxLot
 *   6. Transaction
 *   7. DataSource
 *   8. Subscription
 *   9. User (last)
 *
 * Args:
 *     userId: The ID of the user to permanently delete.
 */
export async function executeAccountDeletion(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Delete chat messages via conversations owned by this user
    const conversations = await tx.chatConversation.findMany({
      where: { userId },
      select: { id: true },
    });
    const conversationIds = conversations.map((c) => c.id);

    if (conversationIds.length > 0) {
      await tx.chatMessage.deleteMany({
        where: { conversationId: { in: conversationIds } },
      });
    }

    // Delete remaining related records
    await tx.chatConversation.deleteMany({ where: { userId } });
    await tx.passwordReset.deleteMany({ where: { userId } });
    await tx.taxReport.deleteMany({ where: { userId } });
    await tx.taxLot.deleteMany({ where: { userId } });
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.dataSource.deleteMany({ where: { userId } });
    await tx.subscription.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}

/**
 * Find and permanently delete accounts past the 30-day grace period.
 *
 * This should be called periodically (e.g., daily via cron job) to
 * process pending deletion requests.
 *
 * Returns:
 *     The number of accounts deleted.
 */
export async function cleanupDeletedAccounts(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DELETION_GRACE_PERIOD_DAYS);

  const usersToDelete = await prisma.user.findMany({
    where: {
      deletionRequestedAt: {
        lte: cutoffDate,
        not: null,
      },
    },
    select: { id: true },
  });

  for (const user of usersToDelete) {
    await executeAccountDeletion(user.id);
  }

  return usersToDelete.length;
}
