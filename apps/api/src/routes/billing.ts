/**
 * Billing routes — Stripe integration
 *
 * GET  /billing/status   — Get current subscription status
 * POST /billing/checkout  — Create Stripe Checkout Session
 * POST /billing/portal    — Create Stripe Customer Portal Session
 * POST /billing/webhook   — Stripe webhook handler (no auth, signature verification)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FastifyZodOpenApiTypeProvider } from "fastify-zod-openapi";
import { z } from "zod";
import Stripe from "stripe";
import { prisma } from "../lib/prisma";
import { errorResponseSchema } from "../schemas/common";

let stripe: Stripe | null = null;

function requireStripe(reply: FastifyReply): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      reply.status(503).send({
        error: {
          code: "STRIPE_NOT_CONFIGURED",
          message: "Stripe is not configured",
        },
      });
      throw new Error("Stripe not configured");
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

const billingStatusSchema = z
  .object({
    plan: z.string(),
    status: z.string(),
    taxYear: z.number().int().nullable(),
    currentPeriodEnd: z.date().nullable(),
  })
  .openapi({ ref: "BillingStatus" });

export async function billingRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<FastifyZodOpenApiTypeProvider>();
  // GET /billing/status
  r.get(
    "/billing/status",
    {
      schema: {
        tags: ["billing"],
        operationId: "getBillingStatus",
        description: "Get current subscription status",
        response: {
          200: z.object({
            data: billingStatusSchema,
          }),
        },
      },
    },
    async (request: FastifyRequest) => {
      const sub = await prisma.subscription.findUnique({
        where: { userId: request.userId },
      });
      return {
        data: {
          plan: sub?.plan ?? "FREE",
          status: sub?.status ?? "active",
          taxYear: sub?.taxYear ?? null,
          currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        },
      };
    },
  );

  // POST /billing/checkout
  r.post(
    "/billing/checkout",
    {
      schema: {
        tags: ["billing"],
        operationId: "createCheckoutSession",
        description: "Create a Stripe Checkout Session for plan upgrade",
        body: z.object({
          plan: z.enum(["PRO", "CPA"]),
          taxYear: z.number().int().min(2020).max(2030).optional(),
        }),
        response: {
          200: z.object({ data: z.object({ url: z.string().nullable() }) }),
          404: errorResponseSchema,
          500: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const s = requireStripe(reply);
      const body = request.body as { plan: "PRO" | "CPA"; taxYear?: number };

      const user = await prisma.user.findUnique({
        where: { id: request.userId },
      });
      if (!user) {
        return reply.status(404).send({ error: { message: "User not found" } });
      }

      let sub = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      let customerId = sub?.stripeCustomerId;

      if (!customerId) {
        const customer = await s.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        if (!sub) {
          sub = await prisma.subscription.create({
            data: {
              userId: user.id,
              plan: "FREE",
              stripeCustomerId: customerId,
            },
          });
        } else {
          await prisma.subscription.update({
            where: { userId: user.id },
            data: { stripeCustomerId: customerId },
          });
        }
      }

      const priceId =
        body.plan === "PRO"
          ? process.env.STRIPE_PRO_PRICE_ID
          : process.env.STRIPE_CPA_PRICE_ID;

      if (!priceId) {
        return reply
          .status(500)
          .send({ error: { message: "Stripe price not configured" } });
      }

      const session = await s.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.WEB_URL || "http://localhost:3000"}/settings?billing=success`,
        cancel_url: `${process.env.WEB_URL || "http://localhost:3000"}/pricing`,
        metadata: {
          userId: user.id,
          plan: body.plan,
          taxYear: String(body.taxYear || new Date().getFullYear()),
        },
      });

      return { data: { url: session.url } };
    },
  );

  // POST /billing/portal
  r.post(
    "/billing/portal",
    {
      schema: {
        tags: ["billing"],
        operationId: "createBillingPortal",
        description: "Create a Stripe Customer Portal Session",
        response: {
          200: z.object({ data: z.object({ url: z.string() }) }),
          400: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const s = requireStripe(reply);
      const sub = await prisma.subscription.findUnique({
        where: { userId: request.userId },
      });
      if (!sub?.stripeCustomerId) {
        return reply
          .status(400)
          .send({ error: { message: "No billing account found" } });
      }
      const session = await s.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${process.env.WEB_URL || "http://localhost:3000"}/settings`,
      });
      return { data: { url: session.url } };
    },
  );

  // POST /billing/webhook — Stripe webhook handler (no JWT auth)
  r.post(
    "/billing/webhook",
    {
      schema: {
        tags: ["billing"],
        operationId: "handleStripeWebhook",
        description:
          "Stripe webhook handler (signature verification, no JWT auth)",
        security: [],
        response: {
          200: z.object({ received: z.boolean() }),
          400: errorResponseSchema,
          500: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const s = requireStripe(reply);
      const sig = request.headers["stripe-signature"] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return reply
          .status(500)
          .send({ error: { message: "Webhook secret not configured" } });
      }

      let event: Stripe.Event;
      try {
        const payload =
          (request as unknown as { rawBody?: string }).rawBody ||
          JSON.stringify(request.body);
        event = s.webhooks.constructEvent(payload, sig, webhookSecret);
      } catch {
        return reply
          .status(400)
          .send({ error: { message: "Invalid signature" } });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, plan, taxYear } = session.metadata || {};
        if (userId && plan) {
          await prisma.subscription.upsert({
            where: { userId },
            update: {
              plan: plan as "PRO" | "CPA",
              taxYear: taxYear ? parseInt(taxYear) : null,
              status: "active",
              stripeSubId: (session.subscription as string) || null,
            },
            create: {
              userId,
              plan: plan as "PRO" | "CPA",
              taxYear: taxYear ? parseInt(taxYear) : null,
              status: "active",
              stripeCustomerId: session.customer as string,
              stripeSubId: (session.subscription as string) || null,
            },
          });
        }
      }

      if (event.type === "customer.subscription.updated") {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const periodEnd = sub.items?.data?.[0]?.current_period_end;
        await prisma.subscription.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            status: sub.status,
            ...(periodEnd
              ? { currentPeriodEnd: new Date(periodEnd * 1000) }
              : {}),
          },
        });
      }

      if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await prisma.subscription.updateMany({
          where: { stripeCustomerId: customerId },
          data: { status: "canceled" },
        });
      }

      return { received: true };
    },
  );
}
