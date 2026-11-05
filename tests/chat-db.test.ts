/** Founder conversations: turns, remembered facts, recommendation records, feedback, limits and company isolation (PGlite; model stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, inputs: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/ai/chat", async (original) => {
  const actual = await original<typeof import("@/lib/ai/chat")>();
  return {
    ...actual,
    chatTurn: async (input: import("@/lib/ai/chat").ChatInput) => (h.inputs.push(input), { output: actual.fakeChat(input), model: "test-model", tokensIn: 10, tokensOut: 20 }),
  };
});

import { schema } from "@/lib/db";
import type { ChatInput } from "@/lib/ai/chat";
import type { Company, User } from "@/lib/db/schema";
import { chatContext } from "@/lib/chat/context";
import { CHAT_METHODOLOGY_VERSION } from "@/lib/chat/topics";
import { getConversation, giveFeedback, listConversations, listFacts, removeFact, sendMessage, startConversation, updateFact } from "@/lib/data/chat";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User;
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
  for (const t of [schema.recommendationFeedback, schema.recommendations, schema.companyFacts, schema.conversationMessages, schema.conversations, schema.benchmarkRecords, schema.benchmarkDatasetVersions, schema.benchmarkDatasets, schema.benchmarkSources, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder] = (await db().insert(schema.users).values([{ email: "f@co.test", authUserId: "f", role: "founder" }]).returning()) as [User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Chat Co", stage: "Seed", industry: "Fintech", employees: 12 }, { name: "Other Co" }]).returning()) as [Company, Company];
  h.inputs.length = 0;
  delete process.env.CHAT_DAILY_LIMIT;
});

async function start(topic = "more_salespeople") {
  const r = await startConversation(founder, co, topic, null);
  if (!r.ok) throw new Error(r.error);
  return r.conversationId;
}

describe("conversations", () => {
  it("starts from a starter: the starter is the first message, and the first answer asks at most two questions", async () => {
    const id = await start();
    const view = (await getConversation(co, id))!;
    expect(view.conversation.title).toBe("Should we hire more salespeople?");
    expect(view.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(view.messages[0]!.content).toBe("Should we hire more salespeople?");
    expect(view.messages[1]!.questions).toHaveLength(2);
    expect(view.messages[1]!.recommendationId).toBeNull();
    expect((await listConversations(co)).map((c) => c.id)).toEqual([id]);
  });

  it("'Something else' needs the founder's own words, which become the title", async () => {
    expect(await startConversation(founder, co, "other", "  ")).toEqual({ ok: false, error: "Tell us what you'd like to work through." });
    const r = await startConversation(founder, co, "other", "Should we move upmarket?");
    expect(r.ok && (await getConversation(co, r.conversationId))!.conversation.title).toBe("Should we move upmarket?");
    expect(await startConversation(founder, co, "nope", null)).toEqual({ ok: false, error: "Unknown question." });
  });

  it("remembers stated facts, saves the recommendation as a record, and links it to the answer", async () => {
    const id = await start();
    expect(await sendMessage(founder, co, id, "We have 3 reps and a $20k ACV.")).toEqual({ ok: true });
    const facts = await listFacts(co);
    expect(facts.map((f) => [f.key, f.value, f.status])).toEqual([["sales_team_size", "3", "stated"]]);
    const view = (await getConversation(co, id))!;
    const answer = view.messages.at(-1)!;
    const rec = view.recommendations.get(answer.recommendationId!)!;
    expect(rec.topic).toBe("more_salespeople");
    expect(rec.methodologyVersion).toBe(CHAT_METHODOLOGY_VERSION);
    expect(rec.confidence).toBe("low");
    expect(rec.context).toMatchObject({ name: "Chat Co", stage: "Seed", industry: "Fintech", employees: 12 });
    expect(rec.card.plan.days30).toEqual(["Test 30-day step"]);
    // The next turn sees the saved fact, so it isn't asked again.
    await sendMessage(founder, co, id, "What next?");
    expect((h.inputs.at(-1) as ChatInput).context.facts).toEqual([{ key: "sales_team_size", label: "Sales team size", value: "3", status: "stated" }]);
  });

  it("a fact the founder corrected (verified) isn't overwritten by later conversation", async () => {
    const id = await start();
    await sendMessage(founder, co, id, "We have 3 reps.");
    const [fact] = await listFacts(co);
    expect(await updateFact(founder, co, fact!.id, "4")).toEqual({ ok: true });
    await sendMessage(founder, co, id, "Actually we have 5 reps.");
    expect((await listFacts(co)).map((f) => [f.value, f.status])).toEqual([["4", "verified"]]);
    expect(await removeFact(other, fact!.id)).toEqual({ ok: false, error: "Fact not found." });
    expect(await removeFact(co, fact!.id)).toEqual({ ok: true });
  });

  it("feedback is recorded against the recommendation", async () => {
    const id = await start();
    await sendMessage(founder, co, id, "We have 2 AEs.");
    const recId = (await getConversation(co, id))!.messages.at(-1)!.recommendationId!;
    expect(await giveFeedback(founder, co, recId, "helpful", "  Clear  ")).toEqual({ ok: true });
    expect(await giveFeedback(founder, co, recId, "implemented", null)).toEqual({ ok: true });
    const view = (await getConversation(co, id))!;
    expect(view.feedback.get(recId)!.map((f) => [f.kind, f.note]).sort()).toEqual([["helpful", "Clear"], ["implemented", null]]);
  });

  it("keeps companies apart: another company can't read, continue or rate a conversation", async () => {
    const id = await start();
    await sendMessage(founder, co, id, "We have 3 reps.");
    const recId = (await getConversation(co, id))!.messages.at(-1)!.recommendationId!;
    expect(await getConversation(other, id)).toBeNull();
    expect(await sendMessage(founder, other, id, "hi")).toEqual({ ok: false, error: "Conversation not found." });
    expect(await giveFeedback(founder, other, recId, "helpful", null)).toEqual({ ok: false, error: "Recommendation not found." });
    expect(await listConversations(other)).toEqual([]);
    expect(await listFacts(other)).toEqual([]);
  });

  it("after six exchanges without a plan, the reply gently suggests talking to Growth Goaled (then every third reply)", async () => {
    delete process.env.CHAT_DAILY_LIMIT;
    const id = await start(); // the starter is the first exchange
    const nudged: boolean[] = [];
    for (let i = 2; i <= 9; i++) {
      expect(await sendMessage(founder, co, id, `message ${i}`)).toEqual({ ok: true });
      nudged.push(Boolean((h.inputs.at(-1) as ChatInput).nudge));
    }
    // exchanges 2..9: only the 6th and the 9th carry the suggestion
    expect(nudged).toEqual([false, false, false, false, true, false, false, true]);
    const view = await getConversation(co, id);
    expect(view!.messages.filter((m) => m.role === "assistant").at(-1)!.content).toContain("talk this through with someone at Growth Goaled");
  });

  it("caps founder messages per company per day", async () => {
    process.env.CHAT_DAILY_LIMIT = "2";
    const id = await start();
    expect(await sendMessage(founder, co, id, "second")).toEqual({ ok: true });
    const third = await sendMessage(founder, co, id, "third");
    expect(third.ok).toBe(false);
    expect(await db().select().from(schema.conversationMessages).where(eq(schema.conversationMessages.content, "third"))).toEqual([]);
  });

  it("rejects empty and over-long messages", async () => {
    const id = await start();
    expect(await sendMessage(founder, co, id, "   ")).toEqual({ ok: false, error: "Type a message first." });
    expect((await sendMessage(founder, co, id, "x".repeat(4001))).ok).toBe(false);
  });
});

describe("compensation data in context", () => {
  it("includes only published pay/equity records from sources licensed for customer display", async () => {
    const [ok, closed] = await db()
      .insert(schema.benchmarkSources)
      .values([
        { name: "Carta", type: "public", year: 2026, allowCustomerDisplay: true },
        { name: "Unlicensed", type: "public", allowCustomerDisplay: false },
      ])
      .returning();
    const rec = (versionId: string, metric: string) => ({
      versionId,
      metric,
      displayName: metric,
      definition: "d",
      unit: "percent" as const,
      valueType: "percentage" as const,
      statistic: "median" as const,
      value: 0.5,
      stages: ["Seed"],
      period: "2026",
      periodBasis: "point_in_time" as const,
      sampleSize: 400,
      dedupeKey: metric,
    });
    for (const [source, status] of [[ok!, "published"], [closed!, "published"], [ok!, "draft"]] as const) {
      const [ds] = await db().insert(schema.benchmarkDatasets).values({ name: `${source.name} ${status}`, sourceId: source.id }).returning();
      const [v] = await db().insert(schema.benchmarkDatasetVersions).values({ datasetId: ds!.id, version: 1, status }).returning();
      await db().insert(schema.benchmarkRecords).values([rec(v!.id, "equity_first_sales_hire"), rec(v!.id, "nrr")]);
    }
    const ctx = await chatContext(co, { compensation: true });
    expect(ctx.compensationData).toEqual([
      { source: "Carta (2026)", metric: "equity_first_sales_hire [percent]", statistic: "median", value: "0.5", cohort: "Seed", period: "2026", sampleSize: 400 },
    ]);
    expect((await chatContext(co, { compensation: false })).compensationData).toEqual([]);
  });
});
