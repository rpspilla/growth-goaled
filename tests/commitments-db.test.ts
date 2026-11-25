/** AI CRO sprint: "Commit to this" (decision card → growth project + commitments) and the company context the CRO sees (PGlite; model stubbed). */
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
import { commitmentItems, isOverdue, projectNameFrom, proposeCommitments } from "@/lib/commitments";
import { commitRecommendation, committedProjects, companyCommitments, setCommitmentStatus } from "@/lib/data/commitments";
import { sendMessage, startConversation } from "@/lib/data/chat";
import { createProject, savePriorities, today, updateProject } from "@/lib/data/projects";
import { weekStart } from "@/lib/weeks";

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
  for (const t of [schema.commitments, schema.weeklyPriorities, schema.projectResults, schema.growthProjects, schema.recommendationFeedback, schema.recommendations, schema.companyFacts, schema.conversationMessages, schema.conversations, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder] = (await db().insert(schema.users).values([{ email: "f@co.test", authUserId: "f", role: "founder", name: "Fran" }]).returning()) as [User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Commit Co" }, { name: "Other Co" }]).returning()) as [Company, Company];
  h.inputs.length = 0;
});

/** A conversation answered twice, so it has a decision card (the stubbed model gives one on the second turn). */
async function withCard() {
  const r = await startConversation(founder, co, "more_salespeople", null);
  if (!r.ok) throw new Error(r.error);
  await sendMessage(founder, co, r.conversationId, "We have 3 reps.");
  const [rec] = await db().select().from(schema.recommendations).where(eq(schema.recommendations.conversationId, r.conversationId));
  return { conversationId: r.conversationId, rec: rec! };
}

describe("proposals from a card", () => {
  it("takes up to five next steps, a week apart, owned by the founder, with the matching measure", () => {
    const steps = proposeCommitments({ nextSteps: ["A", "B", "C", "D", "E", "F"], successMeasures: ["mA", "mB"] }, "Fran", "2026-11-23");
    expect(steps).toHaveLength(5);
    expect(steps[0]).toEqual({ title: "A", owner: "Fran", dueOn: "2026-11-30", measure: "mA" });
    expect(steps[2]).toEqual({ title: "C", owner: "Fran", dueOn: "2026-12-14", measure: null });
    expect(projectNameFrom("Hire one AE now; wait on the second. Then revisit.", "Fallback")).toBe("Hire one AE now");
    expect(projectNameFrom("", "Should we hire?")).toBe("Should we hire?");
    expect(isOverdue({ status: "open", dueOn: "2026-11-20" }, "2026-11-23")).toBe(true);
    expect(isOverdue({ status: "done", dueOn: "2026-11-20" }, "2026-11-23")).toBe(false);
  });
});

describe("commit to this", () => {
  it("creates a project linked to the conversation and card, with the kept commitments, and marks the card committed", async () => {
    const { conversationId, rec } = await withCard();
    expect(rec.status).toBe("proposed");
    const item = { title: "Write the AE scorecard", owner: "Fran", dueOn: "2026-11-30", measure: "Scorecard agreed" };
    expect(await commitRecommendation(founder, co, rec.id, { project: { kind: "new", name: " " }, items: [item] })).toEqual({ ok: false, error: "Name the project." });
    expect(await commitRecommendation(founder, co, rec.id, { project: { kind: "new", name: "Hire" }, items: [{ ...item, title: " " }] })).toEqual({ ok: false, error: "Keep at least one commitment." });
    expect(await commitRecommendation(founder, co, rec.id, { project: { kind: "new", name: "Hire" }, items: [{ ...item, owner: "" }] })).toEqual({ ok: false, error: "Commitment 1: say who owns it." });
    expect(await commitRecommendation(founder, co, rec.id, { project: { kind: "new", name: "Hire" }, items: [{ ...item, dueOn: "soon" }] })).toEqual({ ok: false, error: "Commitment 1: pick a valid due date." });
    // Another company can't commit this company's card.
    expect(await commitRecommendation(founder, other, rec.id, { project: { kind: "new", name: "Hire" }, items: [item] })).toEqual({ ok: false, error: "That recommendation wasn't found." });

    const r = await commitRecommendation(founder, co, rec.id, { project: { kind: "new", name: "Hire the first AE" }, items: [item, { title: "Book three AE interviews", owner: "Fran", dueOn: null, measure: null }] });
    if (!r.ok) throw new Error(r.error);
    const [project] = await db().select().from(schema.growthProjects).where(eq(schema.growthProjects.id, r.projectId));
    expect(project).toMatchObject({ name: "Hire the first AE", status: "open", startedOn: today(), conversationId, recommendationId: rec.id, createdBy: founder.id });
    const rows = await companyCommitments(co);
    expect(rows.map((c) => [c.title, c.status, c.dueOn])).toEqual([["Write the AE scorecard", "open", "2026-11-30"], ["Book three AE interviews", "open", null]]);
    expect(rows.every((c) => c.recommendationId === rec.id && c.conversationId === conversationId)).toBe(true);
    const [after] = await db().select().from(schema.recommendations).where(eq(schema.recommendations.id, rec.id));
    expect(after!.status).toBe("committed");
    expect((await committedProjects(co, [rec.id])).get(rec.id)).toEqual({ id: r.projectId, name: "Hire the first AE" });
    // Once is enough.
    expect(await commitRecommendation(founder, co, rec.id, { project: { kind: "new", name: "Again" }, items: [item] })).toEqual({ ok: false, error: "You've already committed to this one." });
    expect(await companyCommitments(other)).toEqual([]);
  });

  it("adds to an open project of the company, never a completed one or another company's", async () => {
    const { rec } = await withCard();
    const mine = await createProject(founder, co, { name: "Growth Hiring Plan", startedOn: "2026-11-11" });
    const theirs = await createProject(founder, other, { name: "Theirs", startedOn: "2026-11-11" });
    if (!mine.ok || !theirs.ok) throw new Error("setup");
    const item = { title: "Do it", owner: "Fran", dueOn: null, measure: null };
    expect(await commitRecommendation(founder, co, rec.id, { project: { kind: "existing", id: theirs.id }, items: [item] })).toEqual({ ok: false, error: "That project wasn't found." });
    await updateProject(co, mine.id, { name: "Growth Hiring Plan", startedOn: "2026-11-11", status: "completed", completedOn: "2026-11-20" });
    expect(await commitRecommendation(founder, co, rec.id, { project: { kind: "existing", id: mine.id }, items: [item] })).toEqual({ ok: false, error: "That project is completed; start a new one." });
    await updateProject(co, mine.id, { name: "Growth Hiring Plan", startedOn: "2026-11-11", status: "open", completedOn: null });
    expect(await commitRecommendation(founder, co, rec.id, { project: { kind: "existing", id: mine.id }, items: [item] })).toEqual({ ok: true, projectId: mine.id });
    expect((await db().select().from(schema.growthProjects).where(eq(schema.growthProjects.companyId, co.id))).length).toBe(1);
  });

  it("ticks done, drops and reopens within the company; open ones list soonest due first", async () => {
    const { rec } = await withCard();
    const r = await commitRecommendation(founder, co, rec.id, {
      project: { kind: "new", name: "P" },
      items: [
        { title: "Later", owner: "Fran", dueOn: "2026-12-20", measure: null },
        { title: "Undated", owner: "Fran", dueOn: null, measure: null },
        { title: "Soon", owner: "Sam (AE)", dueOn: "2026-11-25", measure: null },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    let rows = await companyCommitments(co);
    expect(rows.map((c) => c.title)).toEqual(["Soon", "Later", "Undated"]);
    expect(await setCommitmentStatus(founder, other, rows[0]!.id, "done")).toEqual({ ok: false, error: "That commitment wasn't found." });
    expect(await setCommitmentStatus(founder, co, rows[0]!.id, "done")).toEqual({ ok: true });
    expect(await setCommitmentStatus(founder, co, rows[2]!.id, "dropped")).toEqual({ ok: true });
    rows = await companyCommitments(co);
    // Open first; then closed ones, the latest closed first.
    expect(rows.map((c) => [c.title, c.status])).toEqual([["Later", "open"], ["Undated", "dropped"], ["Soon", "done"]]);
    expect(rows.find((c) => c.title === "Soon")!.closedAt).not.toBeNull();
    expect((await companyCommitments(co, { status: ["open"] })).map((c) => c.title)).toEqual(["Later"]);
    await setCommitmentStatus(founder, co, rows.find((c) => c.title === "Soon")!.id, "open");
    const reopened = (await companyCommitments(co)).find((c) => c.title === "Soon")!;
    expect(reopened).toMatchObject({ status: "open", closedAt: null });
    const items = commitmentItems([reopened], new Map([[reopened.projectId, "P"]]), "2026-11-30");
    expect(items[0]).toMatchObject({ overdue: true, dueLabel: "Wed, Nov 25", project: { name: "P" } });
  });
});

describe("the context the CRO sees", () => {
  it("includes the work under way and earlier conversations (not the current one); the next turn gets it", async () => {
    const { conversationId, rec } = await withCard();
    const r = await commitRecommendation(founder, co, rec.id, { project: { kind: "new", name: "Hire the first AE" }, items: [{ title: "Write the AE scorecard", owner: "Fran", dueOn: "2020-01-06", measure: "Scorecard agreed" }] });
    if (!r.ok) throw new Error(r.error);
    await db().insert(schema.projectResults).values([
      { projectId: r.projectId, companyId: co.id, label: "Pipeline added", value: "$90k", approvedAt: new Date() },
      { projectId: r.projectId, companyId: co.id, label: "Draft result", value: "$1" },
    ]);
    await savePriorities(founder, co, weekStart(today()), [{ title: "Close the AE hire", action: "Send the offer", dueOn: null }]);

    const ctx = await chatContext(co, { compensation: false });
    expect(ctx.work.projects).toEqual([{ name: "Hire the first AE", status: "open", started: today(), completed: null, from_conversation: "Should we hire more salespeople?" }]);
    expect(ctx.work.commitments).toEqual([{ title: "Write the AE scorecard", owner: "Fran", due: "2020-01-06", measure: "Scorecard agreed", status: "open", overdue: true, project: "Hire the first AE", outcome: null, outcome_note: null }]);
    expect(ctx.work.priorities).toMatchObject({ current: true, items: [{ title: "Close the AE hire", action: "Send the offer", due: null }] });
    expect(ctx.work.results).toEqual([{ project: "Hire the first AE", label: "Pipeline added", value: "$90k", note: null }]);
    expect(ctx.earlierConversations).toEqual([{ date: expect.any(String), question: "Should we hire more salespeople?", perspective: "Rally Collective Brain", takeaway: "Test mode takeaway for Should we hire more salespeople?", recommendation: "Test mode recommendation.", committed: true }]);
    // The conversation being had isn't listed as an earlier one.
    expect((await chatContext(co, { compensation: false, conversationId })).earlierConversations).toEqual([]);
    // Another company sees none of it.
    const theirs = await chatContext(other, { compensation: false });
    expect(theirs.work).toEqual({ projects: [], commitments: [], priorities: null, results: [], attention: [] });
    expect(theirs.earlierConversations).toEqual([]);

    // A new conversation's turn carries the work and the earlier conversation.
    h.inputs.length = 0;
    const next = await startConversation(founder, co, "other", "What should I focus on this week?");
    if (!next.ok) throw new Error(next.error);
    const input = h.inputs.at(-1) as ChatInput;
    expect(input.context.work.commitments[0]!.title).toBe("Write the AE scorecard");
    expect(input.context.earlierConversations.map((c) => c.question)).toEqual(["Should we hire more salespeople?"]);
  });
});
