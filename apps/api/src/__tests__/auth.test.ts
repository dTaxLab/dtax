/**
 * Auth 路由测试
 * 测试注册、登录、me 端点
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { ZodError } from 'zod';
import { authRoutes } from '../routes/auth';

// 模拟 Prisma
vi.mock('../lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
    },
}));

// 模拟 bcryptjs
vi.mock('bcryptjs', () => ({
    default: {
        hash: vi.fn().mockResolvedValue('$2a$12$hashedpassword'),
        compare: vi.fn(),
    },
}));

import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

const mockPrisma = vi.mocked(prisma);
const mockBcrypt = vi.mocked(bcrypt);

function buildAuthApp() {
    const app = Fastify({ logger: false });

    // 注册 JWT（auth 路由需要 app.jwt.sign）
    app.register(jwt, { secret: 'test-secret', sign: { expiresIn: '7d' } });

    // 模拟 auth 装饰器
    app.decorateRequest('userId', '');
    app.decorateRequest('userRole', '');
    app.addHook('onRequest', async (request) => {
        request.userId = 'user-1';
        request.userRole = 'USER';
    });

    // 全局错误处理
    app.setErrorHandler((error: Error, _request, reply) => {
        if (error instanceof ZodError) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
            });
        }
        return reply.status(500).send({ error: { message: error.message } });
    });

    app.register(authRoutes, { prefix: '/api/v1' });
    return app;
}

describe('Auth Routes', () => {
    let app: ReturnType<typeof Fastify>;

    beforeAll(async () => {
        app = buildAuthApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /auth/register', () => {
        it('注册新用户成功返回 201 + token', async () => {
            mockPrisma.user.findUnique.mockResolvedValueOnce(null);
            mockPrisma.user.create.mockResolvedValueOnce({
                id: 'user-1',
                email: 'test@example.com',
                passwordHash: '$2a$12$hash',
                name: 'Test',
                role: 'USER',
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any);

            const res = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/register',
                payload: { email: 'test@example.com', password: 'password123', name: 'Test' },
            });

            expect(res.statusCode).toBe(201);
            const body = JSON.parse(res.body);
            expect(body.data.token).toBeDefined();
            expect(body.data.user.email).toBe('test@example.com');
            expect(body.data.user.role).toBe('USER');
        });

        it('邮箱已存在返回 409', async () => {
            mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' } as any);

            const res = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/register',
                payload: { email: 'taken@example.com', password: 'password123' },
            });

            expect(res.statusCode).toBe(409);
            expect(JSON.parse(res.body).error.code).toBe('EMAIL_EXISTS');
        });

        it('密码太短返回 400', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/register',
                payload: { email: 'short@example.com', password: '123' },
            });

            expect(res.statusCode).toBe(400);
        });
    });

    describe('POST /auth/login', () => {
        it('凭证正确返回 token', async () => {
            mockPrisma.user.findUnique.mockResolvedValueOnce({
                id: 'user-1',
                email: 'test@example.com',
                passwordHash: '$2a$12$hash',
                name: 'Test',
                role: 'USER',
            } as any);
            mockBcrypt.compare.mockResolvedValueOnce(true as never);

            const res = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/login',
                payload: { email: 'test@example.com', password: 'password123' },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.data.token).toBeDefined();
            expect(body.data.user.email).toBe('test@example.com');
        });

        it('邮箱不存在返回 401', async () => {
            mockPrisma.user.findUnique.mockResolvedValueOnce(null);

            const res = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/login',
                payload: { email: 'nobody@example.com', password: 'password123' },
            });

            expect(res.statusCode).toBe(401);
            expect(JSON.parse(res.body).error.code).toBe('INVALID_CREDENTIALS');
        });

        it('密码错误返回 401', async () => {
            mockPrisma.user.findUnique.mockResolvedValueOnce({
                id: 'user-1',
                email: 'test@example.com',
                passwordHash: '$2a$12$hash',
            } as any);
            mockBcrypt.compare.mockResolvedValueOnce(false as never);

            const res = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/login',
                payload: { email: 'test@example.com', password: 'wrongpassword' },
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe('GET /auth/me', () => {
        it('有效 token 返回用户信息', async () => {
            mockPrisma.user.findUnique.mockResolvedValueOnce({
                id: 'user-1',
                email: 'test@example.com',
                name: 'Test',
                role: 'USER',
                createdAt: new Date('2026-01-01'),
            } as any);

            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/auth/me',
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.data.email).toBe('test@example.com');
        });
    });
});
