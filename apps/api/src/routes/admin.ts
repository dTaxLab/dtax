/**
 * 管理员路由
 * 所有端点要求 ADMIN 角色。
 *
 * GET    /admin/stats         — 系统概览
 * GET    /admin/users         — 用户列表
 * GET    /admin/users/:id     — 用户详情
 * PATCH  /admin/users/:id/role — 修改用户角色
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

// 管理员权限守卫
async function adminGuard(request: FastifyRequest, reply: FastifyReply) {
  if (request.userRole !== "ADMIN") {
    return reply.status(403).send({
      error: { code: "FORBIDDEN", message: "Admin access required" },
    });
  }
}

export async function adminRoutes(app: FastifyInstance) {
  // 所有 admin 路由添加权限检查
  app.addHook("onRequest", adminGuard);

  // GET /admin/stats — 系统概览统计
  app.get("/admin/stats", async () => {
    const [userCount, txCount, dsCount, reportCount, proCount, cpaCount] =
      await Promise.all([
        prisma.user.count(),
        prisma.transaction.count(),
        prisma.dataSource.count(),
        prisma.taxReport.count(),
        prisma.subscription.count({ where: { plan: "PRO", status: "active" } }),
        prisma.subscription.count({ where: { plan: "CPA", status: "active" } }),
      ]);

    return {
      data: {
        users: userCount,
        transactions: txCount,
        dataSources: dsCount,
        taxReports: reportCount,
        proUsers: proCount,
        cpaUsers: cpaCount,
      },
    };
  });

  // GET /admin/users — 用户列表（分页）
  app.get("/admin/users", async (request) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);

    const skip = (query.page - 1) * query.limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          _count: {
            select: { transactions: true, dataSources: true },
          },
        },
      }),
      prisma.user.count(),
    ]);

    return {
      data: users,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // GET /admin/users/:id — 用户详情
  app.get("/admin/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            transactions: true,
            dataSources: true,
            taxLots: true,
            taxReports: true,
          },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: `User ${id} not found` },
      });
    }

    return { data: user };
  });

  // PATCH /admin/users/:id/role — 修改用户角色
  app.patch("/admin/users/:id/role", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        role: z.enum(["USER", "ADMIN"]),
      })
      .parse(request.body);

    // 防止管理员降级自己
    if (id === request.userId && body.role !== "ADMIN") {
      return reply.status(400).send({
        error: {
          code: "SELF_DEMOTION",
          message: "Cannot remove your own admin role",
        },
      });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: `User ${id} not found` },
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role: body.role },
      select: { id: true, email: true, role: true },
    });

    return { data: updated };
  });
}
