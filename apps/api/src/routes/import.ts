/**
 * CSV Import Route
 * POST /transactions/import — Upload CSV file, parse, and bulk insert
 *
 * Supports: Coinbase, Binance International, Binance US, Generic
 * Auto-detects format or accepts ?format= query parameter
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parseCsv } from '@dtax/tax-engine';
import type { CsvFormat, ParsedTransaction } from '@dtax/tax-engine';

// ─── Temp User ID (until auth is implemented) ───
const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';

const formatSchema = z.enum(['generic', 'coinbase', 'binance', 'binance_us']).optional();

export async function importRoutes(app: FastifyInstance) {

    // POST /transactions/import — CSV file upload
    app.post('/transactions/import', async (request, reply) => {
        // Get optional format from query
        const query = request.query as Record<string, string>;
        const formatParam = formatSchema.parse(query.format);

        let csvContent: string;

        // Try multipart file upload first
        const contentType = request.headers['content-type'] || '';

        if (contentType.includes('multipart/form-data')) {
            const file = await request.file();
            if (!file) {
                return reply.status(400).send({
                    error: { code: 'NO_FILE', message: 'No CSV file uploaded' },
                });
            }

            // Read file content
            const chunks: Buffer[] = [];
            for await (const chunk of file.file) {
                chunks.push(chunk);
            }
            csvContent = Buffer.concat(chunks).toString('utf-8');
        } else if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
            // Accept raw text body
            csvContent = await request.body as string;
        } else {
            return reply.status(400).send({
                error: {
                    code: 'INVALID_CONTENT_TYPE',
                    message: 'Expected multipart/form-data, text/csv, or text/plain',
                },
            });
        }

        if (!csvContent || csvContent.trim().length === 0) {
            return reply.status(400).send({
                error: { code: 'EMPTY_FILE', message: 'CSV file is empty' },
            });
        }

        // Parse CSV
        const parseResult = parseCsv(csvContent, {
            format: formatParam as CsvFormat | undefined,
        });

        if (parseResult.transactions.length === 0) {
            return reply.status(400).send({
                error: {
                    code: 'NO_TRANSACTIONS',
                    message: 'No valid transactions found in CSV',
                },
                data: {
                    errors: parseResult.errors.slice(0, 10), // Limit error count
                    summary: parseResult.summary,
                },
            });
        }

        // Bulk insert into database
        const dbRecords = parseResult.transactions.map((tx: ParsedTransaction) => ({
            userId: TEMP_USER_ID,
            type: tx.type,
            timestamp: new Date(tx.timestamp),
            receivedAsset: tx.receivedAsset || null,
            receivedAmount: tx.receivedAmount || null,
            receivedValueUsd: tx.receivedValueUsd || null,
            sentAsset: tx.sentAsset || null,
            sentAmount: tx.sentAmount || null,
            sentValueUsd: tx.sentValueUsd || null,
            feeAsset: tx.feeAsset || null,
            feeAmount: tx.feeAmount || null,
            feeValueUsd: tx.feeValueUsd || null,
            notes: tx.notes || null,
            tags: [],
        }));

        const created = await prisma.transaction.createMany({
            data: dbRecords,
        });

        return reply.status(201).send({
            data: {
                imported: created.count,
                errors: parseResult.errors.slice(0, 10),
                summary: parseResult.summary,
            },
            meta: {
                requestId: request.id,
                timestamp: new Date().toISOString(),
                format: parseResult.summary.format,
            },
        });
    });
}
