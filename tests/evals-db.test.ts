/** Evaluation runs: scenarios from the workbook, run ordering, one scenario per step, averages (PGlite; AI stubbed). */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Seen = { question: string; recordIds: string[]; answerNow?: boolean };
const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, seen: [] as Seen[], judged: [] as { mode: string; reference: string | null }[], failNext: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/ai/conflicts", () => ({ findConflicts: async () => [] }));
vi.mock("@/lib/ai/chat", () => ({
  chatTurn: async (input: { history: { content: string }[]; intelligence: { records: { id: string }[] } | null; answerNow?: boolean }) => {
    if (h.failNext) {
      h.failNext = false;
      throw new Error("The model is overloaded");
    }
    h.seen.push({ question: input.history[0]!.content, recordIds: (input.intelligence?.records ?? []).map((r) => r.id), answerNow: input.answerNow });
    return { output: { reply: "Focus first.", recommendation: { takeaway: "Focus", recommendation: "Pick one channel." }, intelligence_used: (input.intelligence?.records ?? []).map((r) => ({ id: r.id })) } };
  },
}));
vi.mock("@/lib/ai/judge", () => ({
  judgeAnswer: async (input: { mode: string; reference: string | null }) => {
    h.judged.push({ mode: input.mode, reference: input.reference });
    const n = h.judged.length;
    return { scores: { diagnosis: n % 2 ? 4 : 5, accuracy: 3, continuity: null }, notes: { diagnosis: "ok" }, summary: "Sound." };
  },
}));

import { schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { saveCroProfile, setCroProfileAdmin } from "@/lib/data/cro";
import { advanceEvalRun, evalRunDetail, evalRuns, evalScenarioList, startEvalRun } from "@/lib/data/evals";
import { importWorkbook, validateImported } from "@/lib/data/workbook-import";
import { averages } from "@/lib/evals";
import { parseCsv } from "@/lib/file-profile";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let admin: User;
let ryan: string;

const template = readFileSync(path.join(__dirname, "fixtures/cro-training-workbook.csv"), "utf8");
function filled(): string[][] {
  const rows = parseCsv(template);
  const header = rows[0]!;
  const r = rows.find((x) => x[0] === "GG-028")!;
  r[header.indexOf("Your Recommendation / Position")] = "Hire a strong AE first; keep the founder selling.";
  const g = rows.find((x) => x[0] === "GG-001")!;
  g[header.indexOf("Your Recommendation / Position")] = "Pick the one channel that converts.";
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
  for (const t of [schema.evalResults, schema.evalRuns, schema.evalScenarios, schema.croIntelligenceConflicts, schema.croIntelligenceContributors, schema.croIntelligence, schema.croProfiles, schema.events, schema.users]) await db().delete(t);
  [admin] = (await db().insert(schema.users).values([{ email: "admin@gg.test", authUserId: "admin", role: "admin" }]).returning()) as [User];
  const r = await saveCroProfile(admin, null, { name: "Ryan Spillane", bio: "CRO." });
  if (!r.ok) throw new Error("setup");
  ryan = r.id;
  await setCroProfileAdmin(admin, ryan, { status: "published", inCollective: true, userId: null });
  h.seen = [];
  h.judged = [];
  h.failNext = false;
});

describe("evaluations", () => {
  it("averages each criterion over the answers that scored it", () => {
    expect(averages([{ scores: { a: 4, b: null } }, { scores: { a: 5, b: 3 } }, { scores: null }])).toEqual({ a: 4.5, b: 3 });
  });

  it("has the brief's scenarios and every workbook scenario", async () => {
    expect((await evalScenarioList()).map((s) => s.key)).toEqual(["BRIEF-1", "BRIEF-2"]);
    await importWorkbook(admin, { filename: "workbook.csv", rows: filled(), respondentCroId: ryan });
    const all = await evalScenarioList();
    expect(all).toHaveLength(60);
    expect(all.find((s) => s.key === "GG-001")).toMatchObject({ category: "Growth Strategy", stage: "Seed", question: "What should we focus on?" });
  });

  it("starts a CRO's run with the scenarios they answered, and refuses unpublished CROs and empty counts", async () => {
    await importWorkbook(admin, { filename: "workbook.csv", rows: filled(), respondentCroId: ryan });
    const run = await startEvalRun(admin, { croId: ryan, count: 3 });
    if (!run.ok) throw new Error(run.error);
    const detail = (await evalRunDetail(run.id))!;
    expect(detail.scenarios.map((s) => s.key).slice(0, 2).sort()).toEqual(["GG-001", "GG-028"]);
    expect(detail.scenarios).toHaveLength(3);
    expect((await startEvalRun(admin, { croId: ryan, count: 500 })).ok && (await evalRuns())[0]!.run.scenarioIds.length).toBe(20);
    await setCroProfileAdmin(admin, ryan, { status: "draft", inCollective: false, userId: null });
    expect(await startEvalRun(admin, { croId: ryan, count: 3 })).toEqual({ ok: false, error: "Evaluate a published CRO." });
  });

  it("answers one scenario per step without the CRO's own answer, judges it against that answer, and finishes with averages", async () => {
    const imported = await importWorkbook(admin, { filename: "workbook.csv", rows: filled(), respondentCroId: ryan });
    if (!imported.ok) throw new Error("import");
    await validateImported(admin, imported.recordIds);
    const run = await startEvalRun(admin, { croId: ryan, count: 2, scenarioKeys: ["GG-028", "BRIEF-1"] });
    if (!run.ok) throw new Error(run.error);
    expect(await advanceEvalRun(run.id)).toEqual({ status: "running", done: 1, total: 2 });
    // GG-028 first (Ryan answered it); his GG-028 record is the reference and isn't shown to his AI.
    expect(h.seen[0]!.question).toContain("Is this the right first hire?");
    const own = (await db().select().from(schema.croIntelligence)).find((r) => r.sourceKey === "GG-028")!;
    expect(own.status).toBe("validated");
    expect(h.seen[0]!.recordIds).not.toContain(own.id);
    expect(h.seen[0]!.answerNow).toBe(true);
    expect(h.judged[0]).toEqual({ mode: "individual", reference: expect.stringContaining("Hire a strong AE first") });
    h.failNext = true;
    expect(await advanceEvalRun(run.id)).toEqual({ status: "running", done: 2, total: 2 });
    expect(await advanceEvalRun(run.id)).toEqual({ status: "done", done: 2, total: 2 });
    const detail = (await evalRunDetail(run.id))!;
    expect(detail.run.averages).toEqual({ diagnosis: 4, accuracy: 3 });
    expect(detail.results.find((r) => r.error)?.error).toBe("The model is overloaded");
    // A finished run doesn't answer again.
    expect(await advanceEvalRun(run.id)).toEqual({ status: "done", done: 2, total: 2 });
    expect(h.judged).toHaveLength(1);
  });

  it("evaluates the Collective with no reference", async () => {
    const run = await startEvalRun(admin, { croId: null, count: 1 });
    if (!run.ok) throw new Error(run.error);
    await advanceEvalRun(run.id);
    expect(h.judged).toEqual([{ mode: "collective", reference: null }]);
  });
});
