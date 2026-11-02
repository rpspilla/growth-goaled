/** Action plans bought from a conversation: checkout, payment, collecting, review and delivery, supported plans with an advisor (PGlite; model and Stripe stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, inputs: [] as unknown[], emails: [] as { to: string; subject: string }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/email", () => ({ sendEmail: async (m: { to: string; subject: string }) => (h.emails.push(m), { sent: true }) }));
vi.mock("@/lib/ai/chat", async (original) => {
  const actual = await original<typeof import("@/lib/ai/chat")>();
  return { ...actual, chatTurn: async (input: import("@/lib/ai/chat").ChatInput) => (h.inputs.push(input), { output: actual.fakeChat(input), model: "test", tokensIn: 1, tokensOut: 1 }) };
});
vi.mock("@/lib/ai/plan", async (original) => {
  const actual = await original<typeof import("@/lib/ai/plan")>();
  return { ...actual, draftPlan: async (input: import("@/lib/ai/plan").PlanInput) => ({ plan: actual.keepDone(actual.fakePlan(input), input.current), model: "test", tokensIn: 1, tokensOut: 1 }) };
});

import { schema } from "@/lib/db";
import type { ChatInput } from "@/lib/ai/chat";
import type { ActionPlanContent, Company, User } from "@/lib/db/schema";
import { approvePlan, cancelSupportedPlan, createPlanCheckout, planForConversation, plansForReview, postAdvisorMessage, setStepDone, submitPlan, supportedPlans, writePlan } from "@/lib/data/action-plans";
import { getConversation, sendMessage, startConversation } from "@/lib/data/chat";
import { recordPaidSession } from "@/lib/data/payments";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User;
let advisor: User;
let otherAdvisor: User;
let co: Company;
let other: Company;
let conversationId: string;

const stripeFake = () => {
  const create = vi.fn(async (params: Record<string, unknown>) => ({ id: `cs_test_${Math.random().toString(36).slice(2)}`, url: "https://checkout.stripe.com/c/pay/x", params }));
  return { client: { checkout: { sessions: { create, retrieve: vi.fn() } } } as never, create };
};

async function buy(tier: "plan" | "supported", opts: { subscription?: string } = {}) {
  const { client, create } = stripeFake();
  await createPlanCheckout(founder, co, conversationId, tier, "https://dev.test", client);
  const params = create.mock.calls.at(-1)![0] as { metadata: Record<string, string> };
  const [payment] = await db().select().from(schema.payments).where(eq(schema.payments.actionPlanId, params.metadata.actionPlanId!));
  const paid = await recordPaidSession({ id: payment!.stripeSessionId, payment_status: "paid", client_reference_id: co.id, metadata: params.metadata, amount_total: payment!.amountCents, subscription: opts.subscription ?? null });
  expect(paid).toBe(true);
  return (await planForConversation(co, conversationId))!;
}

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.payments, schema.actionPlans, schema.recommendationFeedback, schema.recommendations, schema.companyFacts, schema.conversationMessages, schema.conversations, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder, advisor, otherAdvisor] = (await db()
    .insert(schema.users)
    .values([
      { email: "f@co.test", authUserId: "f", role: "founder", name: "Fran" },
      { email: "a@gg.test", authUserId: "a", role: "advisor", name: "Ada Advisor" },
      { email: "b@gg.test", authUserId: "b", role: "advisor", name: "Ben" },
    ])
    .returning()) as [User, User, User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Plan Co", stage: "Seed", advisorId: advisor.id }, { name: "Other Co" }]).returning()) as [Company, Company];
  h.inputs.length = 0;
  h.emails.length = 0;
  const r = await startConversation(founder, co, "more_salespeople", null);
  if (!r.ok) throw new Error(r.error);
  conversationId = r.conversationId;
});

describe("checkout", () => {
  it("$499 is a one-time payment, $799 a monthly subscription, for this conversation only", async () => {
    const one = stripeFake();
    await createPlanCheckout(founder, co, conversationId, "plan", "https://dev.test", one.client);
    const p1 = one.create.mock.calls[0]![0] as Record<string, unknown> & { line_items: { price_data: Record<string, unknown> }[] };
    expect(p1.mode).toBe("payment");
    expect(p1.line_items[0]!.price_data).toMatchObject({ unit_amount: 49_900 });
    expect(p1.line_items[0]!.price_data.recurring).toBeUndefined();
    // Switching tier before paying reuses the same pending plan.
    const sub = stripeFake();
    await createPlanCheckout(founder, co, conversationId, "supported", "https://dev.test", sub.client);
    const p2 = sub.create.mock.calls[0]![0] as Record<string, unknown> & { line_items: { price_data: Record<string, unknown> }[]; subscription_data: unknown };
    expect(p2.mode).toBe("subscription");
    expect(p2.line_items[0]!.price_data).toMatchObject({ unit_amount: 79_900, recurring: { interval: "month" } });
    expect(p2.subscription_data).toBeTruthy();
    expect(await db().select().from(schema.actionPlans)).toHaveLength(1);
    expect((await planForConversation(co, conversationId))!.status).toBe("pending_payment");
    await expect(createPlanCheckout(founder, other, conversationId, "plan", "https://dev.test", stripeFake().client)).rejects.toThrow("Conversation not found.");
  });

  it("starts only on a paid session for this company, and can't be bought twice", async () => {
    const { client, create } = stripeFake();
    await createPlanCheckout(founder, co, conversationId, "plan", "https://dev.test", client);
    const params = create.mock.calls[0]![0] as { metadata: Record<string, string> };
    const [payment] = await db().select().from(schema.payments);
    expect(await recordPaidSession({ id: payment!.stripeSessionId, payment_status: "paid", client_reference_id: other.id, metadata: { ...params.metadata, companyId: other.id }, amount_total: 49_900 })).toBe(false);
    expect(await recordPaidSession({ id: payment!.stripeSessionId, payment_status: "unpaid", client_reference_id: co.id, metadata: params.metadata, amount_total: 49_900 })).toBe(false);
    expect((await planForConversation(co, conversationId))!.status).toBe("pending_payment");
    expect(await recordPaidSession({ id: payment!.stripeSessionId, payment_status: "paid", client_reference_id: co.id, metadata: params.metadata, amount_total: 49_900 })).toBe(true);
    expect((await planForConversation(co, conversationId))!.status).toBe("collecting");
    await expect(createPlanCheckout(founder, co, conversationId, "supported", "https://dev.test", stripeFake().client)).rejects.toThrow("already have an action plan");
  });
});

describe("$499 action plan", () => {
  it("gathers what it needs in the conversation, is submitted, drafted, approved by an advisor and delivered", async () => {
    const plan = await buy("plan");
    await sendMessage(founder, co, conversationId, "We have 3 reps.");
    expect((h.inputs.at(-1) as ChatInput).plan).toEqual({ tier: "plan", status: "collecting", needs: [] });
    expect((await planForConversation(co, conversationId))!.needs).toEqual(["Closed deals export"]);
    await sendMessage(founder, co, conversationId, "Attached our closed deals export.");
    expect((await planForConversation(co, conversationId))!.needs).toEqual([]);

    expect(await submitPlan(founder, other, plan.id)).toEqual({ ok: false, error: "This plan can't be submitted now." });
    expect(await submitPlan(founder, co, plan.id)).toEqual({ ok: true });
    expect(h.emails.map((e) => [e.to, e.subject])).toEqual([["a@gg.test", "Action plan to approve: Plan Co"]]);
    expect(await writePlan(plan.id)).toBe(true);
    const drafted = (await planForConversation(co, conversationId))!;
    expect(drafted.status).toBe("in_review");
    expect(drafted.content!.goal).toBe("Test mode goal for Should we hire more salespeople?");
    // The founder doesn't see the draft: it's waiting for the advisor.
    expect(await setStepDone(co, plan.id, "days30", 0, true)).toEqual({ ok: false, error: "This plan can't be changed now." });

    // Only advisors who may see the company have it in their queue.
    expect((await plansForReview(advisor)).map((r) => r.plan.id)).toEqual([plan.id]);
    expect(await plansForReview(otherAdvisor)).toEqual([]);
    expect((await plansForReview({ id: "x", role: "admin" })).map((r) => r.plan.id)).toEqual([plan.id]);

    const edited: ActionPlanContent = { ...drafted.content!, goal: "  Hire one AE by March  ", days60: [...drafted.content!.days60, { action: "", owner: "", measure: "" }] };
    expect(await approvePlan(advisor, co, plan.id, { ...edited, goal: " " }, null, "https://dev.test")).toEqual({ ok: false, error: "A plan needs a goal and at least one 30-day milestone." });
    expect(await approvePlan(advisor, co, plan.id, edited, "Start with the ICP.", "https://dev.test")).toEqual({ ok: true });
    const delivered = (await planForConversation(co, conversationId))!;
    expect(delivered).toMatchObject({ status: "delivered", approvedBy: advisor.id, reviewNote: "Start with the ICP." });
    expect(delivered.content!.goal).toBe("Hire one AE by March");
    expect(delivered.content!.days60).toHaveLength(1);
    expect(h.emails.at(-1)).toMatchObject({ to: "f@co.test", subject: "Your Growth Goaled action plan is ready" });
    expect(await approvePlan(advisor, co, plan.id, edited, null, "https://dev.test")).toEqual({ ok: false, error: "This plan isn't waiting for review." });
    // Delivered: the founder ticks off milestones.
    expect(await setStepDone(co, plan.id, "days30", 0, true)).toEqual({ ok: true });
    // No advisor in the conversation on the $499 plan.
    expect(await postAdvisorMessage(advisor, co.id, conversationId, "Hi")).toEqual({ ok: false, error: "Advisors take part in conversations with an active supported plan." });
  });

  it("goes to the advisor even when the draft fails, so they can write it", async () => {
    const plan = await buy("plan");
    await submitPlan(founder, co, plan.id);
    const ai = await import("@/lib/ai/plan");
    const spy = vi.spyOn(ai, "draftPlan").mockRejectedValueOnce(new Error("model down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await writePlan(plan.id)).toBe(false);
    } finally {
      spy.mockRestore();
      errors.mockRestore();
    }
    const p = (await planForConversation(co, conversationId))!;
    expect(p.status).toBe("in_review");
    expect(p.content).toBeNull();
  });
});

describe("$799/month supported plan", () => {
  it("is written straight away, has the advisor in the conversation, keeps ticked milestones, and ends with the subscription", async () => {
    const plan = await buy("supported", { subscription: "sub_123" });
    expect(plan).toMatchObject({ status: "active", tier: "supported", stripeSubscriptionId: "sub_123" });
    expect(await writePlan(plan.id, { onlyIfEmpty: true })).toBe(true);
    expect(await writePlan(plan.id, { onlyIfEmpty: true })).toBe(false);
    expect((await supportedPlans(advisor)).map((r) => r.plan.id)).toEqual([plan.id]);
    expect(await supportedPlans(otherAdvisor)).toEqual([]);

    expect(await postAdvisorMessage(advisor, co.id, conversationId, "  Let's focus on payers.  ")).toEqual({ ok: true });
    expect(await postAdvisorMessage(advisor, other.id, conversationId, "wrong company")).toMatchObject({ ok: false });
    await sendMessage(founder, co, conversationId, "Sounds good, we have 3 reps.");
    const input = h.inputs.at(-1) as ChatInput;
    expect(input.history.find((t) => t.role === "advisor")).toEqual({ role: "advisor", content: "Let's focus on payers.", author: "Ada Advisor" });
    expect(input.plan).toMatchObject({ tier: "supported", status: "active" });
    const view = (await getConversation(co, conversationId))!;
    expect(view.messages.filter((m) => m.role === "advisor").map((m) => view.authors.get(m.authorId!))).toEqual(["Ada Advisor"]);

    expect(await setStepDone(co, plan.id, "days30", 0, true)).toEqual({ ok: true });
    expect(await writePlan(plan.id)).toBe(true);
    expect((await planForConversation(co, conversationId))!.content!.days30[0]!.done).toBe(true);

    await cancelSupportedPlan("sub_123");
    const ended = (await planForConversation(co, conversationId))!;
    expect(ended.status).toBe("cancelled");
    expect(ended.content).not.toBeNull();
    expect(await postAdvisorMessage(advisor, co.id, conversationId, "Still here?")).toMatchObject({ ok: false });
  });
});
