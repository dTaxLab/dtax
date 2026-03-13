/**
 * Resolve effective userId for CPA proxy access.
 *
 * When a CPA user passes ?clientId=xxx, this resolves to the client's
 * userId after verifying the CPA has access. Otherwise returns the
 * requesting user's own userId.
 */

import { FastifyRequest } from "fastify";
import { verifyCpaClientAccess } from "./cpa-guard.js";

/**
 * Resolve the effective userId for a request.
 *
 * If clientId query param is present, verify CPA access and return client's userId.
 * Otherwise return the requesting user's own userId.
 *
 * Args:
 *   request: The Fastify request object with userId and query params.
 *
 * Returns:
 *   The effective userId to use for data queries.
 *
 * Raises:
 *   Error with statusCode 403 if CPA does not have access to the client.
 */
export async function resolveUserId(request: FastifyRequest): Promise<string> {
  const query = request.query as Record<string, string>;
  const clientId = query.clientId;

  if (!clientId) return request.userId;

  const result = await verifyCpaClientAccess(request.userId, clientId);
  if (!result.allowed || !result.clientUserId) {
    const error = new Error("No access to this client") as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  }
  return result.clientUserId;
}
