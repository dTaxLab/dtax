/**
 * Notification API Routes
 *
 * GET  /notifications           — List notifications with unread count
 * POST /notifications/:id/read  — Mark single notification as read
 * POST /notifications/read-all  — Mark all notifications as read
 * DELETE /notifications/:id     — Delete a notification
 */

import { FastifyInstance } from "fastify";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../lib/notification.js";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // GET /notifications — list with unread count
  app.get(
    "/notifications",
    {
      schema: {
        tags: ["notifications"],
        summary: "List notifications with unread count",
        querystring: {
          type: "object" as const,
          properties: {
            limit: { type: "number" as const },
            offset: { type: "number" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            properties: {
              data: {
                type: "array" as const,
                items: { type: "object" as const, additionalProperties: true },
              },
              unreadCount: { type: "number" as const },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const query = request.query as { limit?: string; offset?: string };
      const result = await getNotifications(
        request.userId,
        parseInt(query.limit || "20"),
        parseInt(query.offset || "0"),
      );
      return reply.send(result);
    },
  );

  // POST /notifications/:id/read — mark single as read
  app.post(
    "/notifications/:id/read",
    {
      schema: {
        tags: ["notifications"],
        summary: "Mark notification as read",
        params: {
          type: "object" as const,
          properties: { id: { type: "string" as const } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await markAsRead(id, request.userId);
      return reply.send({ data: { success: true } });
    },
  );

  // POST /notifications/read-all — mark all as read
  app.post(
    "/notifications/read-all",
    {
      schema: {
        tags: ["notifications"],
        summary: "Mark all notifications as read",
      },
    },
    async (request, reply) => {
      await markAllAsRead(request.userId);
      return reply.send({ data: { success: true } });
    },
  );

  // DELETE /notifications/:id
  app.delete(
    "/notifications/:id",
    {
      schema: {
        tags: ["notifications"],
        summary: "Delete a notification",
        params: {
          type: "object" as const,
          properties: { id: { type: "string" as const } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await deleteNotification(id, request.userId);
      return reply.send({ data: { success: true } });
    },
  );
}
