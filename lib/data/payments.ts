import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { CURRENCY, pricing, sellableUseCases } from "@/lib/pricing";
import { stripe } from "@/lib/stripe";
import { getUseCase, isUseCaseId, type UseCaseId } from "@/lib/use-cases";
import { activateUseCase, getCompanyUseCase } from "./use-cases";

/** A Single Assessment for one use case. */
export const PURPOSE = "assessment";
/** Retired purposes, still honoured for sessions created before the change: the $1 benchmark unlock and the $1 use case selection. */
const LEGACY_PURPOSES = ["benchmark_unlock", "use_case"];
/** Stripe Checkout sessions stay open for 24 hours; reuse ours for a little less. */
const REUSE_WINDOW_MS = 23 * 3600 * 1000;

export class CheckoutError extends Error {}

/**
 * Creates (or reuses) a Stripe Checkout for one assessment and returns its URL.
 * Repeated clicks while a session is still open return the same session, so a
 * founder can't be charged twice; an already-purchased assessment is refused.
 */
export async function createAssessmentCheckout(
  user: User,
  company: Company,
  useCaseId: UseCaseId,
  appUrl: string,
  client: Pick<Stripe, "checkout"> = stripe(),
): Promise<string> {
  const useCase = getUseCase(useCaseId);
  if (!useCase) throw new CheckoutError("Unknown use case.");
  if (!sellableUseCases().includes(useCaseId)) throw new CheckoutError("This assessment isn't available to buy yet.");
  if ((await getCompanyUseCase(company.id, useCaseId))?.activatedAt) throw new CheckoutError("You already have this assessment.");
  const { assessmentCents } = pricing();

  const [open] = await db
    .select()
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.companyId, company.id),
        eq(schema.payments.useCase, useCaseId),
        eq(schema.payments.purpose, PURPOSE),
        eq(schema.payments.status, "pending"),
        eq(schema.payments.amountCents, assessmentCents),
        gt(schema.payments.createdAt, new Date(Date.now() - REUSE_WINDOW_MS)),
      ),
    )
    .orderBy(desc(schema.payments.createdAt))
    .limit(1);
  if (open?.checkoutUrl) {
    const existing = await client.checkout.sessions.retrieve(open.stripeSessionId).catch(() => null);
    if (existing?.status === "open") return open.checkoutUrl;
    if (existing?.payment_status === "paid") {
      await recordPaidSession(existing);
      throw new CheckoutError("You already have this assessment.");
    }
    if (existing?.status === "expired") await markSession(open.stripeSessionId, "expired");
  }

  const session = await client.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: assessmentCents,
            product_data: { name: `Growth Goaled assessment: ${useCase.shortTitle}`, description: `${useCase.question} For ${company.name}.` },
          },
        },
      ],
      client_reference_id: company.id,
      customer_email: user.email,
      metadata: { companyId: company.id, userId: user.id, purpose: PURPOSE, useCase: useCaseId },
      success_url: `${appUrl}/api/checkout/return?use_case=${useCaseId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/library/${useCaseId}/snapshot?checkout=cancelled`,
    },
    // Concurrent double-submits within the same few minutes collapse into one session.
    { idempotencyKey: `assessment:${company.id}:${useCaseId}:${Math.floor(Date.now() / (5 * 60_000))}` },
  );
  if (!session.url) throw new Error("Stripe didn't return a checkout link.");
  await db
    .insert(schema.payments)
    .values({
      companyId: company.id,
      userId: user.id,
      purpose: PURPOSE,
      useCase: useCaseId,
      stripeSessionId: session.id,
      checkoutUrl: session.url,
      amountCents: assessmentCents,
      currency: CURRENCY,
    })
    .onConflictDoNothing();
  await track("checkout_started", { userId: user.id, companyId: company.id, props: { use_case: useCaseId, amountCents: assessmentCents } });
  return session.url;
}

type SessionLike = Pick<Stripe.Checkout.Session, "id" | "payment_status" | "client_reference_id" | "metadata" | "amount_total">;

/**
 * Records a completed Checkout and grants the assessment for that company and use case.
 * Only trusts sessions this app created for that company, verified with Stripe (webhook
 * signature or a server-side retrieve), never the browser. Idempotent.
 */
export async function recordPaidSession(session: SessionLike): Promise<boolean> {
  if (session.payment_status !== "paid") return false;
  const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.stripeSessionId, session.id)).limit(1);
  if (!payment || (payment.purpose !== PURPOSE && !LEGACY_PURPOSES.includes(payment.purpose))) return false;
  if (session.client_reference_id !== payment.companyId || session.metadata?.companyId !== payment.companyId) return false;
  if (session.amount_total !== null && session.amount_total < payment.amountCents) return false;
  const useCase = payment.purpose === "benchmark_unlock" ? "growth_leak" : payment.useCase;
  if (!useCase || !isUseCaseId(useCase)) return false;
  if (payment.status !== "paid") {
    await db.update(schema.payments).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(schema.payments.id, payment.id));
  }
  await activateUseCase(payment.companyId, useCase, { activation: "paid", by: payment.userId, note: `Stripe ${session.id}` });
  return true;
}

/** Marks an unpaid session expired or failed (Stripe webhook). A paid payment is never downgraded. */
export async function markSession(sessionId: string, status: "expired" | "failed"): Promise<void> {
  await db
    .update(schema.payments)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.payments.stripeSessionId, sessionId), eq(schema.payments.status, "pending")));
}

export type CheckoutOutcome = "paid" | "pending" | "failed" | "unknown";

/** On return from Checkout: asks Stripe directly (in case the webhook hasn't arrived yet). */
export async function confirmCheckout(company: Pick<Company, "id">, sessionId: string, client: Pick<Stripe, "checkout"> = stripe()): Promise<CheckoutOutcome> {
  const [payment] = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.stripeSessionId, sessionId), eq(schema.payments.companyId, company.id)))
    .limit(1);
  if (!payment) return "unknown";
  if (payment.status === "paid") return "paid";
  const session = await client.checkout.sessions.retrieve(sessionId);
  if (await recordPaidSession(session)) return "paid";
  if (session.status === "expired") {
    await markSession(sessionId, "expired");
    return "failed";
  }
  return "pending";
}

/** Purchases for a company, newest first (assessment history). */
export async function listPayments(companyId: string) {
  return db.select().from(schema.payments).where(eq(schema.payments.companyId, companyId)).orderBy(desc(schema.payments.createdAt));
}
