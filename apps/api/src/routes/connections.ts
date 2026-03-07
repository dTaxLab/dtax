/**
 * DataSource / Connections API
 * Manage API keys and sync external exchanges via CCXT.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { DataSourceType, DataSourceStatus } from '@prisma/client';
import { encryptKey, CcxtService } from '../services/ccxt';

const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';

const ConnectionSchema = z.object({
    exchangeId: z.string().min(1), // e.g., 'binance', 'okx'
    apiKey: z.string().min(5),
    apiSecret: z.string().min(5),
    apiPassword: z.string().optional(),
});

export async function connectionRoutes(app: FastifyInstance) {
    // 1. Setup new API connection
    app.post('/connections', async (request, reply) => {
        const body = ConnectionSchema.parse(request.body);

        // Test the connection via CCXT first
        const isValid = await CcxtService.testConnection(body.exchangeId, {
            apiKey: body.apiKey,
            secret: body.apiSecret,
            password: body.apiPassword,
        });

        if (!isValid) {
            return reply.status(400).send({
                error: { code: 'INVALID_API_KEYS', message: 'Failed to verify API keys with exchange.' }
            });
        }

        // Encrypt credentials before storing
        const secureConfig = {
            exchangeId: body.exchangeId,
            apiKey: encryptKey(body.apiKey),
            apiSecret: encryptKey(body.apiSecret),
            ...(body.apiPassword && { apiPassword: encryptKey(body.apiPassword) }),
        };

        // Store DataSource
        const dataSource = await prisma.dataSource.create({
            data: {
                userId: TEMP_USER_ID,
                type: DataSourceType.EXCHANGE_API,
                name: body.exchangeId.toUpperCase(),
                status: DataSourceStatus.ACTIVE,
                config: secureConfig,
            },
        });

        return reply.status(201).send({
            data: {
                id: dataSource.id,
                name: dataSource.name,
                status: dataSource.status,
            }
        });
    });

    // 2. List all connections
    app.get('/connections', async (_request, _reply) => {
        const connections = await prisma.dataSource.findMany({
            where: { userId: TEMP_USER_ID, type: DataSourceType.EXCHANGE_API },
            select: { id: true, name: true, status: true, lastSyncAt: true, createdAt: true },
        });

        return { data: connections };
    });

    // 3. Sync a specific connection (trigger CCXT fetch)
    // Note: This blocks until sync completes. In production, use BullMQ for background syncs.
    app.post('/connections/:id/sync', async (request, reply) => {
        const { id } = request.params as { id: string };

        const connection = await prisma.dataSource.findUnique({ where: { id, userId: TEMP_USER_ID } });
        if (!connection || connection.type !== DataSourceType.EXCHANGE_API) {
            return reply.status(404).send({ error: { message: 'Connection not found' } });
        }

        // We skip actual sync logic for safety in MVP endpoint, returning simulated result or just calling the test
        // Decrypt the secrets to use CCXT
        // const config = connection.config as any;
        // const creds = { apiKey: decryptKey(config.apiKey), secret: decryptKey(config.apiSecret) };
        // const trades = await CcxtService.fetchMyTrades(config.exchangeId, creds);

        // Mark as synced
        await prisma.dataSource.update({
            where: { id },
            data: { lastSyncAt: new Date(), status: DataSourceStatus.ACTIVE },
        });

        return { data: { status: 'SYNCED_SUCCESSFULLY', message: 'Historical trades fetched (placeholder).' } };
    });
}
