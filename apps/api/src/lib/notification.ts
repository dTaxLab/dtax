/**
 * Notification service for in-app notifications.
 *
 * Provides CRUD operations for user notifications including
 * creation, listing, read status management, and deletion.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Create a new notification for a user.
 *
 * Args:
 *   input: Notification creation parameters.
 *
 * Returns:
 *   The created notification record.
 */
export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type as any,
      title: input.title,
      message: input.message,
      data: input.data
        ? (input.data as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

/**
 * Get paginated notifications for a user with unread count.
 *
 * Args:
 *   userId: The user's ID.
 *   limit: Maximum number of notifications to return.
 *   offset: Number of notifications to skip.
 *
 * Returns:
 *   Object with notification data array and unread count.
 */
export async function getNotifications(userId: string, limit = 20, offset = 0) {
  const [data, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { data, unreadCount };
}

/**
 * Get the count of unread notifications for a user.
 *
 * Args:
 *   userId: The user's ID.
 *
 * Returns:
 *   Number of unread notifications.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * Mark a single notification as read.
 *
 * Args:
 *   notificationId: The notification's ID.
 *   userId: The user's ID (for ownership verification).
 *
 * Returns:
 *   Prisma batch payload with count of updated records.
 */
export async function markAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
}

/**
 * Mark all unread notifications as read for a user.
 *
 * Args:
 *   userId: The user's ID.
 *
 * Returns:
 *   Prisma batch payload with count of updated records.
 */
export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

/**
 * Delete a notification owned by a user.
 *
 * Args:
 *   notificationId: The notification's ID.
 *   userId: The user's ID (for ownership verification).
 *
 * Returns:
 *   Prisma batch payload with count of deleted records.
 */
export async function deleteNotification(
  notificationId: string,
  userId: string,
) {
  return prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
}
