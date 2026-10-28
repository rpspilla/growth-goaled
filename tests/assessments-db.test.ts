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
  for (const t of [schema.benchmarkUsages, schema.benchmarkOverrides, schema.benchmarkImports, schema.benchmarkRecords, schema.benchmarkDatasetVersions, schema.benchmarkDatasets, schema.dataItems, schema.claimSources, schema.claims, schema.reviews, schema.agentRuns, schema.deliverables, schema.companyUseCases, schema.dataPoints, schema.benchmarkMetrics, schema.benchmarkSources, schema.benchmarkCohorts, schema.events, schema.companies, schema.users]) await db().delete(t);
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
    executive_decision: { decision: "Fix conversion before hiring.", conclusion: `Win rate is ${win.value} and you want to add reps.`, sources: [win.id, goal.id] },
    diagnosis: {
      primary: { candidate_id: "conversion", title: "Conversion", explanation: "New reps would split a pipeline that converts poorly.", sources: [win.id, "item:opportunities"] },
      alternatives: [],
      how_to_distinguish: null,
    },
    evidence: [
      { text: "You have a hiring budget ready.", status: "verified", bearing: "context", sources: ["answer:hiring_budget"] },
      { text: `Win rate is ${win.value}.`, status: "verified", bearing: "supports", sources: [win.id] },
    ],
    alternatives: [
      { option: "Hire now", upside: "More capacity.", downside: "Splits a weak pipeline.", implications: "Higher burn.", sources: [win.id] },
      { option: "Fix first", upside: "Better conversion.", downside: "Slower.", implications: "Hire later.", sources: [win.id] },
    ],
    recommendation: { option: "Fix first, then hire.", why: "Conversion is the constraint.", sources: [win.id] },
    action_plan: [
      { priority: 2, action: "Review lost deals.", rationale: "Find the pattern.", timing: "next_30_days", role: null, success_metric: "Loss reasons logged", metric_key: null, expected_signal: "A clear pattern.", dependencies_risks: "CRM hygiene.", sources: [win.id] },
      { priority: 1, action: "Tighten qualification.", rationale: "Raises win rate within 90 days.", timing: "days_61_90", role: "Founder", success_metric: "Win rate", metric_key: "win_rate", expected_signal: "Win rate rising.", dependencies_risks: "None.", sources: [win.id] },
    ],
    change_triggers: [{ if_this: "Win rate rises", then_this: "Start hiring." }],
    follow_up: { metrics: [{ metric_key: "win_rate", label: "Win rate", why: "The constraint." }], revisit_in_days: 45, revisit_trigger: "A big swing in win rate." },
    assumptions: ["Pipeline volume is stable."],
    data_gaps: ["No opportunity export yet."],
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
    expect(inputs.input.reference_note).toMatch(/No sufficiently relevant published benchmark/);
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
    expect(view.executiveDecision.decision).toBe("Fix conversion before hiring.");
    expect(view.plan.map((a) => [a.priority, a.action])).toEqual([[1, "Tighten qualification."], [2, "Review lost deals."]]); // ordered by priority
    expect(view.plan[0]).toMatchObject({ metricKey: "win_rate", metricLabel: "Win Rate", role: "Founder" });
    expect(view.baseline.find((e) => e.label === "Win Rate")).toMatchObject({ value: "18%", confirmed: true, origin: "manual", topQuartile: null, previous: null, stale: false });
    expect(view.certainty).not.toBeNull();
    expect(view.reference).toBeNull();
    expect(view.claims["evidence.0"]!.sources.map((s) => s.kind)).toEqual(expect.arrayContaining(["founder_answer", "methodology"]));
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
      d.output.evidence.push({ text: "Peers win 32% of deals.", status: "inference", bearing: "supports", sources: ["made-up-id"] });
      return d;
    };
    // Revised on the second attempt: the notes say exactly what failed.
    let calls = 0;
    const revised = async (i: AssessmentInput) => {
      calls++;
      if (calls === 1) return bad(i);
      expect(i.revision_notes).toMatch(/"32%" in evidence.2 isn't in the input/);
      return goodDraft(i);
    };
    let v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    await runAssessmentPipeline(v.id, { draft: revised, qa });
    let state = await founderAssessment(co.id, "hire_or_fix");
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.view.evidence.map((f) => f.text)).not.toContain("Peers win 32% of deals.");
    expect(state.view.degraded).toBe(false);

    // Still bad after revision: the failing statement is removed and the gap is stated.
    v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    await runAssessmentPipeline(v.id, { draft: bad, qa });
    state = await founderAssessment(co.id, "hire_or_fix");
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.view.version).toBe(v.version);
    expect(state.view.evidence.map((f) => f.text)).not.toContain("Peers win 32% of deals.");
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
    expect(state.view.evidence.map((f) => f.text).join(" ")).toMatch(/Win Rate 18%/);
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

  it("compares with published Benchmark Library records that fit, and keeps the version and record ids", async () => {
    await activateUseCase(co.id, "hire_or_fix", { activation: "paid", by: founder.id });
    const [admin] = (await db().insert(schema.users).values({ email: "admin@gg.test", authUserId: "adm", role: "admin" }).returning()) as [User];
    const lib = await import("@/lib/data/benchmark-library");
    const src = await lib.saveSource(admin, { name: "Survey", publisher: "Test Publisher", url: null, documentRef: null, publishedOn: "2026-01-01", collectionPeriod: null, kind: "published_report", attribution: null, licenceNote: null, allowCustomerDisplay: true, allowDerived: true, reliability: "reliable", updateFrequency: null, reviewIntervalDays: null, consentReference: null, minAggregationSize: null, notes: null });
    if (!src.ok) throw new Error(src.error);
    const ds = await lib.createDataset(admin, { name: "Seed win rates", description: null, sourceId: src.id, companyTypes: [], businessModels: [] });
    if (!ds.ok) throw new Error(ds.error);
    // Test fixture values, not real benchmarks.
    const csv = "metric,definition,definition_matches,unit,statistic,percentile,value,stages,period,period_basis,cohort_definition,sample_size\nwin_rate,Won ÷ closed,yes,percent,median,,21,Seed,FY2025,annual,Seed companies,30\nwin_rate,Won ÷ closed,yes,percent,percentile,75,27,Seed,FY2025,annual,Seed companies,30\n";
    expect(await lib.commitImport(admin, ds.id, { filename: "w.csv", text: csv }, undefined)).toMatchObject({ ok: true, accepted: 2 });
    await lib.validateVersion(admin, ds.versionId);
    expect(await lib.publishVersion(admin, ds.versionId, null)).toEqual({ ok: true });

    const inputs = await assembleAssessmentInputs(co, hire);
    expect(inputs.input.reference).toEqual([expect.objectContaining({ metric: "win_rate", quality: "strong", benchmark_values: ["median 21%", "75th percentile 27%"], difference: "3 pts below the median" })]);
    expect(inputs.input.reference_note).toMatch(/1 comparison from the Benchmark Library/);
    expect(inputs.allowed).toEqual(expect.arrayContaining([21, 27, 30, 3]));

    const cites = async (i: AssessmentInput) => {
      const d = await goodDraft(i);
      d.output.evidence.push({ text: `Win rate is 3 pts below the cohort median of 21%.`, status: "calculated", bearing: "supports", sources: [i.reference[0]!.id] });
      return d;
    };
    const v = (await createAssessmentVersion(co, "hire_or_fix"))!;
    await runAssessmentPipeline(v.id, { draft: cites, qa });
    const state = await founderAssessment(co.id, "hire_or_fix");
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.view.benchmarks).toEqual([expect.objectContaining({ metric: "win_rate", benchmark: expect.objectContaining({ dataset: expect.objectContaining({ name: "Seed win rates", version: 1, versionId: ds.versionId }) }) })]);
    expect(state.view.claims["evidence.2"]!.sources.map((s) => s.kind)).toContain("benchmark_record");
    expect((await lib.getDataset(ds.id))!.usage).toEqual([expect.objectContaining({ company: "Hire Co", useCase: "hire_or_fix", metrics: ["win_rate"] })]);
  });
});
