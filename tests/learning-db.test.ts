/** Drift signals, founder outcomes into the CRO library, the AI CRO quality report, and the website chat's CRO choice (PGlite; model stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, inputs: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/email", async (original) => ({ ...(await original<typeof import("@/lib/email")>()), sendEmail: async () => ({ sent: true }) }));
vi.mock("@/lib/ai/chat", async (original) => {
  const actual = await original<typeof import("@/lib/ai/chat")>();
  return { ...actual, chatTurn: async (input: import("@/lib/ai/chat").ChatInput) => (h.inputs.push(input), { output: actual.fakeChat(input), model: "test-model", tokensIn: 1, tokensOut: 1 }) };
});

import { schema } from "@/lib/db";
import type { ChatInput } from "@/lib/ai/chat";
import type { Company, User } from "@/lib/db/schema";
import { chatContext } from "@/lib/chat/context";
import { driftSignals } from "@/lib/commitments";
import { commitRecommendation, companyCommitments, rescheduleCommitment, setCommitmentOutcome, setCommitmentStatus } from "@/lib/data/commitments";
import { getIntelligence, saveCroProfile, saveIntelligence, setCroProfileAdmin, setIntelligenceStatus } from "@/lib/data/cro";
import { giveFeedback, sendMessage, startConversation } from "@/lib/data/chat";
import { portfolioRows } from "@/lib/data/portfolio";
import { qualityReport } from "@/lib/data/quality";
import { chooseGuestCro, claimGuest, guestByToken, guestReply, guestView, startGuest } from "@/lib/data/guest";
import { today } from "@/lib/data/projects";
import { addDays } from "@/lib/weeks";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let admin: User;
let founder: User;
let co: Company;
let croId: string;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.croIntelligenceContributors, schema.croIntelligence, schema.commitments, schema.growthProjects, schema.recommendationFeedback, schema.recommendations, schema.conversationMessages, schema.conversations, schema.guestSessions, schema.croProfiles, schema.companyMembers, schema.events, schema.companies, schema.users]) await db().delete(t);
  [admin, founder] = (await db().insert(schema.users).values([{ email: "admin@gg.test", authUserId: "admin", role: "admin" }, { email: "f@acme.test", authUserId: "f", role: "founder", name: "Fran" }]).returning()) as [User, User];
  [co] = (await db().insert(schema.companies).values([{ name: "Acmeloop", stage: "Seed", industry: "SaaS" }]).returning()) as [Company];
  const p = await saveCroProfile(admin, null, { name: "Ana Alvarez", bio: "Seed CRO." });
  if (!p.ok) throw new Error(p.error);
  croId = p.id;
  await setCroProfileAdmin(admin, croId, { status: "published", inCollective: true, userId: null });
  h.inputs.length = 0;
});

/** A conversation (with a CRO or the Collective) answered twice, so it has a card; then committed. */
async function committedCard(cro: string | null, title = "Acmeloop: write the AE scorecard") {
  const r = await startConversation(founder, co, "first_gtm_hire", null, cro);
  if (!r.ok) throw new Error(r.error);
  await sendMessage(founder, co, r.conversationId, "Two of us sell.");
  const [rec] = await db().select().from(schema.recommendations).where(eq(schema.recommendations.conversationId, r.conversationId));
  const c = await commitRecommendation(founder, co, rec!.id, { project: { kind: "new", name: "AE hire" }, items: [{ title, owner: "Fran", dueOn: today(), measure: "Scorecard agreed by acmeloop's team" }] });
  if (!c.ok) throw new Error(c.error);
  return { conversationId: r.conversationId, rec: rec!, commitment: (await companyCommitments(co))[0]! };
}

describe("drift", () => {
  it("names commitments moved 3+ times, 14+ days overdue, and a run of drops", () => {
    const on = "2026-11-24";
    const recent = new Date("2026-11-20T12:00:00Z");
    expect(
      driftSignals(
        [
          { title: "Moved a lot", status: "open", dueOn: "2026-11-30", timesMoved: 3, closedAt: null },
          { title: "Moved twice", status: "open", dueOn: "2026-11-30", timesMoved: 2, closedAt: null },
          { title: "Long overdue", status: "open", dueOn: "2026-11-01", closedAt: null },
          { title: "A bit overdue", status: "open", dueOn: "2026-11-20", closedAt: null },
          { title: "Dropped one", status: "dropped", dueOn: null, closedAt: recent },
          { title: "Dropped two", status: "dropped", dueOn: null, closedAt: recent },
          { title: "Dropped long ago", status: "dropped", dueOn: null, closedAt: new Date("2026-09-01T00:00:00Z") },
        ],
        on,
      ),
    ).toEqual(['"Moved a lot" has been moved 3 times', '"Long overdue" is 23 days overdue', '2 commitments dropped in the last 30 days ("Dropped one", "Dropped two")']);
    expect(driftSignals([{ title: "Dropped one", status: "dropped", dueOn: null, closedAt: recent }], on)).toEqual([]);
  });

  it("counts date moves, and the CRO and the advisor's portfolio see the pattern", async () => {
    const { commitment } = await committedCard(null);
    for (const d of [3, 4, 5]) expect(await rescheduleCommitment(founder, co, commitment.id, addDays(today(), d))).toEqual({ ok: true });
    expect((await companyCommitments(co))[0]!.timesMoved).toBe(3);
    expect((await chatContext(co, { compensation: false })).work.attention).toEqual(['"Acmeloop: write the AE scorecard" has been moved 3 times']);
    const [row] = await portfolioRows([co]);
    expect(row!.attention).toContain("1 commitment pattern to raise");
  });
});

describe("founder outcomes into the library", () => {
  it("draft an anonymised Outcome record for the CRO whose AI gave the advice, once", async () => {
    const { commitment } = await committedCard(croId);
    await setCommitmentStatus(founder, co, commitment.id, "done");
    expect(await setCommitmentOutcome(founder, co, commitment.id, "worked", "Acmeloop's board loved it")).toEqual({ ok: true });
    const [rec] = await db().select().from(schema.croIntelligence);
    expect(rec).toMatchObject({ type: "outcome", status: "draft", primaryCroId: croId, classification: "individual", evidence: "case_evidence", fromCommitmentId: commitment.id, stages: ["Seed"], industries: ["SaaS"], title: "Worked: the company: write the AE scorecard" });
    expect(rec!.content).not.toMatch(/acmeloop/i);
    expect(rec!.content).toContain("Outcome: Worked. the company's board loved it");
    expect(rec!.content).toContain("Company: Seed SaaS company (anonymised).");
    expect(rec!.expertise).toContain("sales hiring");
    expect((await getIntelligence(rec!.id))!.stances.map((s) => s.stance)).toEqual(["author"]);
    // Changing the outcome doesn't draft another.
    await setCommitmentOutcome(founder, co, commitment.id, "partly", null);
    expect(await db().select().from(schema.croIntelligence)).toHaveLength(1);
    // It's a draft: never used until a CRO submits and someone else validates it.
    expect(rec!.status).toBe("draft");
  });

  it("from the Collective: a network position for an admin to check; nothing when there are no CROs", async () => {
    const { commitment } = await committedCard(null);
    await setCommitmentStatus(founder, co, commitment.id, "done");
    await setCommitmentOutcome(founder, co, commitment.id, "didnt", null);
    const [rec] = await db().select().from(schema.croIntelligence);
    expect(rec).toMatchObject({ primaryCroId: null, classification: "collective" });
    await db().delete(schema.croIntelligence);
    await db().delete(schema.croProfiles);
    await setCommitmentOutcome(founder, co, commitment.id, "worked", null);
    expect(await db().select().from(schema.croIntelligence)).toHaveLength(0);
  });
});

describe("the AI CRO quality report", () => {
  it("counts conversations, commitments, ratings and outcomes by question, CRO and record", async () => {
    const r = await saveIntelligence(admin, null, { type: "principle", title: "Founders sell first", content: "Hire after 20 founder deals.", expertise: ["sales hiring"], primaryCroId: croId, classification: "individual", evidence: "experience", modes: ["individual", "collective"] });
    if (!r.ok) throw new Error(r.error);
    await setIntelligenceStatus(admin, r.id, "validated");
    const { rec, commitment } = await committedCard(croId);
    await giveFeedback(founder, co, rec.id, "helpful", null);
    await setCommitmentStatus(founder, co, commitment.id, "done");
    await setCommitmentOutcome(founder, co, commitment.id, "worked", null);
    await committedCard(null, "Second");
    const report = await qualityReport();
    expect(report.topics).toEqual([expect.objectContaining({ label: "Who should my first GTM hire be?", conversations: 2, recommendations: 2, committed: 2, helpful: 1, worked: 1 })]);
    expect(report.cros.map((c) => [c.label, c.conversations, c.worked])).toEqual(expect.arrayContaining([["Ana Alvarez's AI", 1, 1], ["Rally Collective", 1, 0]]));
    expect(report.records).toEqual([expect.objectContaining({ title: "Founders sell first", cro: "Ana Alvarez", worked: 1 })]);
    expect(report.records[0]!.uses).toBeGreaterThanOrEqual(1);
  });
});

const TOKEN = "guest-token-for-the-cro-choice-test";

describe("the website chat's CRO choice", () => {
  it("is offered, fixed once the AI answers, used for the answer, and carried into the account", async () => {
    const g = await startGuest(TOKEN, null);
    if ("error" in g) throw new Error(g.error);
    expect((await guestView(g)).cros.map((c) => c.name)).toEqual(["Ana Alvarez"]);
    expect(await chooseGuestCro(g, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "That CRO isn't available." });
    expect(await chooseGuestCro(g, croId)).toEqual({ ok: true });
    let s = (await guestByToken(TOKEN))!;
    expect(s.croId).toBe(croId);
    // Answer the sign-up questions; the last one hands over to the AI.
    for (const a of ["Should we hire our first AE?", "Fran Founder", "Acmeloop", "Founder", "Fintech"]) {
      const r = await guestReply((await guestByToken(TOKEN))!, a);
      if (!r.ok) throw new Error(`${a}: ${r.error}`);
    }
    s = (await guestByToken(TOKEN))!;
    expect(s.aiTurns).toBeGreaterThan(0);
    expect((h.inputs.at(-1) as ChatInput).intelligence?.mode).toBe("individual");
    expect((await guestView(s)).croLocked).toBe(true);
    expect(await chooseGuestCro(s, null)).toEqual({ ok: false, error: "This conversation has started; start a new one to talk to someone else." });
    // Signing up keeps who they were talking to.
    await db().update(schema.guestSessions).set({ email: "f@acme.test" }).where(eq(schema.guestSessions.id, s.id));
    await db().insert(schema.companyMembers).values({ companyId: co.id, userId: founder.id, memberRole: "owner" });
    const claimed = await claimGuest(founder, TOKEN);
    const [conv] = await db().select().from(schema.conversations).where(eq(schema.conversations.id, claimed!.conversationId));
    expect(conv!.croId).toBe(croId);
  });
});
