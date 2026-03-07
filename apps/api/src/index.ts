/**
 * DTax API Server
 *
 * Fastify-based REST API for the DTax cloud platform.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config';
import { prisma } from './lib/prisma';
import { healthRoutes } from './routes/health';
import { transactionRoutes } from './routes/transactions';
import { importRoutes } from './routes/import';
import { taxRoutes } from './routes/tax';

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

    // Plugins
    await app.register(cors, {
        origin: config.corsOrigin,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    });
    await app.register(multipart, {
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    });

    // Routes
    await app.register(healthRoutes, { prefix: '/api' });
    await app.register(transactionRoutes, { prefix: '/api/v1' });
    await app.register(importRoutes, { prefix: '/api/v1' });
    await app.register(taxRoutes, { prefix: '/api/v1' });

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
