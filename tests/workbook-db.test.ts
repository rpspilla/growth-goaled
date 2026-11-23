/** CRO Training Workbook import, corrections and conflict detection in the CRO intelligence library (PGlite; AI stubbed). */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, conflictCalls: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
// Conflict check stand-in: another CRO's record in the same category conflicts.
vi.mock("@/lib/ai/conflicts", () => ({
  findConflicts: async (record: { cro: string; category: string | null }, candidates: { id: string; cro: string; category: string | null }[]) => {
    h.conflictCalls++;
    return candidates.filter((c) => c.category === record.category && c.cro !== record.cro).map((c) => ({ id: c.id, why: `${record.cro} and ${c.cro} disagree` }));
  },
}));

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { disagreements, relevance, type RecordForRetrieval } from "@/lib/cro";
import { conflictsFor, createCorrection, decideConflict, detectConflicts, getIntelligence, intelligenceFor, saveCroProfile, setCroProfileAdmin, setIntelligenceStatus } from "@/lib/data/cro";
import { importWorkbook, validateImported, workbookRows } from "@/lib/data/workbook-import";
import { parseCsv } from "@/lib/file-profile";
import { parseWorkbook, scenarioContent } from "@/lib/workbook";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let admin: User;
let ryanLogin: User;
let jamesLogin: User;
let ryan: string;
let james: string;
let co: Company;

const template = readFileSync(path.join(__dirname, "fixtures/cro-training-workbook.csv"), "utf8");
/** The real workbook template, with GG-001 answered by the respondent and both named CROs, and GG-028 by James only. */
function filled(): string[][] {
  const rows = parseCsv(template);
  const header = rows[0]!;
  const set = (key: string, column: string, value: string) => {
    const r = rows.find((x) => x[0] === key)!;
    r[header.indexOf(column)] = value;
  };
  set("GG-001", "Your Initial Instinct / What Jumps Out", "Too many channels for a $1.2M company.");
  set("GG-001", "Your Recommendation / Position", "Pick one channel that already converts and double down for two quarters.");
  set("GG-001", "Example of How You Would Say It", "You don't have a growth problem, you have a focus problem.");
  set("GG-001", "Ryan Answer", "Focus on the channel with the best win rate.");
  set("GG-001", "James Answer", "Fix founder-led sales before scaling any channel.");
  set("GG-001", "Differences / Discussion", "Ryan starts from channels, James from the sales motion.");
  set("GG-001", "Notes / Real Example", "A fintech client went from 5 channels to 1 and doubled pipeline.");
  set("GG-028", "James Answer", "No: hire a strong AE first and keep the founder selling.");
  return rows;
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
  for (const t of [schema.croIntelligenceConflicts, schema.croIntelligenceContributors, schema.croIntelligence, schema.conversationMessages, schema.conversations, schema.croProfiles, schema.events, schema.companies, schema.users]) await db().delete(t);
  [admin, ryanLogin, jamesLogin] = (await db()
    .insert(schema.users)
    .values([
      { email: "admin@gg.test", authUserId: "admin", role: "admin" },
      { email: "ryan@gg.test", authUserId: "ryan", role: "advisor" },
      { email: "james@gg.test", authUserId: "james", role: "advisor" },
    ])
    .returning()) as [User, User, User];
  const r = await saveCroProfile(admin, null, { name: "Ryan Spillane", bio: "CRO." });
  const j = await saveCroProfile(admin, null, { name: "James Winn", bio: "CRO." });
  if (!r.ok || !j.ok) throw new Error("setup");
  ryan = r.id;
  james = j.id;
  await setCroProfileAdmin(admin, ryan, { status: "published", inCollective: true, userId: ryanLogin.id });
  await setCroProfileAdmin(admin, james, { status: "published", inCollective: true, userId: jamesLogin.id });
  [co] = (await db().insert(schema.companies).values([{ name: "Zentrix", stage: "Seed", industry: "SaaS" }]).returning()) as [Company];
  h.conflictCalls = 0;
});

describe("the training workbook", () => {
  it("parses the real template: 58 scenarios, the respondent's columns, named answers", () => {
    const empty = parseWorkbook(parseCsv(template));
    expect(empty).toHaveLength(58);
    expect(empty[0]).toMatchObject({ key: "GG-001", category: "Growth Strategy", stage: "Seed", question: "What should we focus on?", answer: [], named: [] });
    const s = parseWorkbook(filled())[0]!;
    expect(s.answer.map((a) => a.label)).toEqual(["Initial instinct", "Recommendation", "How I'd say it"]);
    expect(s.named).toEqual([{ name: "Ryan", text: "Focus on the channel with the best win rate." }, { name: "James", text: "Fix founder-led sales before scaling any channel." }]);
    const content = scenarioContent(s, s.answer);
    expect(content).toContain("Founder situation (Seed): $1.2M ARR; inconsistent growth");
    expect(content).toContain("How I'd say it: You don't have a growth problem, you have a focus problem.");
    expect(content).toContain("Real example: A fintech client went from 5 channels to 1");
    expect(content).toContain("Where our CROs differ: Ryan starts from channels, James from the sales motion.");
    expect(() => parseWorkbook([["Name", "Email"]])).toThrow("no Scenario ID column");
  });

  it("imports each CRO's answers as attributed, submitted Scenario records, links co-answered ones, and re-imports without duplicates", async () => {
    const result = await importWorkbook(admin, { filename: "workbook.csv", rows: filled(), respondentCroId: ryan });
    expect(result).toMatchObject({ ok: true, scenarios: 58, created: 3, updated: 0, unchanged: 0, unanswered: 56, skippedNames: [] });
    const records = await db().select().from(schema.croIntelligence);
    const ryan001 = records.find((r) => r.primaryCroId === ryan && r.sourceKey === "GG-001")!;
    const james001 = records.find((r) => r.primaryCroId === james && r.sourceKey === "GG-001")!;
    const james028 = records.find((r) => r.primaryCroId === james && r.sourceKey === "GG-028")!;
    // Ryan is the respondent: his structured answer wins over his short one.
    expect(ryan001).toMatchObject({ type: "scenario", status: "submitted", category: "Growth Strategy", stages: ["Seed"], evidence: "case_evidence", title: "GG-001: What should we focus on?", expertise: ["growth strategy", "gtm strategy"] });
    expect(ryan001.content).toContain("Recommendation: Pick one channel that already converts");
    expect(ryan001.content).not.toContain("Answer: Focus on the channel");
    expect(james001.content).toContain("Answer: Fix founder-led sales before scaling any channel.");
    expect(james028.expertise).toEqual(["sales hiring", "organizational design", "compensation"]);
    expect(ryan001.relatedIds).toEqual([james001.id]);
    expect(james001.relatedIds).toEqual([ryan001.id]);
    expect((await getIntelligence(ryan001.id))!.stances).toEqual([expect.objectContaining({ croName: "Ryan Spillane", stance: "author" })]);

    // Validated, then re-imported unchanged: nothing moves. Changed: a new version back to review.
    await validateImported(admin, [ryan001.id, james001.id]);
    expect(await importWorkbook(admin, { filename: "workbook.csv", rows: filled(), respondentCroId: ryan })).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
    const changed = filled();
    changed.find((r) => r[0] === "GG-001")![changed[0]!.indexOf("James Answer")] = "Fix founder-led sales first; then one channel.";
    expect(await importWorkbook(admin, { filename: "workbook.csv", rows: changed, respondentCroId: ryan })).toMatchObject({ updated: 1, unchanged: 2 });
    expect(await getIntelligence(james001.id)).toMatchObject({ status: "submitted", version: 2 });
    expect((await db().select().from(schema.croIntelligence)).length).toBe(3);
  });

  it("lets a CRO import only their own answers; unmatched names are reported", async () => {
    expect(await importWorkbook(ryanLogin, { filename: "w.csv", rows: filled(), respondentCroId: james })).toEqual({ ok: false, error: "You can only import your own answers." });
    const rows = filled();
    rows[0]![rows[0]!.indexOf("James Answer")] = "Priya Answer";
    const result = await importWorkbook(ryanLogin, { filename: "w.csv", rows, respondentCroId: ryan });
    expect(result).toMatchObject({ ok: true, created: 1, skippedNames: ["Priya"] });
    const jamesOnly = await importWorkbook(ryanLogin, { filename: "w.csv", rows: filled(), respondentCroId: null });
    expect(jamesOnly).toMatchObject({ ok: true, skippedNames: ["James"] });
    // A CRO can't validate their own import.
    const [rec] = await db().select().from(schema.croIntelligence);
    expect(await validateImported(ryanLogin, [rec!.id])).toEqual({ validated: 0, refused: 1 });
  });

  it("reads CSV and rejects other formats or oversized files", async () => {
    expect((await workbookRows("w.csv", Buffer.from("﻿Scenario ID,Category\nGG-1,X")))[0]).toEqual(["Scenario ID", "Category"]);
    await expect(workbookRows("w.pdf", Buffer.from("x"))).rejects.toThrow("Upload the workbook as .csv or .xlsx.");
    await expect(workbookRows("w.csv", Buffer.alloc(1024 * 1024 + 1))).rejects.toThrow("up to 1 MB");
  });
});

describe("conflicts", () => {
  it("are flagged when a record is validated, confirmed or dismissed, and confirmed ones reach the Collective", async () => {
    await importWorkbook(admin, { filename: "w.csv", rows: filled(), respondentCroId: ryan });
    const records = await db().select().from(schema.croIntelligence);
    const ryan001 = records.find((r) => r.primaryCroId === ryan && r.sourceKey === "GG-001")!;
    const james001 = records.find((r) => r.primaryCroId === james && r.sourceKey === "GG-001")!;
    await setIntelligenceStatus(admin, james001.id, "validated");
    expect(await detectConflicts(ryan001.id)).toBe(0); // not validated yet
    await setIntelligenceStatus(admin, ryan001.id, "validated");
    expect(await detectConflicts(ryan001.id)).toBe(1);
    expect(await detectConflicts(ryan001.id)).toBe(0); // once per pair
    const [c] = await conflictsFor(james001.id);
    expect(c).toMatchObject({ otherId: ryan001.id, otherCro: "Ryan Spillane", status: "suggested", why: "Ryan Spillane and James Winn disagree" });
    // Not yet confirmed: the Collective doesn't treat it as a disagreement.
    let bundle = await intelligenceFor(co, null, { text: "What should we focus on? growth strategy", topicId: "revenue_engine" });
    expect(disagreements(bundle!.records)).toEqual([]);
    const founder = (await db().insert(schema.users).values({ email: "f@z.test", authUserId: "f", role: "founder" }).returning())[0]!;
    expect(await decideConflict(founder, c!.id, "confirmed")).toEqual({ ok: false, error: "Only CROs and admins review conflicts." });
    expect(await decideConflict(jamesLogin, c!.id, "confirmed")).toEqual({ ok: true });
    bundle = await intelligenceFor(co, null, { text: "What should we focus on? growth strategy", topicId: "revenue_engine" });
    expect(disagreements(bundle!.records)).toEqual([expect.objectContaining({ why: "Ryan Spillane and James Winn disagree" })]);
  });
});

describe("corrections", () => {
  it("turn a wrong AI answer into a Correction record, anonymised and attributed, that outranks other advice once validated", async () => {
    const [conv] = await db().insert(schema.conversations).values({ companyId: co.id, topic: "first_gtm_hire", title: "Zentrix: who should we hire first?" }).returning();
    const [msg] = await db().insert(schema.conversationMessages).values({ conversationId: conv!.id, role: "assistant", content: "Hire a VP of Sales at Zentrix now." }).returning();
    const [userMsg] = await db().insert(schema.conversationMessages).values({ conversationId: conv!.id, role: "user", content: "Hi" }).returning();
    const [other] = (await db().insert(schema.companies).values([{ name: "Other" }]).returning()) as [Company];
    expect(await createCorrection(ryanLogin, co, msg!.id, { wrong: " ", right: "x" })).toEqual({ ok: false, error: "Say what was wrong and what the right guidance is." });
    expect(await createCorrection(ryanLogin, other, msg!.id, { wrong: "a", right: "b" })).toEqual({ ok: false, error: "That answer wasn't found." });
    expect(await createCorrection(ryanLogin, co, userMsg!.id, { wrong: "a", right: "b" })).toEqual({ ok: false, error: "That answer wasn't found." });
    const advisorNoCro = (await db().insert(schema.users).values({ email: "a2@gg.test", authUserId: "a2", role: "advisor" }).returning())[0]!;
    expect(await createCorrection(advisorNoCro, co, msg!.id, { wrong: "a", right: "b" })).toEqual({ ok: false, error: "Your login isn't linked to a CRO profile yet. Ask an admin." });
    const r = await createCorrection(ryanLogin, co, msg!.id, { wrong: "Too early for a VP.", right: "Hire a senior AE first; the founder keeps selling until the motion repeats." });
    if (!r.ok) throw new Error(r.error);
    const rec = (await getIntelligence(r.id))!;
    expect(rec).toMatchObject({ type: "correction", status: "submitted", primaryCroId: ryan, classification: "individual", fromMessageId: msg!.id, stages: ["Seed"], industries: ["SaaS"], title: "Correction: the company: who should we hire first?" });
    expect(rec.content).not.toMatch(/zentrix/i);
    expect(rec.content).toContain("The right guidance: Hire a senior AE first");
    expect(rec.expertise).toContain("sales hiring");
    const base: RecordForRetrieval = { ...rec, primaryCroName: "Ryan Spillane", stances: [] };
    const q = { text: "who should we hire first", topicId: "first_gtm_hire", stage: null, industry: null };
    expect(relevance(base, q) - relevance({ ...base, type: "principle" }, q)).toBe(3);
  });
});
