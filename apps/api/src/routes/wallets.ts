/**
 * Wallet connection routes.
 * POST /wallets/connect    — Connect a wallet address for blockchain indexing
 * GET  /wallets            — List connected wallets
 * POST /wallets/:id/sync   — Trigger incremental sync for a wallet
 * DELETE /wallets/:id      — Disconnect a wallet
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { isValidAddress } from "../lib/blockchain/address-validator.js";
import { logAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notification.js";

const connectSchema = z.object({
  address: z.string().min(1),
  chain: z.enum([
    "ethereum",
    "polygon",
    "bsc",
    "arbitrum",
    "optimism",
    "solana",
  ]),
  label: z.string().optional(),
});

const errorResponseSchema = {
  type: "object" as const,
  properties: {
    error: {
      type: "object" as const,
      properties: {
        code: { type: "string" as const },
        message: { type: "string" as const },
      },
    },
  },
};

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  // POST /wallets/connect
  app.post(
    "/wallets/connect",
    {
      schema: {
        tags: ["wallets"],
        summary: "Connect a wallet address for blockchain transaction indexing",
        body: {
          type: "object" as const,
          required: ["address", "chain"],
          properties: {
            address: { type: "string" as const },
            chain: {
              type: "string" as const,
              enum: [
                "ethereum",
                "polygon",
                "bsc",
                "arbitrum",
                "optimism",
                "solana",
              ],
            },
            label: { type: "string" as const },
          },
        },
        response: {
          201: {
            type: "object" as const,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  dataSourceId: { type: "string" as const },
                  address: { type: "string" as const },
                  chain: { type: "string" as const },
                },
              },
            },
          },
          400: errorResponseSchema,
          409: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = connectSchema.parse(request.body);

      if (!isValidAddress(body.address, body.chain)) {
        return reply.status(400).send({
          error: {
            code: "INVALID_ADDRESS",
            message: "Invalid wallet address for the specified chain",
          },
        });
      }

      // Check if wallet is already connected for this user
      const existing = await prisma.dataSource.findFirst({
        where: {
          userId: request.userId,
          type: "BLOCKCHAIN",
          config: { path: ["address"], equals: body.address.toLowerCase() },
        },
      });

      if (existing) {
        return reply.status(409).send({
          error: {
            code: "ALREADY_CONNECTED",
            message: "This wallet is already connected",
          },
        });
      }

      // Check if blockchain API key is configured
      const isEthChain = [
        "ethereum",
        "polygon",
        "bsc",
        "arbitrum",
        "optimism",
      ].includes(body.chain);
      const apiKey = isEthChain ? config.etherscanApiKey : config.solscanApiKey;
      if (!apiKey) {
        return reply.status(503).send({
          error: {
            code: "NOT_CONFIGURED",
            message: "Blockchain indexer not configured",
          },
        });
      }

      const dataSource = await prisma.dataSource.create({
        data: {
          userId: request.userId,
          type: "BLOCKCHAIN",
          name: body.label || `${body.chain} wallet`,
          config: {
            address: body.address.toLowerCase(),
            chain: body.chain,
          },
        },
      });

      logAudit({
        userId: request.userId,
        action: "CREATE",
        entityType: "wallet",
        entityId: dataSource.id,
        details: {
          chain: body.chain,
          address: body.address.substring(0, 10) + "...",
        },
      }).catch(() => {});

      createNotification({
        userId: request.userId,
        type: "IMPORT_COMPLETE",
        title: "Wallet Connected",
        message: `${body.chain} wallet connected. Sync will start shortly.`,
      }).catch(() => {});

      return reply.status(201).send({
        data: {
          dataSourceId: dataSource.id,
          address: body.address,
          chain: body.chain,
        },
      });
    },
  );

  // GET /wallets — List connected wallets
  app.get(
    "/wallets",
    {
      schema: {
        tags: ["wallets"],
        summary: "List connected wallets",
        response: {
          200: {
            type: "object" as const,
            properties: {
              data: {
                type: "array" as const,
                items: {
                  type: "object" as const,
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const wallets = await prisma.dataSource.findMany({
        where: {
          userId: request.userId,
          type: "BLOCKCHAIN",
        },
        orderBy: { createdAt: "desc" },
      });

      const result = wallets.map((w) => {
        const cfg = w.config as Record<string, unknown> | null;
        return {
          id: w.id,
          name: w.name,
          address: cfg?.address || "",
          chain: cfg?.chain || "",
          status: w.status,
          lastSyncAt: w.lastSyncAt,
          createdAt: w.createdAt,
        };
      });

      return reply.send({ data: result });
    },
  );

  // POST /wallets/:id/sync — Trigger sync
  app.post(
    "/wallets/:id/sync",
    {
      schema: {
        tags: ["wallets"],
        summary: "Trigger incremental sync for a connected wallet",
        params: {
          type: "object" as const,
          properties: { id: { type: "string" as const } },
          required: ["id"],
        },
        response: {
          200: {
            type: "object" as const,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  status: { type: "string" as const },
                },
              },
            },
          },
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const wallet = await prisma.dataSource.findFirst({
        where: {
          id,
          userId: request.userId,
          type: "BLOCKCHAIN",
        },
      });

      if (!wallet) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Wallet not found" },
        });
      }

      // Update lastSyncAt to indicate sync was triggered
      await prisma.dataSource.update({
        where: { id },
        data: { lastSyncAt: new Date() },
      });

      // Note: actual blockchain indexing would be done async via a job queue
      // For now, just mark as synced
      return reply.send({
        data: { status: "sync_triggered" },
      });
    },
  );

  // DELETE /wallets/:id — Disconnect wallet
  app.delete(
    "/wallets/:id",
    {
      schema: {
        tags: ["wallets"],
        summary: "Disconnect a wallet",
        params: {
          type: "object" as const,
          properties: { id: { type: "string" as const } },
          required: ["id"],
        },
        response: {
          200: {
            type: "object" as const,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  deleted: { type: "boolean" as const },
                },
              },
            },
          },
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const wallet = await prisma.dataSource.findFirst({
        where: {
          id,
          userId: request.userId,
          type: "BLOCKCHAIN",
        },
      });

      if (!wallet) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Wallet not found" },
        });
      }

      await prisma.dataSource.update({
        where: { id },
        data: { status: "DISCONNECTED" },
      });

      logAudit({
        userId: request.userId,
        action: "DELETE",
        entityType: "wallet",
        entityId: id,
      }).catch(() => {});

      return reply.send({ data: { deleted: true } });
    },
  );
}
