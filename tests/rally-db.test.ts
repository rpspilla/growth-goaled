/** Rally Beta: suggested questions, answer ratings, Beta feedback and the Beta metrics (PGlite; model stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/ai/chat", async (original) => {
  const actual = await original<typeof import("@/lib/ai/chat")>();
  return { ...actual, chatTurn: async (input: import("@/lib/ai/chat").ChatInput) => ({ output: actual.fakeChat(input), model: "test-model", tokensIn: 10, tokensOut: 20 }) };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { blocks } from "@/components/chat/RichReply";
import { suggestionsFor } from "@/lib/chat/suggestions";
import { betaMetrics } from "@/lib/data/beta-metrics";
import { getConversation, rateAnswer, saveBetaFeedback, startConversation } from "@/lib/data/chat";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User;
let staff: User;
let co: Company;
let other: Company;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.betaFeedback, schema.messageFeedback, schema.recommendations, schema.companyFacts, schema.conversationMessages, schema.conversations, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder, staff] = (await db()
    .insert(schema.users)
    .values([
      { email: "f@co.test", authUserId: "f", role: "founder", onboardedAt: new Date() },
      { email: "a@gg.test", authUserId: "a", role: "advisor" },
    ])
    .returning()) as [User, User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Rally Co", stage: "Seed" }, { name: "Other Co" }]).returning()) as [Company, Company];
});

async function answers(n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await startConversation(founder, co, "other", `Question ${i + 1}`);
    if (!r.ok) throw new Error(r.error);
    const view = (await getConversation(co, r.conversationId))!;
    ids.push(view.messages.find((m) => m.role === "assistant")!.id);
  }
  return ids;
}

describe("Rally", () => {
  it("suggests four questions for the stage, review first when commitments are open", () => {
    expect(suggestionsFor({ stage: "Seed", openCommitments: 0 }).map((s) => s.text)).toEqual(["Where is our biggest growth constraint?", "Are we ready to hire our first salesperson?", "Why isn't our pipeline converting?", "How do we build a repeatable revenue engine?"]);
    expect(suggestionsFor({ stage: "Series A", openCommitments: 2 }).map((s) => s.topic)).toEqual(["other", "other", "more_salespeople", "pipeline_conversion"]);
  });

  it("asks a suggestion in its own words on its topic", async () => {
    const r = await startConversation(founder, co, "first_gtm_hire", null, null, "Are we ready to hire our first salesperson?");
    if (!r.ok) throw new Error(r.error);
    const view = (await getConversation(co, r.conversationId))!;
    expect(view.conversation).toMatchObject({ topic: "first_gtm_hire", title: "Are we ready to hire our first salesperson?" });
    expect(view.messages[0]!.content).toBe("Are we ready to hire our first salesperson?");
  });

  it("formats answers: bold, numbered steps, and the closing question", () => {
    expect(blocks("**Fix conversion first.**\nIt's cheaper.\n\n1. Split by source.\n2. Review lost deals.\n\nOne question: where do deals stall?")).toEqual([
      { kind: "p", lines: ["**Fix conversion first.**", "It's cheaper."] },
      { kind: "ol", lines: ["Split by source.", "Review lost deals."] },
      { kind: "q", lines: ["One question: where do deals stall?"] },
    ]);
  });

  it("rates answers once per founder (changeable), only in their company, and invites feedback once after two helpful", async () => {
    const [a1, a2, a3] = await answers(3);
    expect(await rateAnswer(founder, other, a1!, true, null)).toEqual({ ok: false, error: "That answer wasn't found." });
    expect(await rateAnswer(founder, co, a1!, false, "Too generic")).toEqual({ ok: true, prompt: false });
    expect(await rateAnswer(founder, co, a1!, true, null)).toEqual({ ok: true, prompt: false });
    expect(await db().select().from(schema.messageFeedback)).toHaveLength(1);
    expect((await getConversation(co, (await db().select().from(schema.conversationMessages)).find((m) => m.id === a1)!.conversationId))!.messageFeedback.get(a1!)).toBe(true);
    expect(await rateAnswer(founder, co, a2!, true, null)).toEqual({ ok: true, prompt: true });
    expect(await rateAnswer(founder, co, a3!, true, null)).toEqual({ ok: true, prompt: false });
  });

  it("keeps Beta feedback with at least one answer", async () => {
    expect(await saveBetaFeedback(founder, co, { use_regularly: "sometimes" }, "rail")).toEqual({ ok: false, error: "Answer at least one question." });
    expect(await saveBetaFeedback(founder, co, { missing: "  Pipeline reviews  ", use_regularly: "yes" }, "rail")).toEqual({ ok: true });
    expect((await db().select().from(schema.betaFeedback))[0]).toMatchObject({ answers: { missing: "Pipeline reviews", use_regularly: "yes" }, source: "rail" });
  });

  it("measures activation, repeat use and helpfulness for founders only", async () => {
    const [a1, a2] = await answers(2);
    await rateAnswer(founder, co, a1!, true, null);
    await rateAnswer(founder, co, a2!, false, "Missed our churn");
    await rateAnswer(staff, co, a2!, true, null);
    await saveBetaFeedback(founder, co, { indispensable: "Weekly pipeline review" }, "after_helpful");
    const m = await betaMetrics();
    expect(m.activation).toMatchObject({ signups: 1, onboarded: 1, startedConversation: 1, receivedAnswer: 1, activated: 1, activatedPct: 100 });
    expect(m.repeat).toMatchObject({ conversations: 2, perFounder: 2, secondConversationPct: 100, collective: 2, individual: 0, weeklyActive: 1 });
    expect(m.helpfulness).toMatchObject({ rated: 2, helpful: 1, notHelpful: 1, helpfulPct: 50, feedbackSubmitted: 1 });
    expect(m.helpfulness.notHelpfulNotes.map((n) => n.note)).toEqual(["Missed our churn"]);
    expect(m.topQuestions).toEqual([{ topic: "other", label: "Their own question", n: 2 }]);
  });
});
