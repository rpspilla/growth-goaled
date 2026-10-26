import "server-only";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { PRICE_CURRENCY, USE_CASE_PRICE_CENTS, stripe } from "@/lib/stripe";
import { getUseCase, isUseCaseId, type UseCaseId } from "@/lib/use-cases";
import { activateUseCase } from "./use-cases";

export const PURPOSE = "use_case";
/** Retired: the $1 preliminary Benchmark unlock. Old sessions still activate Growth Leak. */
const LEGACY_PURPOSE = "benchmark_unlock";

/** Creates a Stripe Checkout for one use case for the founder's company and returns its URL. */
export async function createUseCaseCheckout(
  user: User,
  company: Company,
  useCaseId: UseCaseId,
  appUrl: string,
  client: Pick<Stripe, "checkout"> = stripe(),
): Promise<string> {
  const useCase = getUseCase(useCaseId);
  if (!useCase) throw new Error("Unknown use case.");
  const session = await client.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: PRICE_CURRENCY,
          unit_amount: USE_CASE_PRICE_CENTS,
          product_data: { name: `Growth Goaled: ${useCase.shortTitle}`, description: `${useCase.question} For ${company.name}.` },
        },
      },
    ],
    client_reference_id: company.id,
    customer_email: user.email,
    metadata: { companyId: company.id, userId: user.id, purpose: PURPOSE, useCase: useCaseId },
    success_url: `${appUrl}/api/checkout/return?use_case=${useCaseId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/library/${useCaseId}?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout link.");
  await db.insert(schema.payments).values({
    companyId: company.id,
    userId: user.id,
    purpose: PURPOSE,
    useCase: useCaseId,
    stripeSessionId: session.id,
    amountCents: USE_CASE_PRICE_CENTS,
    currency: PRICE_CURRENCY,
  });
  await track("checkout_started", { userId: user.id, companyId: company.id, props: { use_case: useCaseId, amountCents: USE_CASE_PRICE_CENTS } });
  return session.url;
}

/**
 * Records a completed Checkout and activates its use case for the company.
 * Idempotent; only trusts sessions this app created for that company.
 */
export async function recordPaidSession(session: Pick<Stripe.Checkout.Session, "id" | "payment_status" | "client_reference_id" | "metadata" | "amount_total">): Promise<boolean> {
  if (session.payment_status !== "paid") return false;
  const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.stripeSessionId, session.id)).limit(1);
  if (!payment || (payment.purpose !== PURPOSE && payment.purpose !== LEGACY_PURPOSE)) return false;
  if (session.client_reference_id !== payment.companyId || session.metadata?.companyId !== payment.companyId) return false;
  if (session.amount_total !== null && session.amount_total < payment.amountCents) return false;
  const useCase = payment.purpose === LEGACY_PURPOSE ? "growth_leak" : payment.useCase;
  if (!useCase || !isUseCaseId(useCase)) return false;
  if (payment.status !== "paid") {
    await db.update(schema.payments).set({ status: "paid", paidAt: new Date() }).where(eq(schema.payments.id, payment.id));
  }
  await activateUseCase(payment.companyId, useCase, { activation: "paid", by: payment.userId, note: `Stripe ${session.id}` });
  return true;
}

/** On return from Checkout: asks Stripe directly (in case the webhook hasn't arrived yet). */
export async function confirmCheckout(company: Pick<Company, "id">, sessionId: string, client: Pick<Stripe, "checkout"> = stripe()): Promise<boolean> {
  const [payment] = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.stripeSessionId, sessionId), eq(schema.payments.companyId, company.id)))
    .limit(1);
  if (!payment) return false;
  const session = await client.checkout.sessions.retrieve(sessionId);
  return recordPaidSession(session);
}
