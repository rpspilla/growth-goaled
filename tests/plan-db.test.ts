/** Decision Briefs from calculated evidence, committing the plan, and tracking it (PGlite; agents stubbed). */
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
import { assembleAssessmentInputs, createAssessmentVersion, founderAssessment, runAssessmentPipeline } from "@/lib/data/assessments";
import { commitPlan, progressView, updatePlanAction } from "@/lib/data/plan";
import { activateUseCase, getCompanyUseCase } from "@/lib/data/use-cases";
import { analyzeSheets } from "@/lib/metrics-engine";
import { getUseCase } from "@/lib/use-cases";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User;
let co: Company;
let other: Company;

const months = ["Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026"];
const row = (name: string, start: number, end: number) => [name, String(start), ...Array(11).fill(String(start)), String(end)];
const analysis = analyzeSheets([
  { name: "MRR", rows: [["Customer", ...months], row("Acme", 1000, 1500), row("Beta", 2000, 1600), row("Gamma", 500, 0), ["Delta", ...Array(12).fill(""), "800"]] },
]);

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.planActions, schema.claimSources, schema.claims, schema.reviews, schema.agentRuns, schema.deliverables, schema.companyUseCases, schema.dataPoints, schema.documents, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder] = (await db().insert(schema.users).values([{ email: "f@co.test", authUserId: "f", role: "founder" }]).returning()) as [User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Leak Co", stage: "Seed" }, { name: "Other Co" }]).returning()) as [Company, Company];
  const [doc] = await db()
    .insert(schema.documents)
    .values({ companyId: co.id, docType: "other", blobUrl: "blob://mrr", filename: "mrr.xlsx", mime: "text/csv", size: 1, status: "done", analysis })
    .returning();
  await db().insert(schema.dataPoints).values(
    analysis.metrics.map((m) => ({
      companyId: co.id,
      documentId: doc!.id,
      metric: m.metric,
      value: m.value,
      unit: "number",
      period: m.period,
      rawText: `Calculated: ${m.method}`,
      confidence: "high" as const,
      status: "accepted" as const,
      origin: "calculated" as const,
      method: m.method,
      calc: { ...m.source, ...(m.sampleSize !== undefined ? { sampleSize: m.sampleSize } : {}) },
    })),
  );
  await activateUseCase(co.id, "growth_leak", { activation: "paid", by: founder.id });
  // Three recorded sales calls, so briefs publish without waiting for an advisor.
  for (let i = 0; i < 3; i++)
    await db().insert(schema.documents).values({ companyId: co.id, docType: "other", blobUrl: `e2e://call-${i}`, filename: `call-${i}.mp3`, mime: "audio/mpeg", size: 1, status: "done", dataItemKeys: ["sales_calls"] });
});

const leak = getUseCase("growth_leak")!;

/** A brief that cites the rule-based evidence and the calculated bridge. */
const draft = async (i: AssessmentInput) => {
  const top = i.diagnosis!.candidates[0]!;
  const nrr = i.figures.find((f) => f.metric === "nrr")!;
  const output: AssessmentOutput = {
    executive_decision: { decision: "Fix retention before adding acquisition spend.", conclusion: `NRR is ${nrr.value}.`, sources: [nrr.id, `candidate:${top.id}`] },
    diagnosis: { primary: { candidate_id: top.id, title: top.title, explanation: "Losses from the base outweigh new business.", sources: [`candidate:${top.id}`, ...top.supporting] }, alternatives: [], how_to_distinguish: top.test },
    evidence: [{ text: "Churn and contraction were $10.8K of ARR.", status: "calculated", bearing: "supports", dimension: null, sources: ["analysis:0"] }],
    alternatives: [{ option: "Fix retention", upside: "Stops the leak.", downside: "Slower new growth.", implications: "Focus CS.", sources: [nrr.id] }],
    recommendation: { option: "Fix retention", why: "It's the larger loss.", sources: [nrr.id] },
    action_plan: [{ priority: 1, action: "Interview churned customers.", rationale: "Find the cause.", timing: "next_30_days", role: null, success_metric: "NRR", metric_key: "nrr", expected_signal: "NRR rising.", dependencies_risks: "Access to churned accounts.", dimension: null, sources: [nrr.id] }],
    change_triggers: [{ if_this: "Churn turns out to be one-off", then_this: "Shift to acquisition." }],
    follow_up: { metrics: [{ metric_key: "nrr", label: "NRR", why: "The constraint." }], revisit_in_days: 30, revisit_trigger: "A large account gives notice." },
    assumptions: [],
    data_gaps: [],
  };
  return { output, model: "stub", tokensIn: 1, tokensOut: 1 };
};
const qa = async () => ({ results: Object.fromEntries(["data_consistency", "benchmark_methodology", "source_trail", "recommendation_logic", "missing_inputs"].map((k) => [k, { result: "pass" as const, note: "ok" }])) as never, model: "q", tokensIn: 1, tokensOut: 1 });

async function brief(run = draft) {
  const v = (await createAssessmentVersion(co, "growth_leak"))!;
  await runAssessmentPipeline(v.id, { draft: run, qa });
  const state = await founderAssessment(co.id, "growth_leak");
  if (state.state !== "ready") throw new Error(`expected ready, got ${state.state}`);
  return state.view;
}

describe("decision briefs from calculated evidence", () => {
  it("gives the Draft Agent the rule-based diagnosis and the calculated bridge, with their numbers allowed", async () => {
    const { input, allowed, validIds } = await assembleAssessmentInputs(co, leak);
    expect(input.diagnosis!.candidates[0]).toMatchObject({ id: "retention", arr_at_stake: "$10.8K" });
    expect(input.analyses![0]!.title).toBe("ARR bridge, Sep 2025 – Sep 2026 (calculated from mrr.xlsx)");
    expect(input.figures.find((f) => f.metric === "nrr")).toMatchObject({ origin: "calculated", sample_size: 3, value: "88.6%" });
    expect(allowed).toEqual(expect.arrayContaining([10_800, 9_600, 42_000]));
    for (const id of ["ev:0", "analysis:0", "candidate:retention"]) expect(validIds.has(id)).toBe(true);
  });

  it("saves a structured brief whose sources include the calculations, and a rules-only brief when the model fails", async () => {
    const view = await brief();
    expect(view.diagnosis.primary.title).toBe("Revenue lost from existing customers (churn and contraction)");
    expect(view.claims["evidence.0"]!.sources.map((s) => s.kind)).toContain("analysis");
    expect(view.baseline.find((b) => b.metric === "nrr")).toMatchObject({ origin: "calculated", sampleSize: 3, period: "Sep 2025 – Sep 2026" });
    expect(view.analyses[0]!.rows[0]).toBe("Starting ARR $42K (3 customers)");
    expect(view.followUp.revisitInDays).toBe(30);

    const fallback = await brief(async () => {
      throw new Error("model down");
    });
    expect(fallback.degraded).toBe(true);
    expect(fallback.diagnosis.primary.title).toMatch(/Revenue lost from existing customers/);
    expect(fallback.plan[0]!.action).toMatch(/List the churned and contracted accounts/);
  });

  it("commits the plan, tracks it against baseline, and compares the next brief with this one", async () => {
    const first = await brief();
    expect(first.committedAt).toBeNull();
    expect(await commitPlan(founder, co, first.deliverableId)).toEqual({ ok: true });
    expect(await commitPlan(founder, co, first.deliverableId)).toEqual({ ok: true }); // idempotent
    expect((await getCompanyUseCase(co.id, "growth_leak"))!.status).toBe("tracking");

    let progress = (await progressView(co, "growth_leak"))!;
    expect(progress.actions).toHaveLength(1);
    expect(progress.actions[0]!.metric).toMatchObject({ baseline: "88.6%", latest: null });
    expect(progress.revisitDue).toBe(false);

    // A new confirmed figure arrives: Progress shows it against the baseline and flags it.
    await db().insert(schema.dataPoints).values({ companyId: co.id, metric: "nrr", value: 95, unit: "percent", period: "Oct 2026", confidence: "high", status: "accepted" });
    progress = (await progressView(co, "growth_leak"))!;
    expect(progress.metrics.find((m) => m.metric === "nrr")).toMatchObject({ baseline: "88.6%", latest: "95%", direction: "better" });
    expect(progress.newSince.map((n) => n.label)).toContain("NRR");

    // Status updates are scoped to the company.
    const actionId = progress.actions[0]!.id;
    expect(await updatePlanAction(founder, other, actionId, "done", null)).toEqual({ ok: false, error: "That action wasn't found." });
    expect(await updatePlanAction(founder, co, actionId, "in_progress", "Calls booked")).toEqual({ ok: true });
    expect((await progressView(co, "growth_leak"))!.actions[0]).toMatchObject({ status: "in_progress", note: "Calls booked" });
    expect(await commitPlan(founder, other, first.deliverableId)).toEqual({ ok: false, error: "That brief isn't available." });

    // Reassessing keeps Progress open, and the new brief shows what changed.
    const second = await brief();
    expect((await getCompanyUseCase(co.id, "growth_leak"))!.status).toBe("tracking");
    expect(second.baseline.find((b) => b.metric === "nrr")).toMatchObject({ value: "95%", previous: { value: "88.6%", version: first.version, direction: "better" } });
    expect((await progressView(co, "growth_leak"))!.newerBrief).toBe(second.version);
  });

  it("reads briefs saved in the first format", async () => {
    const view = await brief();
    await db()
      .update(schema.deliverables)
      .set({
        content: {
          useCase: "growth_leak",
          figures: [],
          reference: null,
          summary: { headline: "Old headline", body: "Old body", claimKey: "summary" },
          findings: [{ kind: "concern", text: "Old finding", claimKey: "finding.0" }],
          diagnosis: { text: "Old diagnosis", claimKey: "diagnosis" },
          decision: { text: "Old decision", claimKey: "decision" },
          actions: [{ action: "Old action", why: "Because", horizon: "next_90_days", kpi: null, claimKey: "action.0" }],
          assumptions: [],
          dataGaps: [],
          nextSteps: ["Add data"],
          methodology: "m",
        },
      })
      .where(eq(schema.deliverables.id, view.deliverableId));
    const state = await founderAssessment(co.id, "growth_leak");
    if (state.state !== "ready") throw new Error("expected ready");
    expect(state.view.executiveDecision.decision).toBe("Old headline");
    expect(state.view.plan[0]).toMatchObject({ action: "Old action", timing: "days_61_90" });
    expect(state.view.certainty).toBeNull();
  });
});
