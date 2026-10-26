/** The assessment engine against Postgres (PGlite). The Draft and QA agents are stubbed. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import type { AssessmentInput, AssessmentOutput } from "@/lib/ai/assessment";
import { assembleAssessmentInputs, createAssessmentVersion, founderAssessment, runAssessmentPipeline, approveAssessment, assessmentCompletions } from "@/lib/data/assessments";
import { activateUseCase, saveObjectiveAnswer } from "@/lib/data/use-cases";
import { getUseCase } from "@/lib/use-cases";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User;
let advisor: User;
let co: Company;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.dataItems, schema.claimSources, schema.claims, schema.reviews, schema.agentRuns, schema.deliverables, schema.companyUseCases, schema.dataPoints, schema.benchmarkMetrics, schema.benchmarkSources, schema.benchmarkCohorts, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder, advisor] = (await db()
    .insert(schema.users)
    .values([
      { email: "f@co.test", authUserId: "f", role: "founder" },
      { email: "a@gg.test", authUserId: "a", role: "advisor", name: "Ana" },
    ])
    .returning()) as [User, User];
  [co] = (await db().insert(schema.companies).values({ name: "Hire Co", stage: "Seed", salesModel: "Founder-led" }).returning()) as [Company];
  await saveObjectiveAnswer(co, "hire_or_fix", "goal", "Decide whether to hire two AEs");
  await saveObjectiveAnswer(co, "hire_or_fix", "hiring_budget", "300000");
  await db().insert(schema.dataPoints).values([
    { companyId: co.id, metric: "win_rate", value: 18, unit: "percent", confidence: "high", status: "accepted" },
    { companyId: co.id, metric: "sales_cycle_days", value: 94, unit: "days", confidence: "medium", status: "proposed", documentId: null },
    { companyId: co.id, metric: "sales_reps", value: 3, unit: "count", confidence: "high", status: "accepted" },
  ]);
});

const hire = getUseCase("hire_or_fix")!;

/** A draft that only uses what it was given. */
const goodDraft = async (i: AssessmentInput) => {
  const win = i.figures.find((f) => f.metric === "win_rate")!;
  const goal = i.founder_answers.find((a) => a.id === "answer:goal")!;
  const output: AssessmentOutput = {
    summary: { headline: "Fix conversion before hiring.", body: `Win rate is ${win.value} and you want to add reps.`, sources: [win.id, goal.id] },
    findings: [
      { kind: "strength", text: "You have a hiring budget ready.", sources: ["answer:hiring_budget"] },
      { kind: "concern", text: `Win rate is ${win.value}.`, sources: [win.id] },
    ],
    diagnosis: { text: "New reps would split a pipeline that converts poorly.", sources: [win.id, "item:opportunities"] },
    decision: { text: "Fix first, then hire.", sources: [win.id] },
    actions: [{ action: "Tighten qualification.", why: "Raises win rate within 90 days.", horizon: "next_90_days", kpi: "Win Rate", sources: [win.id] }],
    assumptions: ["Pipeline volume is stable."],
    data_gaps: ["No opportunity export yet."],
    next_steps: ["Upload your opportunity export."],
  };
  return { output, model: "stub", tokensIn: 1, tokensOut: 1 };
};
const qa = async () => ({ results: Object.fromEntries(["data_consistency", "benchmark_methodology", "source_trail", "recommendation_logic", "missing_inputs"].map((k) => [k, { result: "pass" as const, note: "ok" }])) as never, model: "q", tokensIn: 1, tokensOut: 1 });

describe("assessment engine", () => {
  it("only runs for a purchased assessment", async () => {
    await expect(createAssessmentVersion(co, "hire_or_fix")).rejects.toThrow("hasn't been purchased");
  });

  it("assembles the founder's answers, figures (unconfirmed flagged) and supplied data, with no reference when none matches", async () => {
    const inputs = await assembleAssessmentInputs(co, hire);
    expect(inputs.input.founder_answers.map((a) => a.id)).toEqual(["answer:goal", "answer:hiring_budget"]);
    expect(inputs.input.figures.map((f) => [f.metric, f.value, f.confirmed])).toEqual(
      expect.arrayContaining([["win_rate", "18%", true], ["sales_reps", "3", true]]),
    );
    expect(inputs.input.data_supplied[0]).toMatchObject({ id: "item:roster", priority: "required" });
    expect(inputs.input.reference).toEqual([]);
    expect(inputs.input.reference_note).toMatch(/No approved peer reference data/);
    expect(inputs.allowed).toEqual(expect.arrayContaining([18, 3, 300000, 90]));
  });

  it("drafts, checks and shows the result with a source trail that includes the founder's own answers", async () => {
    await activateUseCase(co.id, "hire_or_fix", { activation: "paid", by: founder.id });
    const v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    expect(await createAssessmentVersion(co, "hire_or_fix")).toBeNull(); // already running
    expect((await founderAssessment(co.id, "hire_or_fix")).state).toBe("building");
    await runAssessmentPipeline(v.id, { draft: goodDraft, qa });

    const state = await founderAssessment(co.id, "hire_or_fix");
    if (state.state !== "ready") throw new Error(`expected ready, got ${state.state}`);
    const view = state.view;
    expect(view.summary.headline).toBe("Fix conversion before hiring.");
    expect(view.findings[0]!.kind).toBe("concern"); // concerns first
    expect(view.evidence.find((e) => e.label === "Win Rate")).toMatchObject({ value: "18%", unconfirmed: false, topQuartile: null });
    expect(view.reference).toBeNull();
    expect(view.claims["finding.0"]!.sources.map((s) => s.kind)).toEqual(expect.arrayContaining(["founder_answer", "methodology"]));
    expect(view.claims.diagnosis!.sources.map((s) => s.kind)).toEqual(expect.arrayContaining(["data_point", "document"]));
    expect(view.confidence.level).toBe("Low"); // two figures and one data gap
    expect(view.reviewed).toBeNull();
    expect((await assessmentCompletions(co.id)).hire_or_fix).toBeInstanceOf(Date);

    expect(await approveAssessment(advisor, v.id, "Looks right.")).toBe(true);
    const reviewed = await founderAssessment(co.id, "hire_or_fix");
    expect(reviewed.state === "ready" && reviewed.view.reviewed).toMatchObject({ by: "Ana", comment: "Looks right." });
  });

  it("never hides the report: a draft with invented figures is revised, and anything still failing is dropped", async () => {
    await activateUseCase(co.id, "hire_or_fix", { activation: "paid", by: founder.id });
    const bad = async (i: AssessmentInput) => {
      const d = await goodDraft(i);
      d.output.findings.push({ kind: "concern", text: "Peers win 32% of deals.", sources: ["made-up-id"] });
      return d;
    };
    // Revised on the second attempt: the notes say exactly what failed.
    let calls = 0;
    const revised = async (i: AssessmentInput) => {
      calls++;
      if (calls === 1) return bad(i);
      expect(i.revision_notes).toMatch(/"32%" in finding.2 isn't in the input/);
      return goodDraft(i);
    };
    let v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    await runAssessmentPipeline(v.id, { draft: revised, qa });
    let state = await founderAssessment(co.id, "hire_or_fix");
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.view.findings.map((f) => f.text)).not.toContain("Peers win 32% of deals.");
    expect(state.view.degraded).toBe(false);

    // Still bad after revision: the failing statement is removed and the gap is stated.
    v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    await runAssessmentPipeline(v.id, { draft: bad, qa });
    state = await founderAssessment(co.id, "hire_or_fix");
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.view.version).toBe(v.version);
    expect(state.view.findings.map((f) => f.text)).not.toContain("Peers win 32% of deals.");
    expect(state.view.dataGaps).toContain("Some statements couldn't be verified against your data and were left out.");
    expect(state.view.advisor).toBe("review");
  });

  it("builds a plain report from the inputs when the model fails, and when the QA Agent fails still shows the result", async () => {
    await activateUseCase(co.id, "hire_or_fix", { activation: "paid", by: founder.id });
    let v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    await runAssessmentPipeline(v.id, { draft: async () => { throw new Error("model down"); }, qa });
    let state = await founderAssessment(co.id, "hire_or_fix");
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.view.degraded).toBe(true);
    expect(state.view.confidence.level).toBe("Low");
    expect(state.view.findings.map((f) => f.text)).toContain("Win Rate is 18%.");
    expect(state.view.advisor).toBe("review");
    expect(state.view.dataGaps.some((g) => /hasn't been shared yet/.test(g))).toBe(true);

    v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    await runAssessmentPipeline(v.id, { draft: goodDraft, qa: async () => { throw new Error("qa down"); } });
    state = await founderAssessment(co.id, "hire_or_fix");
    expect(state.state === "ready" && state.view.version).toBe(v.version);
  });

  it("works with no answers and no data at all", async () => {
    const [empty] = (await db().insert(schema.companies).values({ name: "Empty Co" }).returning()) as [Company];
    await activateUseCase(empty.id, "winning_icp", { activation: "advisor", by: advisor.id, note: "test" });
    const v = (await createAssessmentVersion(empty, "winning_icp"))!;
    await runAssessmentPipeline(v.id, { draft: async () => { throw new Error("nothing to go on"); }, qa });
    const state = await founderAssessment(empty.id, "winning_icp");
    if (state.state !== "ready") throw new Error(`expected ready, got ${state.state}`);
    expect(state.view.completeness).toBe("minimal");
    expect(state.view.dataGaps).toEqual(expect.arrayContaining(["The questionnaire wasn't answered, so the report can't reflect your goal or context."]));
  });

  it("recommends a monthly executive call when the data is complete", async () => {
    await activateUseCase(co.id, "hire_or_fix", { activation: "paid", by: founder.id });
    for (const k of hire.requiredItems) {
      await db().insert(schema.dataItems).values({ companyId: co.id, category: "team", itemKey: k, status: "available" }).onConflictDoNothing();
    }
    await db().update(schema.dataPoints).set({ status: "accepted" }).where(eq(schema.dataPoints.companyId, co.id));
    await db().insert(schema.dataPoints).values({ companyId: co.id, metric: "quota_attainment", value: 71, unit: "percent", confidence: "high", status: "accepted" });
    const inputs = await assembleAssessmentInputs(co, hire);
    expect(inputs.input.completeness).toBe("complete");
    const v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    const complete = async (i: AssessmentInput) => {
      const d = await goodDraft(i);
      d.output.data_gaps = [];
      return d;
    };
    await runAssessmentPipeline(v.id, { draft: complete, qa });
    const state = await founderAssessment(co.id, "hire_or_fix");
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.view.dataGaps).toEqual([]);
    expect(state.view.confidence.level).toBe("High");
    expect(state.view.advisor).toBe("monthly");
  });

  it("uses approved reference rows when a cohort matches", async () => {
    await activateUseCase(co.id, "hire_or_fix", { activation: "paid", by: founder.id });
    const [src] = await db().insert(schema.benchmarkSources).values({ name: "Survey", type: "public" }).returning();
    const [cohort] = await db().insert(schema.benchmarkCohorts).values({ name: "Seed founder-led", criteria: { stage: ["Seed"] }, companyCount: 30 }).returning();
    const [row] = await db().insert(schema.benchmarkMetrics).values({ cohortId: cohort!.id, metric: "win_rate", median: 21, p75: 27, sourceId: src!.id, status: "approved" }).returning();
    const inputs = await assembleAssessmentInputs(co, hire);
    expect(inputs.input.reference).toEqual([expect.objectContaining({ id: row!.id, metric: "win_rate", median: "21%", top_quartile: "27%" })]);
    expect(inputs.allowed).toEqual(expect.arrayContaining([21, 27, 30]));

    const v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    await runAssessmentPipeline(v.id, { draft: goodDraft, qa });
    const state = await founderAssessment(co.id, "hire_or_fix");
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.view.reference).toEqual({ name: "Seed founder-led", companyCount: 30 });
    expect(state.view.evidence.find((e) => e.label === "Win Rate")).toMatchObject({ median: "21%", topQuartile: "27%" });
  });
});
