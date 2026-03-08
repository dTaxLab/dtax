/**
 * Transaction CRUD routes.
 * POST /transactions       — Create transaction(s)
 * GET  /transactions       — List transactions (paginated)
 * GET  /transactions/:id   — Get single transaction
 * PUT  /transactions/:id   — Update transaction
 * DELETE /transactions/:id — Delete transaction
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

// ─── Validation Schemas ─────────────────────────

const createTransactionSchema = z.object({
    type: z.enum([
        'BUY', 'SELL', 'TRADE', 'TRANSFER_IN', 'TRANSFER_OUT',
        'AIRDROP', 'STAKING_REWARD', 'MINING_REWARD', 'INTEREST',
        'GIFT_RECEIVED', 'GIFT_SENT', 'LOST', 'STOLEN', 'FORK',
        'MARGIN_TRADE', 'LIQUIDATION', 'INTERNAL_TRANSFER', 'UNKNOWN',
    ]),
    timestamp: z.string().datetime(),
    sentAsset: z.string().optional(),
    sentAmount: z.number().optional(),
    sentValueUsd: z.number().optional(),
    receivedAsset: z.string().optional(),
    receivedAmount: z.number().optional(),
    receivedValueUsd: z.number().optional(),
    feeAsset: z.string().optional(),
    feeAmount: z.number().optional(),
    feeValueUsd: z.number().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    sourceId: z.string().uuid().optional(),
});

const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    asset: z.string().optional(),
    type: z.string().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
});

// ─── Temp User ID (until auth is implemented) ───
const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';

// ─── Routes ─────────────────────────────────────

export async function transactionRoutes(app: FastifyInstance) {

    // POST /transactions — Create transaction(s)
    app.post('/transactions', async (request, reply) => {
        const body = createTransactionSchema.parse(request.body);

        const transaction = await prisma.transaction.create({
            data: {
                userId: TEMP_USER_ID,
                type: body.type,
                timestamp: new Date(body.timestamp),
                sentAsset: body.sentAsset,
                sentAmount: body.sentAmount,
                sentValueUsd: body.sentValueUsd,
                receivedAsset: body.receivedAsset,
                receivedAmount: body.receivedAmount,
                receivedValueUsd: body.receivedValueUsd,
                feeAsset: body.feeAsset,
                feeAmount: body.feeAmount,
                feeValueUsd: body.feeValueUsd,
                notes: body.notes,
                tags: body.tags || [],
                sourceId: body.sourceId,
            },
        });

        return reply.status(201).send({
            data: transaction,
            meta: { requestId: request.id, timestamp: new Date().toISOString() },
        });
    });

    // GET /transactions — List transactions (paginated)
    app.get('/transactions', async (request) => {
        const query = listQuerySchema.parse(request.query);
        const skip = (query.page - 1) * query.limit;

        // Build where clause
        const where: Record<string, unknown> = { userId: TEMP_USER_ID };
        if (query.type) where.type = query.type;
        if (query.asset) {
            where.OR = [
                { sentAsset: query.asset },
                { receivedAsset: query.asset },
            ];
        }
        if (query.from || query.to) {
            where.timestamp = {};
            if (query.from) (where.timestamp as Record<string, unknown>).gte = new Date(query.from);
            if (query.to) (where.timestamp as Record<string, unknown>).lte = new Date(query.to);
        }

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip,
                take: query.limit,
            }),
            prisma.transaction.count({ where }),
        ]);

        return {
            data: transactions,
            meta: {
                total,
                page: query.page,
                limit: query.limit,
                totalPages: Math.ceil(total / query.limit),
            },
        };
    });

    // GET /transactions/export — Export all transactions as CSV
    app.get('/transactions/export', async (request, reply) => {
        const query = z.object({
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
        }).parse(request.query);

        const where: Record<string, unknown> = { userId: TEMP_USER_ID };
        if (query.from || query.to) {
            where.timestamp = {};
            if (query.from) (where.timestamp as Record<string, unknown>).gte = new Date(query.from);
            if (query.to) (where.timestamp as Record<string, unknown>).lte = new Date(query.to);
        }

        const transactions = await prisma.transaction.findMany({
            where,
            orderBy: { timestamp: 'asc' },
        });

        const headers = [
            'Date', 'Type', 'Sent Asset', 'Sent Amount', 'Sent Value (USD)',
            'Received Asset', 'Received Amount', 'Received Value (USD)',
            'Fee Asset', 'Fee Amount', 'Fee Value (USD)', 'Notes',
        ];

        const escapeCsv = (val: string | null | undefined): string => {
            if (val === null || val === undefined) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = transactions.map(tx => [
            tx.timestamp.toISOString(),
            tx.type,
            escapeCsv(tx.sentAsset),
            tx.sentAmount?.toString() || '',
            tx.sentValueUsd?.toString() || '',
            escapeCsv(tx.receivedAsset),
            tx.receivedAmount?.toString() || '',
            tx.receivedValueUsd?.toString() || '',
            escapeCsv(tx.feeAsset),
            tx.feeAmount?.toString() || '',
            tx.feeValueUsd?.toString() || '',
            escapeCsv(tx.notes),
        ].join(','));

        const csv = [headers.join(','), ...rows].join('\n');

        return reply
            .header('Content-Type', 'text/csv')
            .header('Content-Disposition', 'attachment; filename="dtax-transactions.csv"')
            .send(csv);
    });

    // GET /transactions/:id — Get single transaction
    app.get('/transactions/:id', async (request, reply) => {
        const { id } = request.params as { id: string };

        const transaction = await prisma.transaction.findFirst({
            where: { id, userId: TEMP_USER_ID },
        });

        if (!transaction) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: `Transaction ${id} not found` },
            });
        }

        return { data: transaction };
    });

    // PUT /transactions/:id — Update transaction
    app.put('/transactions/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = createTransactionSchema.partial().parse(request.body);

        const existing = await prisma.transaction.findFirst({
            where: { id, userId: TEMP_USER_ID },
        });

        if (!existing) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: `Transaction ${id} not found` },
            });
        }

        const updated = await prisma.transaction.update({
            where: { id },
            data: {
                ...body,
                timestamp: body.timestamp ? new Date(body.timestamp) : undefined,
            },
        });

        return { data: updated };
    });

    // DELETE /transactions/:id — Delete transaction
    app.delete('/transactions/:id', async (request, reply) => {
        const { id } = request.params as { id: string };

        const existing = await prisma.transaction.findFirst({
            where: { id, userId: TEMP_USER_ID },
        });

        if (!existing) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: `Transaction ${id} not found` },
            });
        }

        await prisma.transaction.delete({ where: { id } });

        return reply.status(204).send();
    });
}
