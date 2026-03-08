/**
 * 认证路由
 * POST /auth/register — 注册账号
 * POST /auth/login    — 登录获取 JWT
 * GET  /auth/me       — 获取当前用户信息
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {

    // POST /auth/register（速率限制：每分钟 5 次）
    app.post('/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = registerSchema.parse(request.body);

        const existing = await prisma.user.findUnique({ where: { email: body.email } });
        if (existing) {
            return reply.status(409).send({
                error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
            });
        }

        const passwordHash = await bcrypt.hash(body.password, 12);
        const user = await prisma.user.create({
            data: { email: body.email, passwordHash, name: body.name },
        });

        const token = app.jwt.sign({ sub: user.id, role: user.role });

        return reply.status(201).send({
            data: { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } },
        });
    });

    // POST /auth/login（速率限制：每分钟 10 次）
    app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = loginSchema.parse(request.body);

        const user = await prisma.user.findUnique({ where: { email: body.email } });
        if (!user) {
            return reply.status(401).send({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
            });
        }

        const valid = await bcrypt.compare(body.password, user.passwordHash);
        if (!valid) {
            return reply.status(401).send({
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
            });
        }

        const token = app.jwt.sign({ sub: user.id, role: user.role });

        return { data: { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } } };
    });

    // POST /auth/refresh — 刷新 token（需要有效的现有 token）
    app.post('/auth/refresh', async (request, reply) => {
        // request.userId is set by the auth plugin (token was valid)
        const user = await prisma.user.findUnique({
            where: { id: request.userId },
            select: { id: true, role: true },
        });

        if (!user) {
            return reply.status(401).send({
                error: { code: 'UNAUTHORIZED', message: 'User not found' },
            });
        }

        const token = app.jwt.sign({ sub: user.id, role: user.role });
        return { data: { token } };
    });

    // GET /auth/me — 需要认证
    app.get('/auth/me', async (request, reply) => {
        const user = await prisma.user.findUnique({
            where: { id: request.userId },
            select: { id: true, email: true, name: true, role: true, createdAt: true },
        });

        if (!user) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'User not found' },
            });
        }

        return { data: user };
    });
}
