/** Multi-CRO intelligence: profiles, attributed records, review, stances, retrieval per mode, and attribution in conversations (PGlite; model stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, inputs: [] as unknown[], invent: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/ai/chat", async (original) => {
  const actual = await original<typeof import("@/lib/ai/chat")>();
  return {
    ...actual,
    chatTurn: async (input: import("@/lib/ai/chat").ChatInput) => {
      h.inputs.push(input);
      const output = actual.fakeChat(input);
      // A model that cites a record it was never given: attribution must drop it.
      if (h.invent) output.intelligence_used.push({ id: "00000000-0000-4000-8000-000000000000", how: "made up" });
      return { output, model: "test-model", tokensIn: 1, tokensOut: 1 };
    },
  };
});

import { schema } from "@/lib/db";
import type { ChatInput } from "@/lib/ai/chat";
import type { Company, User } from "@/lib/db/schema";
import { disagreements, intelligenceBlock, matchCros, relevance, selectIntelligence, slugify, type RecordForRetrieval } from "@/lib/cro";
import { croForUser, getIntelligence, intelligenceFor, listIntelligence, saveCroProfile, saveIntelligence, setCroProfileAdmin, setIntelligenceStatus, setStance, strongestCros } from "@/lib/data/cro";
import { getConversation, secondOpinion, sendMessage, setDefaultCro, startConversation, switchPerspective } from "@/lib/data/chat";
import { chatContext } from "@/lib/chat/context";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let admin: User;
let ana: User; // CRO Ana's login
let ben: User; // CRO Ben's login
let advisor: User; // an advisor with no CRO profile
let founder: User;
let co: Company;
let anaCro: string;
let benCro: string;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

const record = (over: Partial<Parameters<typeof saveIntelligence>[2]> = {}) => ({
  type: "principle",
  title: "Founders sell until the motion repeats",
  content: "Don't hire a VP of Sales before the founder has closed 20 deals the same way.",
  tags: ["vp of sales", "founder-led sales"],
  expertise: ["sales hiring", "founder-led sales"],
  stages: ["Seed"],
  industries: [],
  primaryCroId: anaCro,
  classification: "individual" as const,
  evidence: "experience" as const,
  modes: ["individual", "collective"] as ("individual" | "collective")[],
  ...over,
});

async function validated(actor: User, input: Parameters<typeof saveIntelligence>[2], reviewer: User = admin) {
  const r = await saveIntelligence(actor, null, input);
  if (!r.ok) throw new Error(r.error);
  await setIntelligenceStatus(actor, r.id, "submitted");
  const v = await setIntelligenceStatus(reviewer, r.id, "validated");
  if (!v.ok) throw new Error(v.error);
  return r.id;
}

beforeEach(async () => {
  for (const t of [schema.croIntelligenceContributors, schema.croIntelligence, schema.recommendations, schema.conversationMessages, schema.conversations, schema.croProfiles, schema.events, schema.companies, schema.users]) await db().delete(t);
  [admin, ana, ben, advisor, founder] = (await db()
    .insert(schema.users)
    .values([
      { email: "admin@gg.test", authUserId: "admin", role: "admin" },
      { email: "ana@gg.test", authUserId: "ana", role: "advisor", name: "Ana" },
      { email: "ben@gg.test", authUserId: "ben", role: "advisor", name: "Ben" },
      { email: "adv@gg.test", authUserId: "adv", role: "advisor" },
      { email: "f@co.test", authUserId: "f", role: "founder" },
    ])
    .returning()) as [User, User, User, User, User];
  [co] = (await db().insert(schema.companies).values([{ name: "Co", stage: "Seed", industry: "SaaS" }]).returning()) as [Company];
  const a = await saveCroProfile(admin, null, { name: "Ana Alvarez", bio: "Two-time Seed-stage CRO." });
  const b = await saveCroProfile(admin, null, { name: "Ben Brooks", bio: "Scaled sales orgs from $1M to $20M ARR." });
  if (!a.ok || !b.ok) throw new Error("setup");
  anaCro = a.id;
  benCro = b.id;
  await setCroProfileAdmin(admin, anaCro, { status: "published", inCollective: true, userId: ana.id });
  await setCroProfileAdmin(admin, benCro, { status: "published", inCollective: true, userId: ben.id });
  h.inputs.length = 0;
  h.invent = false;
});

describe("CRO profiles", () => {
  it("are created by admins, edited by the CRO themselves, published only with a bio, and linked to one login", async () => {
    expect(await saveCroProfile(ana, null, { name: "Someone" })).toEqual({ ok: false, error: "Only an admin or the CRO can change this profile." });
    expect(await saveCroProfile(ben, anaCro, { name: "Ana" })).toEqual({ ok: false, error: "Only an admin or the CRO can change this profile." });
    expect(await saveCroProfile(ana, anaCro, { name: "Ana Alvarez", bio: "Seed CRO.", expertise: ["Sales Hiring", "sales hiring"], philosophy: { hiring: "Hire for the stage you're in.", unknown: "x" } as never, photoUrl: "http://insecure.test/a.png" })).toEqual({ ok: false, error: "Use an https:// link for the photo." });
    expect(await saveCroProfile(ana, anaCro, { name: "Ana Alvarez", bio: "Seed CRO.", expertise: ["Sales Hiring", "sales hiring"], philosophy: { hiring: "Hire for the stage you're in.", unknown: "x" } as never })).toEqual({ ok: true, id: anaCro });
    const [p] = await db().select().from(schema.croProfiles).where(eq(schema.croProfiles.id, anaCro));
    expect(p).toMatchObject({ slug: "ana-alvarez", expertise: ["sales hiring"], philosophy: { hiring: "Hire for the stage you're in." }, status: "published" });
    // Slugs stay unique.
    const twin = await saveCroProfile(admin, null, { name: "Ana Alvarez" });
    if (!twin.ok) throw new Error(twin.error);
    expect((await db().select().from(schema.croProfiles).where(eq(schema.croProfiles.id, twin.id)))[0]!.slug).toBe("ana-alvarez-2");
    expect(await setCroProfileAdmin(admin, twin.id, { status: "published", inCollective: true, userId: null })).toEqual({ ok: false, error: "Add a biography before publishing: founders see it." });
    expect(await setCroProfileAdmin(admin, twin.id, { status: "draft", inCollective: true, userId: ana.id })).toEqual({ ok: false, error: "That login is already linked to another CRO." });
    expect(await setCroProfileAdmin(admin, twin.id, { status: "draft", inCollective: true, userId: founder.id })).toEqual({ ok: false, error: "Link an advisor or admin login." });
    expect(await setCroProfileAdmin(ana, twin.id, { status: "draft", inCollective: true, userId: null })).toEqual({ ok: false, error: "Only an admin can publish CROs or link logins." });
    expect((await croForUser(ana.id))!.id).toBe(anaCro);
    expect(slugify("José O'Neil")).toBe("jose-o-neil");
  });
});

describe("intelligence records", () => {
  it("keep attribution; a CRO writes only their own; validating is for another CRO or an admin", async () => {
    expect(await saveIntelligence(advisor, null, record())).toEqual({ ok: false, error: "Your login isn't linked to a CRO profile yet. Ask an admin." });
    expect(await saveIntelligence(ana, null, record({ primaryCroId: benCro }))).toEqual({ ok: false, error: "You can only write records attributed to yourself." });
    expect(await saveIntelligence(ana, null, record({ modes: [] }))).toEqual({ ok: false, error: "Choose where it can be used: an individual CRO's conversations, the Collective, or both." });
    expect(await saveIntelligence(admin, null, record({ classification: "collective" }))).toEqual({ ok: false, error: "A collective position isn't attributed to one CRO." });
    expect(await saveIntelligence(ana, null, record({ classification: "multi" }))).toEqual({ ok: false, error: "Add the other contributing CROs." });

    const r = await saveIntelligence(ana, null, record({ classification: "multi", coAuthorIds: [benCro] }));
    if (!r.ok) throw new Error(r.error);
    let rec = (await getIntelligence(r.id))!;
    expect(rec).toMatchObject({ status: "draft", primaryCroName: "Ana Alvarez", version: 1, tags: ["vp of sales", "founder-led sales"] });
    expect(rec.stances.map((s) => [s.croName, s.stance])).toEqual([["Ana Alvarez", "author"], ["Ben Brooks", "co_author"]]);

    // The author can't validate their own (nor can the co-author); an uninvolved CRO or an admin can.
    expect(await setIntelligenceStatus(ana, r.id, "submitted")).toEqual({ ok: true });
    expect(await setIntelligenceStatus(ana, r.id, "validated")).toEqual({ ok: false, error: "Another CRO or an admin validates your records." });
    expect(await setIntelligenceStatus(ben, r.id, "validated")).toEqual({ ok: false, error: "Another CRO or an admin validates your records." });
    expect(await setIntelligenceStatus(advisor, r.id, "validated")).toEqual({ ok: false, error: "Only CROs and admins review records." });
    expect(await setIntelligenceStatus(admin, r.id, "validated")).toEqual({ ok: true });
    rec = (await getIntelligence(r.id))!;
    expect(rec).toMatchObject({ status: "validated", validatedBy: admin.id });

    // Editing the content of a validated record makes a new version that needs validating again.
    expect(await saveIntelligence(ana, r.id, record({ classification: "multi", coAuthorIds: [benCro], content: "Twenty deals, same way, two segments." }))).toEqual({ ok: true, id: r.id });
    rec = (await getIntelligence(r.id))!;
    expect(rec).toMatchObject({ status: "submitted", version: 2, validatedBy: null });
    expect(await saveIntelligence(ben, r.id, record({ primaryCroId: benCro }))).toEqual({ ok: false, error: "You can only edit your own records." });
  });

  it("records other CROs' independent agreement or disagreement (with why)", async () => {
    const id = await validated(ana, record());
    expect(await setStance(ana, id, "endorses", null)).toEqual({ ok: false, error: "You wrote this one." });
    expect(await setStance(ben, id, "disputes", " ")).toEqual({ ok: false, error: "Say how you see it differently: the Collective uses your reasoning." });
    expect(await setStance(ben, id, "disputes", "With strong inbound, a seasoned AE can find the repeatable motion faster than the founder.")).toEqual({ ok: true });
    let rec = (await getIntelligence(id))!;
    expect(rec.stances.find((s) => s.croName === "Ben Brooks")).toMatchObject({ stance: "disputes" });
    expect(disagreements([rec])).toEqual([{ recordId: id, title: rec.title, heldBy: "Ana Alvarez", disputedBy: "Ben Brooks", why: expect.stringContaining("strong inbound") }]);
    expect(await setStance(ben, id, null, null)).toEqual({ ok: true });
    rec = (await getIntelligence(id))!;
    expect(rec.stances.map((s) => s.stance)).toEqual(["author"]);
    expect((await listIntelligence({ croId: benCro })).length).toBe(0);
  });
});

describe("retrieval", () => {
  const base = (over: Partial<RecordForRetrieval>): RecordForRetrieval => ({
    id: "r",
    type: "principle",
    title: "t",
    content: "c",
    category: null,
    tags: [],
    stages: [],
    industries: [],
    expertise: [],
    primaryCroId: "a",
    primaryCroName: "A",
    classification: "individual",
    evidence: "opinion",
    modes: ["individual", "collective"],
    status: "validated",
    relatedIds: [],
    stances: [],
    ...over,
  });
  const q = { text: "Should we hire a VP of Sales or keep founder-led sales?", topicId: "first_gtm_hire", stage: "Seed", industry: "SaaS" };

  it("scores relevance over expertise, the question's words, stage, industry and evidence, not headcount alone", () => {
    expect(relevance(base({ expertise: ["pricing"] }), q)).toBe(0);
    const weak = relevance(base({ expertise: ["sales hiring"], evidence: "opinion" }), q);
    const strong = relevance(base({ expertise: ["sales hiring"], evidence: "data", stages: ["Seed"], tags: ["vp of sales"] }), q);
    expect(strong).toBeGreaterThan(weak);
    const popular = relevance(base({ expertise: ["sales hiring"], stances: Array.from({ length: 9 }, (_, i) => ({ croId: `c${i}`, croName: `C${i}`, stance: "endorses" as const, note: null })) }), q);
    expect(popular - weak).toBe(1); // agreement is capped
  });

  it("individual mode uses only that CRO's records (theirs, co-written, endorsed); the Collective uses everyone's relevant ones", () => {
    const records = [
      base({ id: "ana-rule", type: "behavioral_rule", primaryCroId: "ana" }),
      base({ id: "ana-hiring", primaryCroId: "ana", expertise: ["sales hiring"] }),
      base({ id: "ana-pricing", type: "case_study", primaryCroId: "ana", expertise: ["pricing"] }),
      base({ id: "ben-hiring", primaryCroId: "ben", expertise: ["sales hiring"], evidence: "data" }),
      base({ id: "ben-endorsed-by-ana", primaryCroId: "ben", expertise: ["founder-led sales"], stances: [{ croId: "ana", croName: "Ana", stance: "endorses", note: null }] }),
      base({ id: "ana-draft", primaryCroId: "ana", expertise: ["sales hiring"], status: "submitted" }),
      base({ id: "ana-collective-only", primaryCroId: "ana", expertise: ["sales hiring"], modes: ["collective"] }),
    ];
    expect(selectIntelligence(records, { kind: "individual", croId: "ana" }, q).map((r) => r.id)).toEqual(["ana-rule", "ben-endorsed-by-ana", "ana-hiring"]);
    expect(selectIntelligence(records, { kind: "collective" }, q).map((r) => r.id)).toEqual(["ben-hiring", "ben-endorsed-by-ana", "ana-hiring", "ana-collective-only"]);
  });

  it("tells the model the mode's rules, the profile (individual) and attributed records", () => {
    const rec = base({ id: "x", title: "Hire after 20 founder deals", stances: [{ croId: "ben", croName: "Ben", stance: "disputes", note: "Inbound changes it" }] });
    const collective = intelligenceBlock({ mode: "collective", records: [rec], croCount: 2 });
    expect(collective).toContain("Synthesize, don't concatenate");
    expect(collective).toContain('"cro":"A"');
    expect(collective).toContain('"disputedBy":"Ben"');
    const individual = intelligenceBlock({ mode: "individual", cro: { id: "a", name: "Ana Alvarez", headline: null, bio: "Seed CRO", careerHistory: null, accomplishments: null, industries: [], stages: [], companyTypes: [], functions: [], expertise: [], philosophy: { hiring: "Hire late" }, style: { directness: "Very direct" } }, records: [] });
    expect(individual).toContain("not Ana Alvarez personally");
    expect(individual).toContain("Never invent experiences");
    expect(individual).toContain('"Views on hiring":"Hire late"');
    expect(individual).toContain('"Level of directness":"Very direct"');
    expect(individual).toContain("none documented for this question yet");
  });
});

describe("conversations with a CRO or the Collective", () => {
  it("an individual CRO's conversation uses their profile and only their validated records, and keeps attribution", async () => {
    const anaRecord = await validated(ana, record());
    await validated(ben, record({ primaryCroId: benCro, title: "Hire an experienced AE early", content: "With inbound demand, hire an AE before 20 deals." }));
    await saveIntelligence(ana, null, record({ title: "Unvalidated idea" }));
    // A draft CRO can't be chosen.
    const draft = await saveCroProfile(admin, null, { name: "Dee Draft" });
    if (!draft.ok) throw new Error(draft.error);
    expect(await startConversation(founder, co, "first_gtm_hire", null, draft.id)).toEqual({ ok: false, error: "That CRO isn't available." });

    h.invent = true;
    const r = await startConversation(founder, co, "first_gtm_hire", null, anaCro);
    if (!r.ok) throw new Error(r.error);
    const input = h.inputs.at(-1) as ChatInput;
    expect(input.intelligence?.mode).toBe("individual");
    expect(input.intelligence?.records.map((x) => x.id)).toEqual([anaRecord]);
    await sendMessage(founder, co, r.conversationId, "Two of us sell; $25k deals.");
    const view = (await getConversation(co, r.conversationId))!;
    expect(view.conversation.croId).toBe(anaCro);
    const answer = view.messages.filter((m) => m.role === "assistant").at(-1)!;
    // Only the record actually given is kept; the invented id is dropped.
    expect(answer.intelligenceIds).toEqual([anaRecord]);
    expect(answer.content).toContain("Ana Alvarez's AI");
    const card = view.recommendations.get(answer.recommendationId!)!.card;
    expect(card.sources).toEqual([{ id: anaRecord, how: `Test mode: used "${record().title}"` }]);
  });

  it("the Collective draws on every CRO in it, names disagreements, and leaves out CROs outside it", async () => {
    const anaRecord = await validated(ana, record());
    const benRecord = await validated(ben, record({ primaryCroId: benCro, title: "Hire an experienced AE early", content: "With inbound demand, hire an AE before 20 deals.", evidence: "data" }));
    await setStance(ben, anaRecord, "disputes", "Strong inbound changes the answer.");
    let bundle = await intelligenceFor(co, null, { text: "Should we hire a VP of Sales?", topicId: "first_gtm_hire" });
    expect(bundle?.mode).toBe("collective");
    expect(bundle!.records.map((r) => r.id).sort()).toEqual([anaRecord, benRecord].sort());

    const r = await startConversation(founder, co, "first_gtm_hire", null);
    if (!r.ok) throw new Error(r.error);
    await sendMessage(founder, co, r.conversationId, "Two of us sell; inbound is strong.");
    const view = (await getConversation(co, r.conversationId))!;
    const card = [...view.recommendations.values()][0]!.card;
    expect(card.perspectives?.map((p) => [p.held_by, p.fits])).toEqual([["Ana Alvarez", false], ["Ben Brooks", true]]);

    // Ben leaves the Collective: his records (and his stance) drop out of it.
    await setCroProfileAdmin(admin, benCro, { status: "published", inCollective: false, userId: ben.id });
    bundle = await intelligenceFor(co, null, { text: "Should we hire a VP of Sales?", topicId: "first_gtm_hire" });
    expect(bundle!.records.map((r) => r.id)).toEqual([anaRecord]);
    expect(bundle!.records[0]!.stances.map((s) => s.croName)).toEqual(["Ana Alvarez"]);
    // With no CROs or records at all, there's nothing to add.
    await db().delete(schema.croIntelligence);
    expect(await intelligenceFor(co, null, { text: "x", topicId: "other" })).toBeNull();
  });
});

describe("engagement: default, switching, second opinion, matching", () => {
  it("new conversations start with the company's default; an explicit choice wins; a stale default falls back to the Collective", async () => {
    expect(await setDefaultCro(founder, co, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "That CRO isn't available." });
    expect(await setDefaultCro(founder, co, anaCro)).toEqual({ ok: true });
    co = (await db().select().from(schema.companies).where(eq(schema.companies.id, co.id)))[0]!;
    const a = await startConversation(founder, co, "first_gtm_hire", null);
    if (!a.ok) throw new Error(a.error);
    expect((await getConversation(co, a.conversationId))!.conversation.croId).toBe(anaCro);
    const b = await startConversation(founder, co, "first_gtm_hire", null, null);
    if (!b.ok) throw new Error(b.error);
    expect((await getConversation(co, b.conversationId))!.conversation.croId).toBeNull();
    await setCroProfileAdmin(admin, anaCro, { status: "draft", inCollective: true, userId: ana.id });
    const c = await startConversation(founder, co, "first_gtm_hire", null);
    if (!c.ok) throw new Error(c.error);
    expect((await getConversation(co, c.conversationId))!.conversation.croId).toBeNull();
  });

  it("switching keeps the history and credits each answer to its CRO; the new perspective sees earlier answers labelled", async () => {
    const r = await startConversation(founder, co, "first_gtm_hire", null, anaCro);
    if (!r.ok) throw new Error(r.error);
    expect(await switchPerspective(founder, co, r.conversationId, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "That CRO isn't available." });
    expect(await switchPerspective(founder, co, r.conversationId, benCro)).toEqual({ ok: true });
    h.inputs.length = 0;
    await sendMessage(founder, co, r.conversationId, "And what would you do?");
    const input = h.inputs.at(-1) as ChatInput;
    expect(input.intelligence?.mode === "individual" && input.intelligence.cro.name).toBe("Ben Brooks");
    expect(input.history.find((t) => t.role === "assistant")!.content).toMatch(/^\[Earlier answer from Ana Alvarez's AI CRO\]/);
    const view = (await getConversation(co, r.conversationId))!;
    expect(view.messages.filter((m) => m.role === "assistant").map((m) => m.croId)).toEqual([anaCro, benCro]);
    expect(view.cros.get(anaCro)).toBe("Ana Alvarez");
    // Earlier conversations say whose perspective answered.
    const ctx = await chatContext(co, { compensation: false });
    expect(ctx.earlierConversations[0]!.perspective).toBe("Ben Brooks's AI CRO");
  });

  it("a second opinion is one Collective answer in the CRO's conversation, which stays with the CRO", async () => {
    const r = await startConversation(founder, co, "first_gtm_hire", null, anaCro);
    if (!r.ok) throw new Error(r.error);
    expect(await secondOpinion(founder, co, r.conversationId)).toEqual({ ok: false, error: "Ask for a second opinion once there's a recommendation." });
    await sendMessage(founder, co, r.conversationId, "Two of us sell.");
    h.inputs.length = 0;
    expect(await secondOpinion(founder, co, r.conversationId)).toEqual({ ok: true });
    const input = h.inputs.at(-1) as ChatInput;
    expect(input.secondOpinionOf?.cro).toBe("Ana Alvarez");
    expect(input.intelligence === null || input.intelligence?.mode === "collective").toBe(true);
    const view = (await getConversation(co, r.conversationId))!;
    const last = view.messages.at(-1)!;
    expect(last).toMatchObject({ role: "assistant", croId: null, secondOpinion: true });
    expect(last.content).toContain("second opinion from the Collective");
    expect(view.conversation.croId).toBe(anaCro);
    const collective = await startConversation(founder, co, "first_gtm_hire", null, null);
    if (!collective.ok) throw new Error(collective.error);
    expect(await secondOpinion(founder, co, collective.conversationId)).toEqual({ ok: false, error: "This conversation is already with the Collective." });
  });

  it("matches the CROs strongest on a question from their validated records", async () => {
    await validated(ana, record());
    await validated(ben, record({ primaryCroId: benCro, title: "Pricing pages that convert", expertise: ["pricing"], tags: ["pricing"] }));
    expect((await strongestCros(co, { text: "Should we hire a VP of Sales?", topicId: "first_gtm_hire" })).map((c) => c.name)).toEqual(["Ana Alvarez"]);
    expect(matchCros([], ["x"], { text: "x", topicId: "other", stage: null, industry: null })).toEqual([]);
  });
});
