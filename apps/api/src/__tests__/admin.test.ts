/**
 * Admin 路由测试
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { adminRoutes } from '../routes/admin';
import '../plugins/auth';

// 模拟 Prisma
vi.mock('../lib/prisma', () => ({
    prisma: {
        user: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        transaction: { count: vi.fn() },
        dataSource: { count: vi.fn() },
        taxReport: { count: vi.fn() },
    },
}));

import { prisma } from '../lib/prisma';
const mockPrisma = vi.mocked(prisma);

function buildAdminApp(role = 'ADMIN') {
    const app = Fastify({ logger: false });

    app.decorateRequest('userId', '');
    app.decorateRequest('userRole', '');
    app.addHook('onRequest', async (request) => {
        request.userId = 'admin-1';
        request.userRole = role;
    });

    app.setErrorHandler((error: Error, _request, reply) => {
        if (error instanceof ZodError) {
            return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed' } });
        }
        return reply.status(500).send({ error: { message: error.message } });
    });

    app.register(adminRoutes, { prefix: '/api/v1' });
    return app;
}

describe('Admin Routes', () => {
    let app: ReturnType<typeof Fastify>;

    beforeAll(async () => {
        app = buildAdminApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('GET /admin/stats', () => {
        it('返回系统统计', async () => {
            mockPrisma.user.count.mockResolvedValueOnce(10);
            mockPrisma.transaction.count.mockResolvedValueOnce(500);
            mockPrisma.dataSource.count.mockResolvedValueOnce(5);
            mockPrisma.taxReport.count.mockResolvedValueOnce(3);

            const res = await app.inject({ method: 'GET', url: '/api/v1/admin/stats' });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.data.users).toBe(10);
            expect(body.data.transactions).toBe(500);
        });
    });

    describe('GET /admin/users', () => {
        it('返回用户列表', async () => {
            mockPrisma.user.findMany.mockResolvedValueOnce([
                { id: 'u1', email: 'a@b.com', name: null, role: 'USER', createdAt: new Date(), _count: { transactions: 5, dataSources: 1 } },
            ] as any);
            mockPrisma.user.count.mockResolvedValueOnce(1);

            const res = await app.inject({ method: 'GET', url: '/api/v1/admin/users' });
            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.data).toHaveLength(1);
            expect(body.meta.total).toBe(1);
        });
    });

    describe('GET /admin/users/:id', () => {
        it('返回用户详情', async () => {
            mockPrisma.user.findUnique.mockResolvedValueOnce({
                id: 'u1', email: 'a@b.com', name: 'A', role: 'USER',
                createdAt: new Date(), updatedAt: new Date(),
                _count: { transactions: 10, dataSources: 2, taxLots: 50, taxReports: 1 },
            } as any);

            const res = await app.inject({ method: 'GET', url: '/api/v1/admin/users/u1' });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body).data.email).toBe('a@b.com');
        });

        it('用户不存在返回 404', async () => {
            mockPrisma.user.findUnique.mockResolvedValueOnce(null);
            const res = await app.inject({ method: 'GET', url: '/api/v1/admin/users/nonexistent' });
            expect(res.statusCode).toBe(404);
        });
    });

    describe('PATCH /admin/users/:id/role', () => {
        it('成功修改角色', async () => {
            mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u2', role: 'USER' } as any);
            mockPrisma.user.update.mockResolvedValueOnce({ id: 'u2', email: 'b@c.com', role: 'ADMIN' } as any);

            const res = await app.inject({
                method: 'PATCH',
                url: '/api/v1/admin/users/u2/role',
                payload: { role: 'ADMIN' },
            });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body).data.role).toBe('ADMIN');
        });

        it('防止自我降级', async () => {
            const res = await app.inject({
                method: 'PATCH',
                url: '/api/v1/admin/users/admin-1/role',
                payload: { role: 'USER' },
            });
            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body).error.code).toBe('SELF_DEMOTION');
        });
    });
});

describe('Admin Guard', () => {
    it('非管理员返回 403', async () => {
        const app = buildAdminApp('USER');
        await app.ready();

        const res = await app.inject({ method: 'GET', url: '/api/v1/admin/stats' });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).error.code).toBe('FORBIDDEN');

        await app.close();
    });
});
