import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import type { ActionPlan, ActionPlanContent, Company, User } from "@/lib/db/schema";
import { draftPlan } from "@/lib/ai/plan";
import { chatContext } from "@/lib/chat/context";
import { getChatTopic } from "@/lib/chat/topics";
import { sendEmail } from "@/lib/email";
import { track } from "@/lib/events";
import { CURRENCY, pricing } from "@/lib/pricing";
import { stripe } from "@/lib/stripe";

export type PlanTier = "plan" | "supported";
export const PLAN_PURPOSE: Record<PlanTier, string> = { plan: "action_plan", supported: "action_plan_supported" };
const PURPOSES = Object.values(PLAN_PURPOSE);
/** Advisors aim to approve a submitted plan within this many hours (shown to the founder). */
export const REVIEW_HOURS = 24;
/** A draft that's been "drafting" this long is assumed lost and may be restarted. */
const DRAFT_STALE_MS = 10 * 60 * 1000;

export type PlanResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export class PlanCheckoutError extends Error {}

/** The company's action plans a founder should hear about on the Overview: in review, ready, or live. */
export async function founderPlans(company: Pick<Company, "id">) {
  return db
    .select({ id: schema.actionPlans.id, conversationId: schema.actionPlans.conversationId, status: schema.actionPlans.status, tier: schema.actionPlans.tier, submittedAt: schema.actionPlans.submittedAt, approvedAt: schema.actionPlans.approvedAt, title: schema.conversations.title })
    .from(schema.actionPlans)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.actionPlans.conversationId))
    .where(and(eq(schema.actionPlans.companyId, company.id), inArray(schema.actionPlans.status, ["drafting", "in_review", "delivered", "active"])))
    .orderBy(desc(schema.actionPlans.updatedAt))
    .limit(5);
}

/** Where a founder opens a plan: its conversation, at the plan panel (through sign-in if they're signed out). */
export const planLink = (appUrl: string, conversationId: string) => `${appUrl}/sign-in?next=${encodeURIComponent(`/chat/${conversationId}#your-plan`)}`;

export async function planForConversation(company: Pick<Company, "id">, conversationId: string): Promise<ActionPlan | null> {
  const [plan] = await db
    .select()
    .from(schema.actionPlans)
    .where(and(eq(schema.actionPlans.conversationId, conversationId), eq(schema.actionPlans.companyId, company.id)))
    .limit(1);
  return plan ?? null;
}

/** A plan that's been paid for (anything past pending payment). */
export const isPurchased = (p: Pick<ActionPlan, "status"> | null | undefined) => Boolean(p && p.status !== "pending_payment");

/**
 * Stripe Checkout for an action plan on one conversation: $499 once, or $799 a month (a Stripe
 * subscription). One plan per conversation; a pending one can switch tier before it's paid.
 */
export async function createPlanCheckout(user: User, company: Company, conversationId: string, tier: PlanTier, appUrl: string, client: Pick<Stripe, "checkout"> = stripe()): Promise<string> {
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.companyId, company.id)))
    .limit(1);
  if (!conversation) throw new PlanCheckoutError("Conversation not found.");
  const existing = await planForConversation(company, conversationId);
  if (isPurchased(existing)) throw new PlanCheckoutError("You already have an action plan for this conversation.");
  const [plan] = existing
    ? await db.update(schema.actionPlans).set({ tier, updatedAt: new Date() }).where(eq(schema.actionPlans.id, existing.id)).returning()
    : await db.insert(schema.actionPlans).values({ companyId: company.id, conversationId, topic: conversation.topic, tier, createdBy: user.id }).returning();

  const { actionPlanCents, supportedMonthlyCents } = pricing();
  const amount = tier === "plan" ? actionPlanCents : supportedMonthlyCents;
  const purpose = PLAN_PURPOSE[tier];
  const metadata = { companyId: company.id, userId: user.id, purpose, actionPlanId: plan!.id };
  const name = tier === "plan" ? "Growth Goaled action plan" : "Growth Goaled supported action plan";
  const session = await client.checkout.sessions.create(
    {
      mode: tier === "plan" ? "payment" : "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: amount,
            product_data: { name, description: `${conversation.title} For ${company.name}.` },
            ...(tier === "supported" ? { recurring: { interval: "month" as const } } : {}),
          },
        },
      ],
      client_reference_id: company.id,
      customer_email: user.email,
      metadata,
      ...(tier === "supported" ? { subscription_data: { metadata } } : {}),
      success_url: `${appUrl}/api/checkout/return?plan=${plan!.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/chat/${conversationId}?checkout=cancelled`,
    },
    { idempotencyKey: `plan:${plan!.id}:${tier}:${Math.floor(Date.now() / (5 * 60_000))}` },
  );
  if (!session.url) throw new Error("Stripe didn't return a checkout link.");
  await db
    .insert(schema.payments)
    .values({ companyId: company.id, userId: user.id, purpose, actionPlanId: plan!.id, stripeSessionId: session.id, checkoutUrl: session.url, amountCents: amount, currency: CURRENCY })
    .onConflictDoNothing();
  await track("checkout_started", { userId: user.id, companyId: company.id, props: { product: purpose, topic: conversation.topic, amountCents: amount } });
  return session.url;
}

export type PlanSession = Pick<Stripe.Checkout.Session, "id" | "payment_status" | "client_reference_id" | "metadata" | "amount_total"> & { subscription?: string | { id: string } | null };

export const isPlanPurpose = (purpose: string) => PURPOSES.includes(purpose);

/**
 * A paid plan Checkout (verified with Stripe by the caller): the plan starts collecting ($499) or
 * goes live ($799/month). Idempotent; returns the plan id when this call started it.
 */
export async function recordPaidPlan(session: PlanSession, payment: typeof schema.payments.$inferSelect): Promise<string | null> {
  if (!payment.actionPlanId || session.metadata?.actionPlanId !== payment.actionPlanId) return null;
  if (payment.status !== "paid") await db.update(schema.payments).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(schema.payments.id, payment.id));
  const tier: PlanTier = payment.purpose === PLAN_PURPOSE.supported ? "supported" : "plan";
  const subscription = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
  const started = await db
    .update(schema.actionPlans)
    .set({ tier, status: tier === "plan" ? "collecting" : "active", stripeSubscriptionId: subscription, updatedAt: new Date() })
    .where(and(eq(schema.actionPlans.id, payment.actionPlanId), eq(schema.actionPlans.companyId, payment.companyId), eq(schema.actionPlans.status, "pending_payment")))
    .returning({ id: schema.actionPlans.id, topic: schema.actionPlans.topic });
  if (!started.length) return null;
  await track("action_plan_purchased", { userId: payment.userId ?? undefined, companyId: payment.companyId, props: { tier, topic: started[0]!.topic } });
  return started[0]!.id;
}

/** Stripe ended the subscription (cancelled or unpaid): the supported plan stops; what was built stays readable. */
export async function cancelSupportedPlan(subscriptionId: string): Promise<void> {
  await db
    .update(schema.actionPlans)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.actionPlans.stripeSubscriptionId, subscriptionId), eq(schema.actionPlans.status, "active")));
}

async function transcript(conversationId: string): Promise<string> {
  const rows = await db
    .select({ role: schema.conversationMessages.role, content: schema.conversationMessages.content, author: schema.users.name })
    .from(schema.conversationMessages)
    .leftJoin(schema.users, eq(schema.users.id, schema.conversationMessages.authorId))
    .where(eq(schema.conversationMessages.conversationId, conversationId))
    .orderBy(asc(schema.conversationMessages.createdAt));
  return rows.map((r) => `${r.role === "user" ? "FOUNDER" : r.role === "advisor" ? `ADVISOR${r.author ? ` (${r.author})` : ""}` : "GROWTH GOALED"}: ${r.content}`).join("\n\n");
}

/**
 * Writes (or rewrites) the plan from the conversation. Only one draft runs at a time per plan.
 * A $499 plan goes to an advisor for review; a supported plan updates in place.
 */
export async function writePlan(planId: string, opts: { onlyIfEmpty?: boolean } = {}): Promise<boolean> {
  if (opts.onlyIfEmpty) {
    const [p] = await db.select({ content: schema.actionPlans.content }).from(schema.actionPlans).where(eq(schema.actionPlans.id, planId)).limit(1);
    if (!p || p.content) return false;
  }
  const claimed = await db
    .update(schema.actionPlans)
    .set({ draftingStartedAt: new Date() })
    .where(and(eq(schema.actionPlans.id, planId), or(isNull(schema.actionPlans.draftingStartedAt), lt(schema.actionPlans.draftingStartedAt, new Date(Date.now() - DRAFT_STALE_MS)))))
    .returning();
  const plan = claimed[0];
  if (!plan || (plan.tier === "plan" && plan.status !== "drafting") || (plan.tier === "supported" && plan.status !== "active")) {
    if (plan) await db.update(schema.actionPlans).set({ draftingStartedAt: null }).where(eq(schema.actionPlans.id, planId));
    return false;
  }
  try {
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, plan.companyId)).limit(1);
    const topic = getChatTopic(plan.topic) ?? getChatTopic("other")!;
    const context = await chatContext(company!, { compensation: Boolean(topic.usesCompensationData) });
    const { plan: content } = await draftPlan({ topic, context, transcript: await transcript(plan.conversationId), current: plan.content });
    await db
      .update(schema.actionPlans)
      .set({ content, draftingStartedAt: null, status: plan.tier === "plan" ? "in_review" : "active", updatedAt: new Date() })
      .where(eq(schema.actionPlans.id, plan.id));
    return true;
  } catch (err) {
    console.error(`[plan] ${plan.id} draft failed`, err);
    // A $499 plan still goes to the advisor, who writes it from the conversation if the draft failed.
    await db
      .update(schema.actionPlans)
      .set({ draftingStartedAt: null, ...(plan.tier === "plan" ? { status: "in_review" as const } : {}), updatedAt: new Date() })
      .where(eq(schema.actionPlans.id, plan.id));
    return false;
  }
}

/** The founder submits a $499 plan: it's drafted from the conversation, then waits for an advisor. */
export async function submitPlan(user: User, company: Pick<Company, "id">, planId: string): Promise<PlanResult> {
  const updated = await db
    .update(schema.actionPlans)
    .set({ status: "drafting", submittedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.actionPlans.id, planId), eq(schema.actionPlans.companyId, company.id), eq(schema.actionPlans.tier, "plan"), eq(schema.actionPlans.status, "collecting")))
    .returning({ id: schema.actionPlans.id, topic: schema.actionPlans.topic });
  if (!updated.length) return { ok: false, error: "This plan can't be submitted now." };
  await track("action_plan_submitted", { userId: user.id, companyId: company.id, props: { topic: updated[0]!.topic } });
  await notifyReviewer(company.id, planId).catch((err) => console.error("[plan] Reviewer email failed", err));
  return { ok: true };
}

/** Tells the company's advisor (or, with none assigned, OWNER_NOTIFY_EMAIL) that a plan is waiting: the 24 hours start now. */
async function notifyReviewer(companyId: string, planId: string): Promise<void> {
  const [row] = await db
    .select({ company: schema.companies.name, advisor: schema.users.email })
    .from(schema.companies)
    .leftJoin(schema.users, eq(schema.users.id, schema.companies.advisorId))
    .where(eq(schema.companies.id, companyId))
    .limit(1);
  const to = row?.advisor ?? process.env.OWNER_NOTIFY_EMAIL;
  if (!row || !to) return;
  const link = `${process.env.APP_URL?.replace(/\/$/, "") ?? ""}/advisor/plans/${planId}`;
  await sendEmail({
    to,
    subject: `Action plan to approve: ${row.company}`,
    text: `${row.company} submitted their action plan. Please review and approve it within ${REVIEW_HOURS} hours: ${link}\n`,
    html: `<p style="font-family:Inter,Arial,sans-serif;font-size:15px">${escapeHtml(row.company)} submitted their action plan. Please review and approve it within ${REVIEW_HOURS} hours.</p><p><a href="${escapeHtml(link)}">Open the plan</a></p>`,
  });
}

/** Supported plans: the founder or advisor asks for the plan to be brought up to date with the conversation. */
export async function requestPlanUpdate(company: Pick<Company, "id">, planId: string): Promise<PlanResult> {
  const [plan] = await db
    .select({ id: schema.actionPlans.id })
    .from(schema.actionPlans)
    .where(and(eq(schema.actionPlans.id, planId), eq(schema.actionPlans.companyId, company.id), eq(schema.actionPlans.tier, "supported"), eq(schema.actionPlans.status, "active")))
    .limit(1);
  return plan ? { ok: true } : { ok: false, error: "This plan can't be updated now." };
}

/** Ticks a milestone on a supported plan (founder or advisor), or on a delivered plan (founder). */
export async function setStepDone(company: Pick<Company, "id">, planId: string, period: "days30" | "days60" | "days90", index: number, done: boolean): Promise<PlanResult> {
  const [plan] = await db.select().from(schema.actionPlans).where(and(eq(schema.actionPlans.id, planId), eq(schema.actionPlans.companyId, company.id))).limit(1);
  if (!plan?.content || !["active", "delivered"].includes(plan.status)) return { ok: false, error: "This plan can't be changed now." };
  const steps = plan.content[period];
  if (!steps[index]) return { ok: false, error: "Unknown milestone." };
  const content: ActionPlanContent = { ...plan.content, [period]: steps.map((s, i) => (i === index ? { ...s, done } : s)) };
  await db.update(schema.actionPlans).set({ content, updatedAt: new Date() }).where(eq(schema.actionPlans.id, plan.id));
  return { ok: true };
}

/** Plans waiting for an advisor: $499 plans in review, oldest first, for companies the advisor may see. */
export async function plansForReview(advisor: Pick<User, "id" | "role">) {
  const rows = await db
    .select({ plan: schema.actionPlans, company: schema.companies.name, advisorId: schema.companies.advisorId, title: schema.conversations.title })
    .from(schema.actionPlans)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.actionPlans.companyId))
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.actionPlans.conversationId))
    .where(inArray(schema.actionPlans.status, ["drafting", "in_review"]))
    .orderBy(asc(schema.actionPlans.submittedAt));
  const now = Date.now();
  return rows
    .filter((r) => advisor.role === "admin" || r.advisorId === advisor.id || r.advisorId === null)
    .map((r) => {
      const due = r.plan.submittedAt ? new Date(r.plan.submittedAt.getTime() + REVIEW_HOURS * 3600 * 1000) : null;
      return { ...r, due, overdue: due ? due.getTime() < now : false };
    });
}

/** Supported plans an advisor is responsible for (admins: all), newest activity first. */
export async function supportedPlans(advisor: Pick<User, "id" | "role">) {
  const rows = await db
    .select({ plan: schema.actionPlans, company: schema.companies.name, companyId: schema.companies.id, advisorId: schema.companies.advisorId, title: schema.conversations.title, lastActivity: schema.conversations.updatedAt })
    .from(schema.actionPlans)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.actionPlans.companyId))
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.actionPlans.conversationId))
    .where(and(eq(schema.actionPlans.tier, "supported"), eq(schema.actionPlans.status, "active")))
    .orderBy(desc(schema.conversations.updatedAt));
  return rows.filter((r) => advisor.role === "admin" || r.advisorId === advisor.id || r.advisorId === null);
}

const cleanSteps = (steps: { action: string; owner: string; measure: string; done?: boolean }[]) =>
  steps.map((s) => ({ action: s.action.trim(), owner: s.owner.trim(), measure: s.measure.trim(), ...(s.done ? { done: true } : {}) })).filter((s) => s.action);

/** Tools to evaluate, trimmed and without blanks or repeats (at most eight). */
export const cleanTools = (tools: ActionPlanContent["tools"]) => {
  const seen = new Set<string>();
  return (tools ?? [])
    .map((t) => ({ name: t.name.trim().slice(0, 120), category: t.category.trim().slice(0, 60), why: t.why.trim().slice(0, 400) }))
    .filter((t) => t.name && !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase()))
    .slice(0, 8);
};

/** The advisor approves a $499 plan (with any edits): it's delivered to the founder, who's emailed. */
export async function approvePlan(advisor: User, company: Pick<Company, "id" | "name">, planId: string, content: ActionPlanContent, note: string | null, appUrl: string): Promise<PlanResult> {
  const clean: ActionPlanContent = {
    goal: content.goal.trim(),
    summary: content.summary.trim(),
    days30: cleanSteps(content.days30),
    days60: cleanSteps(content.days60),
    days90: cleanSteps(content.days90),
    risks: content.risks.map((r) => r.trim()).filter(Boolean),
    assumptions: content.assumptions.map((r) => r.trim()).filter(Boolean),
    tools: cleanTools(content.tools),
  };
  if (!clean.goal || !clean.days30.length) return { ok: false, error: "A plan needs a goal and at least one 30-day milestone." };
  const updated = await db
    .update(schema.actionPlans)
    .set({ content: clean, status: "delivered", approvedAt: new Date(), approvedBy: advisor.id, reviewNote: note?.trim() || null, updatedAt: new Date() })
    .where(and(eq(schema.actionPlans.id, planId), eq(schema.actionPlans.companyId, company.id), inArray(schema.actionPlans.status, ["drafting", "in_review"])))
    .returning();
  const plan = updated[0];
  if (!plan) return { ok: false, error: "This plan isn't waiting for review." };
  await track("action_plan_delivered", { userId: advisor.id, companyId: company.id, props: { topic: plan.topic } });
  await sendPlanReadyEmail(advisor, company, plan, clean.goal, appUrl);
  return { ok: true };
}

/**
 * Emails the founder who bought the plan that it's ready, with a link through sign-in to it. A failure
 * is logged and recorded (the plan is delivered in the app either way) and returned to the caller.
 */
async function sendPlanReadyEmail(advisor: Pick<User, "id">, company: Pick<Company, "id" | "name">, plan: Pick<ActionPlan, "id" | "createdBy" | "conversationId">, goal: string, appUrl: string): Promise<{ sent: true; to: string } | { sent: false; reason: string }> {
  const [founder] = plan.createdBy ? await db.select().from(schema.users).where(eq(schema.users.id, plan.createdBy)).limit(1) : [];
  if (!founder) return { sent: false, reason: "The founder who bought this plan no longer has an account." };
  const link = planLink(appUrl, plan.conversationId);
  const sent = await sendEmail({
    to: founder.email,
    subject: "Your Growth Goaled action plan is ready",
    text: `Your action plan for ${company.name} has been reviewed and approved by your Growth Goaled advisor.\n\nGoal: ${goal}\n\nLog in to Growth Goaled to see it: ${link}\n`,
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:520px">
<p style="font-size:15px">Your action plan for <strong>${escapeHtml(company.name)}</strong> has been reviewed and approved by your Growth Goaled advisor.</p>
<p style="font-size:15px"><strong>Goal:</strong> ${escapeHtml(goal)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#155A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Log in to see your action plan</a></p>
</div>`,
  }).catch((err) => ({ sent: false as const, reason: err instanceof Error ? err.message : String(err) }));
  if (!sent.sent) {
    console.error(`[plan] Delivery email to the founder wasn't sent (plan ${plan.id}): ${sent.reason}`);
    await track("action_plan_email_failed", { userId: advisor.id, companyId: company.id, props: { plan_id: plan.id, reason: sent.reason.slice(0, 200) } });
    return sent;
  }
  return { sent: true, to: founder.email };
}

/** An advisor re-sends the "your action plan is ready" email for a delivered plan (e.g. after an email outage). */
export async function resendPlanEmail(advisor: Pick<User, "id">, company: Pick<Company, "id" | "name">, planId: string, appUrl: string): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const [plan] = await db.select().from(schema.actionPlans).where(and(eq(schema.actionPlans.id, planId), eq(schema.actionPlans.companyId, company.id))).limit(1);
  if (!plan || plan.status !== "delivered" || !plan.content) return { ok: false, error: "Only a delivered plan's email can be re-sent." };
  const sent = await sendPlanReadyEmail(advisor, company, plan, plan.content.goal, appUrl);
  if (!sent.sent) return { ok: false, error: `The email wasn't sent: ${sent.reason}` };
  await track("action_plan_email_resent", { userId: advisor.id, companyId: company.id, props: { plan_id: plan.id } });
  return { ok: true, to: sent.to };
}

/** An advisor's message in a supported plan's conversation (only while the subscription is active). */
export async function postAdvisorMessage(advisor: User, companyId: string, conversationId: string, raw: string): Promise<PlanResult> {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > 4000) return { ok: false, error: "Keep messages under 4,000 characters." };
  const [plan] = await db
    .select({ id: schema.actionPlans.id })
    .from(schema.actionPlans)
    .where(and(eq(schema.actionPlans.conversationId, conversationId), eq(schema.actionPlans.companyId, companyId), eq(schema.actionPlans.tier, "supported"), eq(schema.actionPlans.status, "active")))
    .limit(1);
  if (!plan) return { ok: false, error: "Advisors take part in conversations with an active supported plan." };
  await db.insert(schema.conversationMessages).values({ conversationId, role: "advisor", content: text, authorId: advisor.id });
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
  await track("advisor_message", { userId: advisor.id, companyId, props: {} });
  return { ok: true };
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
