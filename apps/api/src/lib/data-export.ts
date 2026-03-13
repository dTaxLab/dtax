/**
 * Data Export Service
 * GDPR Article 20: Right to data portability
 * Generates a complete export of all user data.
 */

import { prisma } from "./prisma.js";

/**
 * Exported user data structure for GDPR compliance.
 */
export interface ExportData {
  exportedAt: string;
  metadata: {
    transactionCount: number;
    taxReportCount: number;
    dataSourceCount: number;
  };
  user: Record<string, unknown> | null;
  transactions: unknown[];
  taxLots: unknown[];
  taxReports: unknown[];
  dataSources: unknown[];
  subscription: unknown | null;
  chatConversations: unknown[];
}

/**
 * Generate a complete data export for a user.
 *
 * Fetches all user-owned data across all tables, excluding
 * sensitive fields (passwordHash, config with encrypted API keys).
 *
 * Args:
 *   userId: The ID of the user to export data for.
 *
 * Returns:
 *   ExportData containing all user data with metadata and timestamp.
 */
export async function generateUserDataExport(
  userId: string,
): Promise<ExportData> {
  const [
    user,
    transactions,
    taxLots,
    taxReports,
    dataSources,
    subscription,
    chatConversations,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        deletionRequestedAt: true,
        deletionReason: true,
        // Exclude: passwordHash, totpSecret, recoveryCodes
      },
    }),
    prisma.transaction.findMany({ where: { userId } }),
    prisma.taxLot.findMany({ where: { userId } }),
    prisma.taxReport.findMany({ where: { userId } }),
    prisma.dataSource.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        // Exclude: config (contains encrypted API keys)
      },
    }),
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.chatConversation.findMany({
      where: { userId },
      include: { messages: true },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    metadata: {
      transactionCount: transactions.length,
      taxReportCount: taxReports.length,
      dataSourceCount: dataSources.length,
    },
    user,
    transactions,
    taxLots,
    taxReports,
    dataSources,
    subscription,
    chatConversations,
  };
}
