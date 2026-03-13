/**
 * Client Management Routes (CPA Multi-Client).
 *
 * POST   /clients/invite   — CPA invites a client by email
 * GET    /clients           — List CPA's clients
 * GET    /clients/:id       — Single client detail
 * POST   /clients/accept    — Client accepts invite via token
 * DELETE /clients/:id       — CPA revokes client access
 * PUT    /clients/:id       — CPA updates client notes/name
 */

import { FastifyInstance } from "fastify";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { checkCpaAccess } from "../plugins/cpa-guard";
import { fetchTaxData, calculateIncome } from "../lib/tax-data";
import { CostBasisCalculator } from "@dtax/tax-engine";

/** Reusable error response schema for OpenAPI. */
const errorResponseSchema = {
  type: "object" as const,
  additionalProperties: true,
  properties: {
    error: {
      type: "object" as const,
      additionalProperties: true,
      properties: {
        code: { type: "string" as const },
        message: { type: "string" as const },
      },
    },
  },
};

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  // POST /clients/invite — CPA invites a client by email
  app.post(
    "/clients/invite",
    {
      schema: {
        tags: ["clients"],
        summary: "Invite a client (CPA only)",
        body: {
          type: "object" as const,
          required: ["email"],
          properties: {
            email: { type: "string" as const, format: "email" },
            name: { type: "string" as const },
          },
        },
        response: {
          201: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  id: { type: "string" as const },
                  inviteToken: { type: "string" as const },
                  status: { type: "string" as const },
                },
              },
            },
          },
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = await checkCpaAccess(request.userId);
      if (!access.allowed) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: access.reason || "CPA plan required",
          },
        });
      }

      const { email, name } = request.body as { email: string; name?: string };
      const inviteToken = crypto.randomUUID();
      const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const client = await prisma.client.create({
        data: {
          email,
          name: name || null,
          cpaUserId: request.userId,
          inviteToken,
          inviteExpiresAt,
        },
      });

      return reply.status(201).send({
        data: {
          id: client.id,
          inviteToken: client.inviteToken,
          status: client.status,
        },
      });
    },
  );

  // GET /clients — List CPA's clients
  app.get(
    "/clients",
    {
      schema: {
        tags: ["clients"],
        summary: "List all clients (CPA only)",
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
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
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = await checkCpaAccess(request.userId);
      if (!access.allowed) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: access.reason || "CPA plan required",
          },
        });
      }

      const clients = await prisma.client.findMany({
        where: { cpaUserId: request.userId },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({ data: clients });
    },
  );

  // GET /clients/:id — Single client detail
  app.get(
    "/clients/:id",
    {
      schema: {
        tags: ["clients"],
        summary: "Get client details (CPA only)",
        params: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
              },
            },
          },
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = await checkCpaAccess(request.userId);
      if (!access.allowed) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: access.reason || "CPA plan required",
          },
        });
      }

      const { id } = request.params as { id: string };
      const client = await prisma.client.findFirst({
        where: { id, cpaUserId: request.userId },
      });

      if (!client) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Client not found" },
        });
      }

      return reply.send({ data: client });
    },
  );

  // POST /clients/accept — Client accepts invite via token
  app.post(
    "/clients/accept",
    {
      schema: {
        tags: ["clients"],
        summary: "Accept a client invitation",
        body: {
          type: "object" as const,
          required: ["inviteToken"],
          properties: {
            inviteToken: { type: "string" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  id: { type: "string" as const },
                  status: { type: "string" as const },
                },
              },
            },
          },
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { inviteToken } = request.body as { inviteToken: string };

      const client = await prisma.client.findUnique({
        where: { inviteToken },
      });

      if (!client) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Invalid invite token" },
        });
      }

      if (client.status !== "PENDING") {
        return reply.status(400).send({
          error: {
            code: "INVALID_STATE",
            message: "Invitation already used or revoked",
          },
        });
      }

      if (client.inviteExpiresAt && client.inviteExpiresAt < new Date()) {
        return reply.status(400).send({
          error: { code: "EXPIRED", message: "Invitation has expired" },
        });
      }

      const updated = await prisma.client.update({
        where: { id: client.id },
        data: {
          userId: request.userId,
          status: "ACTIVE",
          inviteToken: null,
          inviteExpiresAt: null,
        },
      });

      return reply.send({
        data: { id: updated.id, status: updated.status },
      });
    },
  );

  // DELETE /clients/:id — CPA revokes client access
  app.delete(
    "/clients/:id",
    {
      schema: {
        tags: ["clients"],
        summary: "Revoke client access (CPA only)",
        params: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
                properties: {
                  success: { type: "boolean" as const },
                },
              },
            },
          },
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = await checkCpaAccess(request.userId);
      if (!access.allowed) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: access.reason || "CPA plan required",
          },
        });
      }

      const { id } = request.params as { id: string };
      const client = await prisma.client.findFirst({
        where: { id, cpaUserId: request.userId },
      });

      if (!client) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Client not found" },
        });
      }

      await prisma.client.update({
        where: { id },
        data: { status: "REVOKED" },
      });

      return reply.send({ data: { success: true } });
    },
  );

  // PUT /clients/:id — CPA updates client notes/name
  app.put(
    "/clients/:id",
    {
      schema: {
        tags: ["clients"],
        summary: "Update client notes (CPA only)",
        params: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const },
          },
        },
        body: {
          type: "object" as const,
          properties: {
            notes: { type: "string" as const },
            name: { type: "string" as const },
          },
        },
        response: {
          200: {
            type: "object" as const,
            additionalProperties: true,
            properties: {
              data: {
                type: "object" as const,
                additionalProperties: true,
              },
            },
          },
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = await checkCpaAccess(request.userId);
      if (!access.allowed) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: access.reason || "CPA plan required",
          },
        });
      }

      const { id } = request.params as { id: string };
      const { notes, name } = request.body as {
        notes?: string;
        name?: string;
      };

      const client = await prisma.client.findFirst({
        where: { id, cpaUserId: request.userId },
      });

      if (!client) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Client not found" },
        });
      }

      const updateData: Record<string, string | undefined> = {};
      if (notes !== undefined) updateData.notes = notes;
      if (name !== undefined) updateData.name = name;

      const updated = await prisma.client.update({
        where: { id },
        data: updateData,
      });

      return reply.send({ data: updated });
    },
  );

  // POST /clients/batch-report — Generate batch tax reports for multiple clients
  app.post(
    "/clients/batch-report",
    {
      schema: {
        tags: ["clients"],
        summary: "Generate batch tax reports for multiple clients (CPA only)",
        body: {
          type: "object" as const,
          required: ["clientIds", "taxYear", "method"],
          properties: {
            clientIds: {
              type: "array" as const,
              items: { type: "string" as const },
            },
            taxYear: { type: "number" as const },
            method: {
              type: "string" as const,
              enum: ["FIFO", "LIFO", "HIFO"],
            },
          },
        },
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
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = await checkCpaAccess(request.userId);
      if (!access.allowed) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: access.reason || "CPA plan required",
          },
        });
      }

      const { clientIds, taxYear, method } = request.body as {
        clientIds: string[];
        taxYear: number;
        method: "FIFO" | "LIFO" | "HIFO";
      };

      const results: Array<{
        clientId: string;
        clientName?: string | null;
        clientEmail?: string;
        netGainLoss?: number;
        shortTermGL?: number;
        longTermGL?: number;
        transactionCount?: number;
        totalIncome?: number;
        error?: string;
      }> = [];

      for (const clientId of clientIds) {
        try {
          const client = await prisma.client.findFirst({
            where: {
              id: clientId,
              cpaUserId: request.userId,
              status: "ACTIVE",
            },
          });

          if (!client || !client.userId) {
            results.push({ clientId, error: "Client not found or not active" });
            continue;
          }

          const { lots, events } = await fetchTaxData({
            userId: client.userId,
            taxYear,
          });
          const income = await calculateIncome({
            userId: client.userId,
            taxYear,
          });

          if (events.length === 0) {
            results.push({
              clientId,
              clientName: client.name,
              clientEmail: client.email,
              netGainLoss: 0,
              shortTermGL: 0,
              longTermGL: 0,
              transactionCount: 0,
              totalIncome: income.total,
            });
            continue;
          }

          const calculator = new CostBasisCalculator(method);
          calculator.addLots(lots);

          let shortTermGains = 0;
          let shortTermLosses = 0;
          let longTermGains = 0;
          let longTermLosses = 0;

          for (const event of events) {
            const result = calculator.calculate(event);
            if (result.holdingPeriod === "SHORT_TERM") {
              if (result.gainLoss >= 0) shortTermGains += result.gainLoss;
              else shortTermLosses += Math.abs(result.gainLoss);
            } else {
              if (result.gainLoss >= 0) longTermGains += result.gainLoss;
              else longTermLosses += Math.abs(result.gainLoss);
            }
          }

          results.push({
            clientId,
            clientName: client.name,
            clientEmail: client.email,
            netGainLoss:
              shortTermGains -
              shortTermLosses +
              (longTermGains - longTermLosses),
            shortTermGL: shortTermGains - shortTermLosses,
            longTermGL: longTermGains - longTermLosses,
            transactionCount: events.length,
            totalIncome: income.total,
          });
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Calculation failed";
          results.push({ clientId, error: message });
        }
      }

      return reply.send({ data: results });
    },
  );
}
