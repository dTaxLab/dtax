/**
 * DTax API Server
 *
 * Fastify-based REST API for the DTax cloud platform.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { config } from './config';
import { prisma } from './lib/prisma';
import { healthRoutes } from './routes/health';
import { transactionRoutes } from './routes/transactions';
import { importRoutes } from './routes/import';
import { taxRoutes } from './routes/tax';
import { connectionRoutes } from './routes/connections';
import { transferRoutes } from './routes/transfers';
import { portfolioRoutes } from './routes/portfolio';
import { priceRoutes } from './routes/prices';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import authPlugin from './plugins/auth';

async function main() {
    const app = Fastify({
        logger: {
            level: config.nodeEnv === 'production' ? 'info' : 'debug',
            transport:
                config.nodeEnv !== 'production'
                    ? { target: 'pino-pretty', options: { colorize: true } }
                    : undefined,
        },
    });

    // Global error handler
    app.setErrorHandler((error: Error, request, reply) => {
        // Zod validation errors → 400
        if (error instanceof ZodError) {
            const issues = error.issues.map(i => ({
                path: i.path.join('.'),
                message: i.message,
            }));
            return reply.status(400).send({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: issues,
                },
            });
        }

        // Prisma known errors → appropriate status
        const errorWithCode = error as Error & { code?: string; statusCode?: number };
        if (errorWithCode.code === 'P2025') {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Record not found' },
            });
        }

        // Log unexpected errors
        request.log.error(error);

        // Don't leak internals in production
        const msg = config.nodeEnv === 'production'
            ? 'Internal server error'
            : error.message;

        return reply.status(errorWithCode.statusCode || 500).send({
            error: { code: 'INTERNAL_ERROR', message: msg },
        });
    });

    // Plugins
    await app.register(cors, {
        origin: config.corsOrigin,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    });
    await app.register(multipart, {
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    });
    await app.register(authPlugin);

    // Routes
    await app.register(authRoutes, { prefix: '/api/v1' });
    await app.register(healthRoutes, { prefix: '/api' });
    await app.register(transactionRoutes, { prefix: '/api/v1' });
    await app.register(importRoutes, { prefix: '/api/v1' });
    await app.register(taxRoutes, { prefix: '/api/v1' });
    await app.register(connectionRoutes, { prefix: '/api/v1' });
    await app.register(transferRoutes, { prefix: '/api/v1' });
    await app.register(portfolioRoutes, { prefix: '/api/v1' });
    await app.register(priceRoutes, { prefix: '/api/v1' });
    await app.register(adminRoutes, { prefix: '/api/v1' });

    // Graceful shutdown
    const shutdown = async () => {
        app.log.info('Shutting down...');
        await prisma.$disconnect();
        await app.close();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start
    try {
        await app.listen({ host: config.host, port: config.port });
        app.log.info(`🚀 DTax API running at http://${config.host}:${config.port}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
