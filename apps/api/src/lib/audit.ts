import { prisma } from "./prisma.js";

interface AuditInput {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action as any,
      entityType: input.entityType,
      entityId: input.entityId || null,
      details: input.details || null,
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
    },
  });
}

interface AuditQuery {
  action?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function getAuditLogs(userId: string, query: AuditQuery = {}) {
  const where: Record<string, unknown> = { userId };
  if (query.action) where.action = query.action;
  if (query.entityType) where.entityType = query.entityType;
  if (query.from || query.to) {
    const createdAt: Record<string, Date> = {};
    if (query.from) createdAt.gte = query.from;
    if (query.to) createdAt.lte = query.to;
    where.createdAt = createdAt;
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit || 50,
      skip: query.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { data, total };
}
