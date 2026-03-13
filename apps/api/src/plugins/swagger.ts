/**
 * Swagger/OpenAPI plugin for DTax API.
 *
 * Uses fastify-zod-openapi to bridge Zod schemas into OpenAPI 3.1 spec.
 * Provides interactive API documentation at /docs.
 */

import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { FastifyInstance } from "fastify";
import {
  fastifyZodOpenApiPlugin,
  fastifyZodOpenApiTransform,
  fastifyZodOpenApiTransformObject,
  validatorCompiler,
} from "fastify-zod-openapi";
import type { FastifySerializerCompiler } from "fastify/types/schema";

export async function registerSwagger(app: FastifyInstance) {
  // 1. Register zod-openapi plugin (must come before swagger)
  await app.register(fastifyZodOpenApiPlugin);

  // 2. Set Zod-based validator compiler for request validation
  app.setValidatorCompiler(validatorCompiler);

  // 3. Permissive serializer — response schemas are used for OpenAPI docs only,
  //    not for runtime validation. We override the default fast-json-stringify
  //    which would reject Zod-generated JSON Schemas it can't compile.
  const permissiveSerializer: FastifySerializerCompiler<unknown> =
    () => (data) =>
      JSON.stringify(data);
  app.setSerializerCompiler(permissiveSerializer);

  // 4. Register swagger with zod-openapi transform
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
        { name: "billing", description: "Stripe billing and subscriptions" },
        { name: "ai", description: "AI classification and chat" },
        {
          name: "admin",
          description: "Admin operations (requires ADMIN role)",
        },
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
    transform: fastifyZodOpenApiTransform,
    transformObject: fastifyZodOpenApiTransformObject,
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
