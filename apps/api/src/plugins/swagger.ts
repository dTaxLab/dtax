/**
 * Swagger/OpenAPI plugin for DTax API.
 *
 * Provides interactive API documentation at /docs.
 */

import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { FastifyInstance } from "fastify";

export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "DTax API",
        description:
          "Open-source crypto tax calculation and portfolio management API.",
        version: "0.1.0",
        license: {
          name: "AGPL-3.0",
          url: "https://www.gnu.org/licenses/agpl-3.0.html",
        },
      },
      servers: [
        { url: "http://localhost:3001", description: "Local development" },
      ],
      tags: [
        {
          name: "auth",
          description: "Authentication (register, login, profile)",
        },
        {
          name: "transactions",
          description: "Transaction CRUD and import/export",
        },
        {
          name: "tax",
          description: "Tax calculation, Form 8949, Schedule D, reconciliation",
        },
        {
          name: "portfolio",
          description: "Portfolio holdings and tax-loss harvesting",
        },
        { name: "transfers", description: "Internal transfer matching" },
        { name: "connections", description: "Exchange API key management" },
        { name: "prices", description: "Market prices (CoinGecko)" },
        {
          name: "admin",
          description: "Admin operations (requires ADMIN role)",
        },
        { name: "billing", description: "Stripe billing and subscriptions" },
        { name: "chat", description: "AI tax assistant chat" },
        { name: "health", description: "Health checks" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      persistAuthorization: true,
    },
  });
}
