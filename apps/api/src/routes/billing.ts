/**
 * Billing routes — Stripe integration
 *
 * GET  /billing/status   — Get current subscription status
 * POST /billing/checkout  — Create Stripe Checkout Session
 * POST /billing/portal    — Create Stripe Customer Portal Session
 * POST /billing/webhook   — Stripe webhook handler (no auth, signature verification)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import Stripe from "stripe";
import { prisma } from "../lib/prisma";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

function requireStripe(reply: FastifyReply): asserts stripe is Stripe {
  if (!stripe) {
    reply.code(503).send({
      data: null,
      error: {
        message: "Stripe not configured",
        code: "STRIPE_NOT_CONFIGURED",
      },
    });
    throw new Error("Stripe not configured");
  }
}

export async function billingRoutes(app: FastifyInstance) {
  /**
   * GET /billing/status — Get current subscription status.
   *
   * Returns:
   *   plan, status, taxYear, currentPeriodEnd
   */
  app.get("/billing/status", async (request: FastifyRequest) => {
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
  });

  /**
   * POST /billing/checkout — Create a Stripe Checkout Session.
   *
   * Body:
   *   plan: "PRO" | "CPA"
   *   taxYear?: number (2020–2030)
   *
   * Returns:
   *   url: Stripe Checkout Session URL
   */
  app.post(
    "/billing/checkout",
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireStripe(reply);
      const body = z
        .object({
          plan: z.enum(["PRO", "CPA"]),
          taxYear: z.number().int().min(2020).max(2030).optional(),
        })
        .parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: request.userId },
      });
      if (!user) {
        return reply.status(404).send({ error: { message: "User not found" } });
      }

      // Get or create Stripe customer
      let sub = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      let customerId = sub?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
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

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment", // one-time for per-tax-year
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

  /**
   * POST /billing/portal — Create a Stripe Customer Portal Session.
   *
   * Returns:
   *   url: Stripe Billing Portal URL
   */
  app.post(
    "/billing/portal",
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireStripe(reply);
      const sub = await prisma.subscription.findUnique({
        where: { userId: request.userId },
      });
      if (!sub?.stripeCustomerId) {
        return reply
          .status(400)
          .send({ error: { message: "No billing account found" } });
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${process.env.WEB_URL || "http://localhost:3000"}/settings`,
      });
      return { data: { url: session.url } };
    },
  );

  /**
   * POST /billing/webhook — Stripe webhook handler.
   *
   * No JWT auth; uses Stripe signature verification.
   * Handles: checkout.session.completed, customer.subscription.updated,
   *          customer.subscription.deleted
   */
  app.post(
    "/billing/webhook",
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireStripe(reply);
      const sig = request.headers["stripe-signature"] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return reply
          .status(500)
          .send({ error: { message: "Webhook secret not configured" } });
      }

      let event: Stripe.Event;
      try {
        // Use raw body string for signature verification; fall back to
        // stringified body when rawBody is not available.
        const payload =
          (request as unknown as { rawBody?: string }).rawBody ||
          JSON.stringify(request.body);
        event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
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
        // Derive period end from the first subscription item, if available
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
