import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// Mock @prisma/client for Prisma.JsonNull and Prisma.InputJsonValue
vi.mock("@prisma/client", () => ({
  Prisma: {
    JsonNull: "DbNull",
    InputJsonValue: {},
  },
}));

import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../lib/notification.js";
import { prisma } from "../lib/prisma.js";

const mockNotif = prisma.notification as any;

describe("Notification Service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should create a notification", async () => {
    mockNotif.create.mockResolvedValue({
      id: "n1",
      type: "IMPORT_COMPLETE",
      readAt: null,
    });
    const result = await createNotification({
      userId: "user-1",
      type: "IMPORT_COMPLETE",
      title: "Import Complete",
      message: "50 transactions imported",
      data: { count: 50 },
    });
    expect(result.id).toBe("n1");
    expect(result.readAt).toBeNull();
  });

  it("should create a notification with null data when no data provided", async () => {
    mockNotif.create.mockResolvedValue({
      id: "n2",
      type: "SYSTEM",
      readAt: null,
    });
    const result = await createNotification({
      userId: "user-1",
      type: "SYSTEM",
      title: "System Notice",
      message: "Maintenance scheduled",
    });
    expect(result.id).toBe("n2");
    expect(mockNotif.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ data: "DbNull" }),
      }),
    );
  });

  it("should get notifications with unread count", async () => {
    mockNotif.findMany.mockResolvedValue([{ id: "n1" }]);
    mockNotif.count.mockResolvedValue(3);
    const result = await getNotifications("user-1");
    expect(result.data).toHaveLength(1);
    expect(result.unreadCount).toBe(3);
  });

  it("should get unread count", async () => {
    mockNotif.count.mockResolvedValue(5);
    const count = await getUnreadCount("user-1");
    expect(count).toBe(5);
  });

  it("should mark notification as read", async () => {
    mockNotif.updateMany.mockResolvedValue({ count: 1 });
    await markAsRead("n1", "user-1");
    expect(mockNotif.updateMany).toHaveBeenCalledWith({
      where: { id: "n1", userId: "user-1" },
      data: expect.objectContaining({ readAt: expect.any(Date) }),
    });
  });

  it("should mark all as read", async () => {
    mockNotif.updateMany.mockResolvedValue({ count: 5 });
    await markAllAsRead("user-1");
    expect(mockNotif.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", readAt: null },
      data: expect.objectContaining({ readAt: expect.any(Date) }),
    });
  });

  it("should delete notification", async () => {
    mockNotif.deleteMany.mockResolvedValue({ count: 1 });
    await deleteNotification("n1", "user-1");
    expect(mockNotif.deleteMany).toHaveBeenCalledWith({
      where: { id: "n1", userId: "user-1" },
    });
  });
});
