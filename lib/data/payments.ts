import "server-only";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { BENCHMARK_CURRENCY, BENCHMARK_PRICE_CENTS, stripe } from "@/lib/stripe";

export const PURPOSE = "benchmark_unlock";

/** Creates a Stripe Checkout for the founder's company and returns its URL. */
export async function createBenchmarkCheckout(user: User, company: Company, appUrl: string, client: Pick<Stripe, "checkout"> = stripe()): Promise<string> {
  const session = await client.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: BENCHMARK_CURRENCY,
          unit_amount: BENCHMARK_PRICE_CENTS,
          product_data: { name: "Growth Goaled preliminary Benchmark", description: `Benchmark report for ${company.name}` },
        },
      },
    ],
    client_reference_id: company.id,
    customer_email: user.email,
    metadata: { companyId: company.id, userId: user.id, purpose: PURPOSE },
    success_url: `${appUrl}/benchmark?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/benchmark?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout link.");
  await db.insert(schema.payments).values({
    companyId: company.id,
    userId: user.id,
    purpose: PURPOSE,
    stripeSessionId: session.id,
    amountCents: BENCHMARK_PRICE_CENTS,
    currency: BENCHMARK_CURRENCY,
  });
  return session.url;
}

/**
 * Records a completed Checkout and unlocks the company's Benchmark.
 * Idempotent; only trusts sessions this app created for that company.
 */
export async function recordPaidSession(session: Pick<Stripe.Checkout.Session, "id" | "payment_status" | "client_reference_id" | "metadata" | "amount_total">): Promise<boolean> {
  if (session.payment_status !== "paid") return false;
  const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.stripeSessionId, session.id)).limit(1);
  if (!payment || payment.purpose !== PURPOSE) return false;
  if (session.client_reference_id !== payment.companyId || session.metadata?.companyId !== payment.companyId) return false;
  if (session.amount_total !== null && session.amount_total < payment.amountCents) return false;
  if (payment.status !== "paid") {
    await db.update(schema.payments).set({ status: "paid", paidAt: new Date() }).where(eq(schema.payments.id, payment.id));
    await track("benchmark_unlocked", { userId: payment.userId ?? undefined, companyId: payment.companyId, props: { amountCents: payment.amountCents } });
  }
  await db
    .update(schema.companies)
    .set({ benchmarkUnlockedAt: new Date() })
    .where(and(eq(schema.companies.id, payment.companyId)));
  return true;
}

/** On return from Checkout: asks Stripe directly (in case the webhook hasn't arrived yet). */
export async function confirmCheckout(company: Company, sessionId: string, client: Pick<Stripe, "checkout"> = stripe()): Promise<boolean> {
  const [payment] = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.stripeSessionId, sessionId), eq(schema.payments.companyId, company.id)))
    .limit(1);
  if (!payment) return false;
  const session = await client.checkout.sessions.retrieve(sessionId);
  return recordPaidSession(session);
}
