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
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  errorResponseSchema,
  idParamSchema,
  paginationQuerySchema,
} from "../schemas/common";
import { userRoleEnum } from "../schemas/enums";

// 管理员权限守卫
async function adminGuard(request: FastifyRequest, reply: FastifyReply) {
  if (request.userRole !== "ADMIN") {
    return reply.status(403).send({
      error: { code: "FORBIDDEN", message: "Admin access required" },
    });
  }
}

const adminStatsSchema = z
  .object({
    users: z.number().int(),
    transactions: z.number().int(),
    dataSources: z.number().int(),
    taxReports: z.number().int(),
    proUsers: z.number().int(),
    cpaUsers: z.number().int(),
  })
  .openapi({ ref: "AdminStats" });

const adminUserListItemSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: userRoleEnum,
    createdAt: z.date(),
    _count: z.object({
      transactions: z.number().int(),
      dataSources: z.number().int(),
    }),
  })
  .openapi({ ref: "AdminUserListItem" });

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", adminGuard);
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();

  // GET /admin/stats — 系统概览统计
  r.get(
    "/admin/stats",
    {
      schema: {
        tags: ["admin"],
        operationId: "getAdminStats",
        description: "System overview statistics",
        response: {
          200: z.object({
            data: adminStatsSchema,
          }),
        },
      },
    },
    async () => {
      const [userCount, txCount, dsCount, reportCount, proCount, cpaCount] =
        await Promise.all([
          prisma.user.count(),
          prisma.transaction.count(),
          prisma.dataSource.count(),
          prisma.taxReport.count(),
          prisma.subscription.count({
            where: { plan: "PRO", status: "active" },
          }),
          prisma.subscription.count({
            where: { plan: "CPA", status: "active" },
          }),
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
    },
  );

  // GET /admin/users — 用户列表（分页）
  r.get(
    "/admin/users",
    {
      schema: {
        tags: ["admin"],
        operationId: "listAdminUsers",
        description: "List all users (paginated)",
        querystring: paginationQuerySchema,
        response: {
          200: z.object({
            data: z.array(adminUserListItemSchema),
            meta: z.object({
              total: z.number().int(),
              page: z.number().int(),
              limit: z.number().int(),
              totalPages: z.number().int(),
            }),
          }),
        },
      },
    },
    async (request) => {
      const query = request.query;
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
    },
  );

  // GET /admin/users/:id — 用户详情
  r.get(
    "/admin/users/:id",
    {
      schema: {
        tags: ["admin"],
        operationId: "getAdminUser",
        description: "Get user details by ID",
        params: idParamSchema,
        response: {
          200: z.object({
            data: z.object({
              id: z.string().uuid(),
              email: z.string().email(),
              name: z.string().nullable(),
              role: userRoleEnum,
              createdAt: z.date(),
              updatedAt: z.date(),
              _count: z.object({
                transactions: z.number().int(),
                dataSources: z.number().int(),
                taxLots: z.number().int(),
                taxReports: z.number().int(),
              }),
            }),
          }),
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

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
    },
  );

  // PATCH /admin/users/:id/role — 修改用户角色
  r.patch(
    "/admin/users/:id/role",
    {
      schema: {
        tags: ["admin"],
        operationId: "updateUserRole",
        description: "Change a user's role",
        params: idParamSchema,
        body: z.object({
          role: userRoleEnum,
        }),
        response: {
          200: z.object({
            data: z.object({
              id: z.string().uuid(),
              email: z.string().email(),
              role: userRoleEnum,
            }),
          }),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

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
    },
  );
}
