import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, QaResults, User } from "@/lib/db/schema";
import { AI_MODEL } from "@/lib/ai/config";
import { draftBenchmark, DraftError, type DraftInput, type DraftOutput } from "@/lib/ai/draft";
import { qaBenchmark, QaError } from "@/lib/ai/qa";
import { describeCriteria } from "@/lib/benchmarks";
import { statusVsTopQuartile } from "@/lib/benchmark";
import { matchCohort, methodologyText, type CohortMatch } from "@/lib/cohort-match";
import { benchmarkContentSchema, type BenchmarkContent } from "@/lib/deliverables/benchmark";
import { allowedNumbers, checkDraft, type ClaimForCheck } from "@/lib/deliverables/checks";
import { track } from "@/lib/events";
import { formatMetric, isMetricKey, METRICS, type MetricKey } from "@/lib/metrics";

type Deliverable = typeof schema.deliverables.$inferSelect;
type Status = Deliverable["status"];

/** Versions that are still moving through the pipeline or waiting on the advisor. */
export const ACTIVE: Status[] = ["drafting", "qa", "in_review", "approved"];
/** A run that hasn't finished in this long was cut off (the function timed out). */
export const STALL_MS = 10 * 60_000;

export const isStalled = (d: Pick<Deliverable, "status" | "updatedAt">, now = Date.now()) =>
  (d.status === "drafting" || d.status === "qa") && now - d.updatedAt.getTime() > STALL_MS;

// ---------------------------------------------------------------------------
// Inputs (all figures computed here, never by the model)
// ---------------------------------------------------------------------------

type ComparisonRow = {
  metric: MetricKey;
  dataPointId: string;
  benchmarkMetricId: string;
  company: number;
  median: number | null;
  topQuartile: number;
  p25: number | null;
  sourceName: string | null;
};

export type BenchmarkInputs = {
  input: DraftInput;
  rows: ComparisonRow[];
  cohort: typeof schema.benchmarkCohorts.$inferSelect;
  match: CohortMatch;
  methodology: string;
  dataPointIds: Set<string>;
  benchmarkIds: Set<string>;
  allowed: number[];
};

export class PipelineError extends Error {}

export async function assembleBenchmarkInputs(company: Company, advisorFeedback: string | null = null): Promise<BenchmarkInputs> {
  const points = await db
    .select()
    .from(schema.dataPoints)
    .where(and(eq(schema.dataPoints.companyId, company.id), eq(schema.dataPoints.status, "accepted")))
    .orderBy(desc(schema.dataPoints.updatedAt));
  const latest = new Map<MetricKey, (typeof points)[number]>();
  for (const p of points) if (isMetricKey(p.metric) && !latest.has(p.metric)) latest.set(p.metric, p);
  if (!latest.size) throw new PipelineError("The company has no accepted figures to benchmark yet.");

  const approved = await db
    .select({ metric: schema.benchmarkMetrics, cohort: schema.benchmarkCohorts, source: schema.benchmarkSources })
    .from(schema.benchmarkMetrics)
    .innerJoin(schema.benchmarkCohorts, eq(schema.benchmarkCohorts.id, schema.benchmarkMetrics.cohortId))
    .leftJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkMetrics.sourceId))
    .where(and(eq(schema.benchmarkMetrics.status, "approved"), eq(schema.benchmarkCohorts.isSample, company.isSample), isNotNull(schema.benchmarkMetrics.p75)))
    .orderBy(desc(schema.benchmarkMetrics.createdAt));

  const byCohort = new Map<string, { cohort: (typeof approved)[number]["cohort"]; rows: Map<string, (typeof approved)[number]> }>();
  for (const r of approved) {
    const entry = byCohort.get(r.cohort.id) ?? { cohort: r.cohort, rows: new Map() };
    if (!entry.rows.has(r.metric.metric)) entry.rows.set(r.metric.metric, r); // newest approved row per metric
    byCohort.set(r.cohort.id, entry);
  }

  const arr = latest.get("arr")?.value ?? company.arr ?? null;
  const match = matchCohort(
    { stage: company.stage, arr, revenueBand: company.revenueBand, salesModel: company.salesModel, industry: company.industry, primarySegment: company.primarySegment },
    [...byCohort.values()].map((c) => ({ id: c.cohort.id, name: c.cohort.name, criteria: c.cohort.criteria, approvedMetrics: [...c.rows.keys()] })),
    [...latest.keys()],
  );
  if (!match) throw new PipelineError("No approved benchmark cohort has figures for this company's metrics. Approve benchmark rows for a matching cohort first.");
  const chosen = byCohort.get(match.cohortId)!;

  const rows: ComparisonRow[] = match.overlap.filter(isMetricKey).map((metric) => {
    const dp = latest.get(metric)!;
    const bm = chosen.rows.get(metric)!;
    return {
      metric,
      dataPointId: dp.id,
      benchmarkMetricId: bm.metric.id,
      company: dp.value,
      median: bm.metric.median,
      topQuartile: bm.metric.p75!,
      p25: bm.metric.p25,
      sourceName: bm.source ? [bm.source.name, bm.source.year].filter(Boolean).join(", ") : null,
    };
  });

  const methodology = methodologyText(chosen.cohort, match);
  const fmt = (m: MetricKey, v: number) => formatMetric(m, v);
  const openQuestions = await db
    .select({ type: schema.registerItems.type, title: schema.registerItems.title })
    .from(schema.registerItems)
    .where(and(eq(schema.registerItems.companyId, company.id), eq(schema.registerItems.status, "open")));

  const comparedMetrics = new Set(rows.map((r) => r.metric));
  const other = [...latest.entries()].filter(([m]) => !comparedMetrics.has(m));
  const input: DraftInput = {
    company: { name: company.name, stage: company.stage, sales_model: company.salesModel, industry: company.industry, primary_segment: company.primarySegment },
    cohort: { name: chosen.cohort.name, criteria: describeCriteria(chosen.cohort.criteria), company_count: chosen.cohort.companyCount, methodology },
    comparison: rows.map((r) => ({
      metric: r.metric,
      label: METRICS[r.metric].label,
      lower_is_better: METRICS[r.metric].lowerIsBetter,
      company_value: fmt(r.metric, r.company),
      cohort_median: r.median !== null ? fmt(r.metric, r.median) : null,
      cohort_top_quartile: fmt(r.metric, r.topQuartile),
      status_vs_top_quartile: statusVsTopQuartile(r.metric, r.company, r.topQuartile),
      data_point_id: r.dataPointId,
      benchmark_row_id: r.benchmarkMetricId,
      benchmark_source: r.sourceName,
    })),
    other_company_data: other.map(([m, p]) => ({ metric: m, label: METRICS[m].label, value: fmt(m, p.value), data_point_id: p.id })),
    open_questions: openQuestions,
    advisor_feedback: advisorFeedback,
  };

  return {
    input,
    rows,
    cohort: chosen.cohort,
    match,
    methodology,
    dataPointIds: new Set([...rows.map((r) => r.dataPointId), ...other.map(([, p]) => p.id)]),
    benchmarkIds: new Set(rows.map((r) => r.benchmarkMetricId)),
    allowed: allowedNumbers(rows, [...other.map(([, p]) => p.value), ...(chosen.cohort.companyCount ? [chosen.cohort.companyCount] : [])]),
  };
}

// ---------------------------------------------------------------------------
// Content and claims
// ---------------------------------------------------------------------------

type ClaimDef = { key: string; text: string; sources: string[]; methodology?: boolean };

export function claimsFromDraft(inputs: Pick<BenchmarkInputs, "rows">, draft: DraftOutput): ClaimDef[] {
  const fmt = (m: MetricKey, v: number) => formatMetric(m, v);
  return [
    ...inputs.rows.map((r) => ({
      key: `row.${r.metric}`,
      text: `${METRICS[r.metric].label}: ${fmt(r.metric, r.company)} vs. ${r.median !== null ? `cohort median ${fmt(r.metric, r.median)} and ` : ""}top quartile ${fmt(r.metric, r.topQuartile)}.`,
      sources: [r.dataPointId, r.benchmarkMetricId],
      methodology: true,
    })),
    { key: "insight", text: `${draft.insight.headline} ${draft.insight.body}`, sources: draft.insight.sources },
    ...draft.strengths.map((s, i) => ({ key: `strength.${i + 1}`, text: s.text, sources: s.sources })),
    ...draft.watch_areas.map((s, i) => ({ key: `watch.${i + 1}`, text: s.text, sources: s.sources })),
    { key: "priority", text: draft.priority.text, sources: draft.priority.sources },
  ];
}

export function contentFromDraft(inputs: Pick<BenchmarkInputs, "rows" | "cohort" | "methodology">, draft: DraftOutput): BenchmarkContent {
  return benchmarkContentSchema.parse({
    cohortId: inputs.cohort.id,
    rows: inputs.rows.map((r) => ({ metric: r.metric, dataPointId: r.dataPointId, benchmarkMetricId: r.benchmarkMetricId, claimKey: `row.${r.metric}` })),
    insight: { headline: draft.insight.headline, body: draft.insight.body, claimKey: "insight" },
    summary: {
      strengths: draft.strengths.map((s, i) => ({ text: s.text, claimKey: `strength.${i + 1}` })),
      watchAreas: draft.watch_areas.map((s, i) => ({ text: s.text, claimKey: `watch.${i + 1}` })),
      priority: { text: draft.priority.text, claimKey: "priority" },
    },
    methodology: inputs.methodology,
  });
}

/** Rebuilds the draft output from saved content and claims (used to QA an advisor-edited version). */
export function draftFromContent(content: BenchmarkContent, headline: string, sources: Record<string, string[]>, missing: string[]): DraftOutput {
  const s = (k: string) => sources[k] ?? [];
  return {
    headline,
    insight: { headline: content.insight.headline, body: content.insight.body, sources: s("insight") },
    strengths: content.summary.strengths.map((c) => ({ text: c.text, sources: s(c.claimKey) })),
    watch_areas: content.summary.watchAreas.map((c) => ({ text: c.text, sources: s(c.claimKey) })),
    priority: { text: content.summary.priority.text, sources: s("priority") },
    missing_inputs: missing,
  };
}

async function saveClaims(deliverableId: string, claims: ClaimDef[], dataPointIds: Set<string>, benchmarkIds: Set<string>, methodology: string) {
  for (const c of claims) {
    const [row] = await db.insert(schema.claims).values({ deliverableId, claimKey: c.key, text: c.text, confidence: "high" }).returning({ id: schema.claims.id });
    const sources: (typeof schema.claimSources.$inferInsert)[] = [];
    for (const id of new Set(c.sources)) {
      if (dataPointIds.has(id)) sources.push({ claimId: row!.id, kind: "data_point", refId: id });
      else if (benchmarkIds.has(id)) sources.push({ claimId: row!.id, kind: "benchmark_metric", refId: id });
    }
    if (c.methodology) sources.push({ claimId: row!.id, kind: "methodology", refId: null, note: methodology });
    if (sources.length) await db.insert(schema.claimSources).values(sources);
  }
}

/** Merges the QA model's checks with the code checks; a code failure always wins. */
export function combineQa(model: QaResults, code: ReturnType<typeof checkDraft>): QaResults {
  const out: QaResults = structuredClone(model);
  if (code.untracedNumbers.length) {
    out.data_consistency = {
      result: "fail",
      note: `Code check: figures not found in the inputs: ${code.untracedNumbers.map((u) => `"${u.raw}" (${u.claim})`).join(", ")}. ${model.data_consistency.note ?? ""}`.trim(),
    };
  }
  if (code.unsourcedClaims.length || code.unknownSources.length) {
    const parts = [
      code.unsourcedClaims.length ? `claims without a valid source: ${code.unsourcedClaims.join(", ")}` : null,
      code.unknownSources.length ? `unknown source IDs cited in ${[...new Set(code.unknownSources.map((u) => u.claim))].join(", ")}` : null,
    ].filter(Boolean);
    out.source_trail = { result: "fail", note: `Code check: ${parts.join("; ")}. ${model.source_trail.note ?? ""}`.trim() };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function nextVersion(companyId: string): Promise<number> {
  const [row] = await db
    .select({ v: max(schema.deliverables.version) })
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.companyId, companyId), eq(schema.deliverables.type, "benchmark")));
  return (row?.v ?? 0) + 1;
}

export async function activeBenchmark(companyId: string): Promise<Deliverable | null> {
  const rows = await db
    .select()
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.companyId, companyId), eq(schema.deliverables.type, "benchmark"), inArray(schema.deliverables.status, ACTIVE)))
    .orderBy(desc(schema.deliverables.version));
  return rows.find((d) => !isStalled(d)) ?? null;
}

/** Creates a new draft version; returns null when one is already in progress. Stalled runs are marked failed. */
export async function createBenchmarkVersion(company: Company): Promise<Deliverable | null> {
  const rows = await db
    .select()
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.companyId, company.id), eq(schema.deliverables.type, "benchmark"), inArray(schema.deliverables.status, ACTIVE)));
  for (const d of rows) if (isStalled(d)) await db.update(schema.deliverables).set({ status: "failed" }).where(eq(schema.deliverables.id, d.id));
  if (rows.some((d) => !isStalled(d))) return null;
  const [created] = await db
    .insert(schema.deliverables)
    .values({ companyId: company.id, type: "benchmark", version: await nextVersion(company.id), status: "drafting" })
    .onConflictDoNothing()
    .returning();
  return created ?? null;
}

export type PipelineDeps = { draft?: typeof draftBenchmark; qa?: typeof qaBenchmark };

async function logRun(values: typeof schema.agentRuns.$inferInsert) {
  const [run] = await db.insert(schema.agentRuns).values(values).returning({ id: schema.agentRuns.id });
  return run!.id;
}

async function failRun(runId: string, deliverableId: string, err: unknown, started: number) {
  const known = err instanceof PipelineError || err instanceof DraftError || err instanceof QaError;
  console.error(`[deliverables] ${deliverableId} failed`, err);
  await db
    .update(schema.agentRuns)
    .set({ status: "failed", error: known ? (err as Error).message : "Unexpected error. Try again.", durationMs: Date.now() - started })
    .where(eq(schema.agentRuns.id, runId));
  await db.update(schema.deliverables).set({ status: "failed" }).where(eq(schema.deliverables.id, deliverableId));
}

/** Draft → code checks + QA → in_review. Runs after the response; every step is logged in agent_runs. */
export async function runBenchmarkPipeline(deliverableId: string, advisorFeedback: string | null = null, deps: PipelineDeps = {}): Promise<void> {
  const [d] = await db.select().from(schema.deliverables).where(eq(schema.deliverables.id, deliverableId)).limit(1);
  if (!d || d.status !== "drafting") return;
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, d.companyId)).limit(1);
  if (!company) return;

  const started = Date.now();
  const draftRun = await logRun({ deliverableId, agent: "draft", model: AI_MODEL, status: "running" });
  let inputs: BenchmarkInputs;
  let draft: DraftOutput;
  try {
    inputs = await assembleBenchmarkInputs(company, advisorFeedback);
    const inputHash = createHash("sha256").update(JSON.stringify(inputs.input)).digest("hex");
    const result = await (deps.draft ?? draftBenchmark)(inputs.input);
    draft = result.output;
    const content = contentFromDraft(inputs, draft);
    await saveClaims(deliverableId, claimsFromDraft(inputs, draft), inputs.dataPointIds, inputs.benchmarkIds, inputs.methodology);
    await db
      .update(schema.agentRuns)
      .set({ status: "succeeded", model: result.model, inputHash, output: { input: inputs.input, draft }, tokensIn: result.tokensIn, tokensOut: result.tokensOut, durationMs: Date.now() - started })
      .where(eq(schema.agentRuns.id, draftRun));
    await db.update(schema.deliverables).set({ status: "qa", content, headline: draft.headline, createdByRun: draftRun }).where(eq(schema.deliverables.id, deliverableId));
  } catch (err) {
    return failRun(draftRun, deliverableId, err, started);
  }

  await runQa(deliverableId, inputs.input, draft, inputs.allowed, new Set([...inputs.dataPointIds, ...inputs.benchmarkIds]), claimsFromDraft(inputs, draft), deps);
}

async function runQa(
  deliverableId: string,
  input: DraftInput,
  draft: DraftOutput,
  allowed: number[],
  validIds: Set<string>,
  claims: ClaimForCheck[],
  deps: PipelineDeps,
) {
  const started = Date.now();
  const qaRun = await logRun({ deliverableId, agent: "qa", model: AI_MODEL, status: "running" });
  try {
    const result = await (deps.qa ?? qaBenchmark)(input, draft);
    // Row claims are generated in code from the inputs; check what the model wrote.
    const code = checkDraft(claims.filter((c) => !c.key.startsWith("row.")), allowed, validIds);
    const qaResults = combineQa(result.results, code);
    await db
      .update(schema.agentRuns)
      .set({ status: "succeeded", model: result.model, output: { model: result.results, code }, tokensIn: result.tokensIn, tokensOut: result.tokensOut, durationMs: Date.now() - started })
      .where(eq(schema.agentRuns.id, qaRun));
    const [d] = await db.select({ version: schema.deliverables.version }).from(schema.deliverables).where(eq(schema.deliverables.id, deliverableId));
    await db.insert(schema.reviews).values({ deliverableId, version: d!.version, qaResults });
    await db.update(schema.deliverables).set({ status: "in_review" }).where(eq(schema.deliverables.id, deliverableId));
  } catch (err) {
    return failRun(qaRun, deliverableId, err, started);
  }
}

/** Re-runs QA for a version (used after an advisor edits the text). */
export async function runQaForVersion(deliverableId: string, deps: PipelineDeps = {}): Promise<void> {
  const [d] = await db.select().from(schema.deliverables).where(eq(schema.deliverables.id, deliverableId)).limit(1);
  if (!d || d.status !== "qa" || !d.createdByRun) return;
  const [run] = await db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, d.createdByRun)).limit(1);
  const saved = run?.output as { input: DraftInput; draft: DraftOutput } | null;
  const content = benchmarkContentSchema.safeParse(d.content);
  if (!saved?.input || !content.success) {
    await db.update(schema.deliverables).set({ status: "failed" }).where(eq(schema.deliverables.id, d.id));
    return;
  }
  const claimRows = await db
    .select({ claim: schema.claims, source: schema.claimSources })
    .from(schema.claims)
    .leftJoin(schema.claimSources, eq(schema.claimSources.claimId, schema.claims.id))
    .where(eq(schema.claims.deliverableId, d.id));
  const sources: Record<string, string[]> = {};
  const texts: Record<string, string> = {};
  for (const { claim, source } of claimRows) {
    texts[claim.claimKey] = claim.text;
    (sources[claim.claimKey] ??= []);
    if (source?.refId) sources[claim.claimKey]!.push(source.refId);
  }
  const draft = draftFromContent(content.data, d.headline ?? "", sources, saved.draft.missing_inputs);
  const ids = new Set<string>([
    ...saved.input.comparison.flatMap((c) => [c.data_point_id, c.benchmark_row_id]),
    ...saved.input.other_company_data.map((o) => o.data_point_id),
  ]);
  // Numbers allowed are rebuilt from the saved data points and benchmark rows.
  const idList = [...ids];
  const [dps, bms] = idList.length
    ? await Promise.all([
        db.select().from(schema.dataPoints).where(and(eq(schema.dataPoints.companyId, d.companyId), inArray(schema.dataPoints.id, idList))),
        db.select().from(schema.benchmarkMetrics).where(inArray(schema.benchmarkMetrics.id, idList)),
      ])
    : [[], []];
  const dpById = new Map(dps.map((p) => [p.id, p.value]));
  const bmById = new Map(bms.map((b) => [b.id, b]));
  const allowed = allowedNumbers(
    saved.input.comparison.flatMap((c) => {
      const company = dpById.get(c.data_point_id);
      const bm = bmById.get(c.benchmark_row_id);
      return company !== undefined && bm ? [{ company, median: bm.median, topQuartile: bm.p75, p25: bm.p25 }] : [];
    }),
    [...saved.input.other_company_data.flatMap((o) => (dpById.has(o.data_point_id) ? [dpById.get(o.data_point_id)!] : [])), ...(saved.input.cohort.company_count ? [saved.input.cohort.company_count] : [])],
  );
  const claims = Object.entries(texts).map(([key, text]) => ({ key, text, sources: sources[key] ?? [] }));
  await runQa(d.id, saved.input, draft, allowed, ids, claims, deps);
}

// ---------------------------------------------------------------------------
// Advisor decisions
// ---------------------------------------------------------------------------

export type DecisionResult = { ok: true; newId?: string } | { ok: false; error: string };

async function recordDecision(d: Deliverable, actor: User, decision: "approve" | "request_changes" | "send_back", comment: string | null) {
  const [existing] = await db
    .select({ id: schema.reviews.id })
    .from(schema.reviews)
    .where(and(eq(schema.reviews.deliverableId, d.id), eq(schema.reviews.version, d.version)))
    .orderBy(desc(schema.reviews.createdAt))
    .limit(1);
  if (existing) await db.update(schema.reviews).set({ decision, comment, reviewerId: actor.id }).where(eq(schema.reviews.id, existing.id));
  else await db.insert(schema.reviews).values({ deliverableId: d.id, version: d.version, decision, comment, reviewerId: actor.id });
  await track("review_decision", { userId: actor.id, companyId: d.companyId, props: { deliverableId: d.id, version: d.version, decision } });
}

async function loadFor(company: Company, deliverableId: string) {
  const [d] = await db
    .select()
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.id, deliverableId), eq(schema.deliverables.companyId, company.id)))
    .limit(1);
  return d ?? null;
}

export async function approveDeliverable(actor: User, company: Company, deliverableId: string, comment: string | null): Promise<DecisionResult> {
  const d = await loadFor(company, deliverableId);
  if (!d || d.status !== "in_review") return { ok: false, error: "Only drafts in review can be approved." };
  await recordDecision(d, actor, "approve", comment);
  await db.update(schema.deliverables).set({ status: "approved" }).where(eq(schema.deliverables.id, d.id));
  return { ok: true };
}

/** Makes an approved version visible to the founder. */
export async function publishDeliverable(actor: User, company: Company, deliverableId: string): Promise<DecisionResult> {
  const d = await loadFor(company, deliverableId);
  if (!d || d.status !== "approved") return { ok: false, error: "Approve the draft before publishing it." };
  await db.update(schema.deliverables).set({ status: "published" }).where(eq(schema.deliverables.id, d.id));
  if (company.phase === "benchmark") await db.update(schema.companies).set({ phase: "baseline" }).where(eq(schema.companies.id, company.id));
  await track("deliverable_published", { userId: actor.id, companyId: company.id, props: { deliverableId: d.id, type: d.type, version: d.version } });
  return { ok: true };
}

/** Send back to AI: a new draft run with the advisor's comment as feedback. */
export async function sendBackDeliverable(actor: User, company: Company, deliverableId: string, comment: string): Promise<DecisionResult> {
  const d = await loadFor(company, deliverableId);
  if (!d || (d.status !== "in_review" && d.status !== "approved")) return { ok: false, error: "Only drafts in review can be sent back." };
  if (!comment.trim()) return { ok: false, error: "Tell the AI what to change." };
  await recordDecision(d, actor, "send_back", comment.trim());
  await db.update(schema.deliverables).set({ status: "changes_requested" }).where(eq(schema.deliverables.id, d.id));
  const next = await createBenchmarkVersion(company);
  return next ? { ok: true, newId: next.id } : { ok: false, error: "Another version is already in progress." };
}

export type TextEdits = {
  headline: string;
  insightHeadline: string;
  insightBody: string;
  strengths: string[];
  watchAreas: string[];
  priority: string;
};

/** Request changes: the advisor edits the text directly; this becomes a new version that goes through QA again. */
export async function editDeliverable(actor: User, company: Company, deliverableId: string, edits: TextEdits, comment: string | null): Promise<DecisionResult> {
  const d = await loadFor(company, deliverableId);
  if (!d || (d.status !== "in_review" && d.status !== "approved")) return { ok: false, error: "Only drafts in review can be edited." };
  const content = benchmarkContentSchema.safeParse(d.content);
  if (!content.success) return { ok: false, error: "This draft can't be edited." };
  const c = content.data;
  const clean = (s: string) => s.trim().slice(0, 2000);
  if (edits.strengths.length !== c.summary.strengths.length || edits.watchAreas.length !== c.summary.watchAreas.length) return { ok: false, error: "Edit the existing items." };
  if ([edits.headline, edits.insightHeadline, edits.insightBody, edits.priority, ...edits.strengths, ...edits.watchAreas].some((s) => !s.trim())) {
    return { ok: false, error: "Fields can't be empty." };
  }

  const nextContent: BenchmarkContent = {
    ...c,
    insight: { ...c.insight, headline: clean(edits.insightHeadline), body: clean(edits.insightBody) },
    summary: {
      strengths: c.summary.strengths.map((s, i) => ({ ...s, text: clean(edits.strengths[i]!) })),
      watchAreas: c.summary.watchAreas.map((s, i) => ({ ...s, text: clean(edits.watchAreas[i]!) })),
      priority: { ...c.summary.priority, text: clean(edits.priority) },
    },
  };
  const textFor: Record<string, string> = {
    insight: `${nextContent.insight.headline} ${nextContent.insight.body}`,
    priority: nextContent.summary.priority.text,
    ...Object.fromEntries(nextContent.summary.strengths.map((s) => [s.claimKey, s.text])),
    ...Object.fromEntries(nextContent.summary.watchAreas.map((s) => [s.claimKey, s.text])),
  };

  await recordDecision(d, actor, "request_changes", comment);
  await db.update(schema.deliverables).set({ status: "changes_requested" }).where(eq(schema.deliverables.id, d.id));
  const [created] = await db
    .insert(schema.deliverables)
    .values({ companyId: company.id, type: d.type, version: await nextVersion(company.id), status: "qa", content: nextContent, headline: clean(edits.headline), createdByRun: d.createdByRun })
    .returning();
  if (!created) return { ok: false, error: "Couldn't create the new version." };

  const old = await db
    .select({ claim: schema.claims, source: schema.claimSources })
    .from(schema.claims)
    .leftJoin(schema.claimSources, eq(schema.claimSources.claimId, schema.claims.id))
    .where(eq(schema.claims.deliverableId, d.id));
  const byKey = new Map<string, { claim: (typeof old)[number]["claim"]; sources: NonNullable<(typeof old)[number]["source"]>[] }>();
  for (const { claim, source } of old) {
    const e = byKey.get(claim.claimKey) ?? { claim, sources: [] };
    if (source) e.sources.push(source);
    byKey.set(claim.claimKey, e);
  }
  for (const { claim, sources } of byKey.values()) {
    const [row] = await db
      .insert(schema.claims)
      .values({ deliverableId: created.id, claimKey: claim.claimKey, text: textFor[claim.claimKey] ?? claim.text, confidence: claim.confidence })
      .returning({ id: schema.claims.id });
    if (sources.length) await db.insert(schema.claimSources).values(sources.map((s) => ({ claimId: row!.id, kind: s.kind, refId: s.refId, note: s.note })));
  }
  return { ok: true, newId: created.id };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type QueueItem = {
  id: string;
  companyId: string;
  companyName: string;
  version: number;
  status: Status | "stalled";
  updatedAt: string;
};

/** Benchmark versions for the given companies, newest first (callers pass managed companies only). */
export async function listQueue(companyIds: string[]): Promise<QueueItem[]> {
  if (!companyIds.length) return [];
  const rows = await db
    .select({ d: schema.deliverables, name: schema.companies.name })
    .from(schema.deliverables)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.deliverables.companyId))
    .where(and(inArray(schema.deliverables.companyId, companyIds), eq(schema.deliverables.type, "benchmark")))
    .orderBy(desc(schema.deliverables.updatedAt));
  return rows.map(({ d, name }) => ({
    id: d.id,
    companyId: d.companyId,
    companyName: name,
    version: d.version,
    status: isStalled(d) ? "stalled" : d.status,
    updatedAt: d.updatedAt.toISOString(),
  }));
}

export async function getDeliverable(deliverableId: string): Promise<Deliverable | null> {
  const [d] = await db.select().from(schema.deliverables).where(eq(schema.deliverables.id, deliverableId)).limit(1);
  return d ?? null;
}

export async function deliverableRuns(deliverableId: string) {
  return db.select().from(schema.agentRuns).where(eq(schema.agentRuns.deliverableId, deliverableId)).orderBy(desc(schema.agentRuns.createdAt));
}

export async function deliverableReviews(deliverableId: string) {
  return db
    .select({ review: schema.reviews, reviewer: schema.users.name, email: schema.users.email })
    .from(schema.reviews)
    .leftJoin(schema.users, eq(schema.users.id, schema.reviews.reviewerId))
    .where(eq(schema.reviews.deliverableId, deliverableId))
    .orderBy(desc(schema.reviews.createdAt));
}

/** What the founder may know about the benchmark's progress: status only, never draft content. */
export async function founderBenchmarkStatus(
  companyId: string,
): Promise<{ status: Status | "stalled" | "none"; updatedAt: string | null; hasPublished: boolean }> {
  const rows = await db
    .select({ status: schema.deliverables.status, updatedAt: schema.deliverables.updatedAt })
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.companyId, companyId), eq(schema.deliverables.type, "benchmark")))
    .orderBy(desc(schema.deliverables.version));
  const latest = rows[0];
  const hasPublished = rows.some((r) => r.status === "published");
  if (!latest) return { status: "none", updatedAt: null, hasPublished };
  return { status: isStalled(latest) ? "stalled" : latest.status, updatedAt: latest.updatedAt.toISOString(), hasPublished };
}
