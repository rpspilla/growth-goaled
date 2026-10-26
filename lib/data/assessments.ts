import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, max, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, QaResults, User } from "@/lib/db/schema";
import { AI_MODEL, aiProblemForStaff, isAiConfigError } from "@/lib/ai/config";
import { AssessmentDraftError, AssessmentQaError, ASSESSMENT_BRIEFS, draftAssessment, qaAssessment, type AssessmentInput, type AssessmentOutput } from "@/lib/ai/assessment";
import { matchCohort } from "@/lib/cohort-match";
import { assessmentContentSchema, type AssessmentContent } from "@/lib/deliverables/assessment";
import { allowedNumbers, checkDraft, numbersIn, type ClaimForCheck } from "@/lib/deliverables/checks";
import { track } from "@/lib/events";
import { getItem } from "@/lib/readiness";
import { formatMetric, isMetricKey, METRICS, type MetricKey } from "@/lib/metrics";
import { getUseCase, objectiveFields, type UseCaseDef, type UseCaseId } from "@/lib/use-cases";
import { resultConfidence, type Confidence } from "@/lib/use-cases/results";
import { combineQa, isStalled } from "./deliverables";
import { getIntakeAnswers } from "./intake";
import { getReadiness } from "./readiness";
import { getCompanyUseCase, setUseCaseStatus } from "./use-cases";

/**
 * The assessment engine (HANDOFF §13.9): one pipeline for every use case. Inputs are
 * assembled in code from the founder's answers, figures, supplied data and any approved
 * reference rows; the Draft Agent writes the assessment, then the QA Agent and code checks
 * verify it. Founders see a version once its code checks pass; advisors can review it.
 */

type Deliverable = typeof schema.deliverables.$inferSelect;
const TYPE = "baseline" as const;
const HORIZON_DAYS = [30, 60, 90];

export class AssessmentError extends Error {}

export type AssessmentInputs = {
  input: AssessmentInput;
  figures: { metric: MetricKey; dataPointId: string; value: number }[];
  reference: AssessmentContent["reference"];
  methodology: string;
  validIds: Set<string>;
  dataPointIds: Set<string>;
  benchmarkIds: Set<string>;
  answerNotes: Map<string, string>;
  itemNotes: Map<string, string>;
  allowed: number[];
};

/** Everything the Draft Agent sees, built in code. Unconfirmed file figures are included and flagged. */
export async function assembleAssessmentInputs(company: Company, useCase: UseCaseDef): Promise<AssessmentInputs> {
  const [row, intake, readiness, points, openQuestions] = await Promise.all([
    getCompanyUseCase(company.id, useCase.id),
    getIntakeAnswers(company),
    getReadiness(company),
    db
      .select()
      .from(schema.dataPoints)
      .where(
        and(
          eq(schema.dataPoints.companyId, company.id),
          or(eq(schema.dataPoints.status, "accepted"), and(eq(schema.dataPoints.status, "proposed"), isNotNull(schema.dataPoints.documentId))),
        ),
      )
      .orderBy(desc(schema.dataPoints.updatedAt)),
    db
      .select({ type: schema.registerItems.type, title: schema.registerItems.title })
      .from(schema.registerItems)
      .where(and(eq(schema.registerItems.companyId, company.id), eq(schema.registerItems.status, "open"))),
  ]);

  // Latest figure per metric, confirmed figures first.
  points.sort((a, b) => Number(b.status === "accepted") - Number(a.status === "accepted"));
  const latest = new Map<MetricKey, (typeof points)[number]>();
  for (const p of points) if (isMetricKey(p.metric) && !latest.has(p.metric)) latest.set(p.metric, p);
  const wanted = new Set<MetricKey>([...useCase.figures, "arr", "arr_growth", "customers"]);
  const figures = [...latest.entries()].filter(([m]) => wanted.has(m)).map(([metric, p]) => ({ metric, dataPointId: p.id, value: p.value, point: p }));

  // Founder answers: the questionnaire for this use case.
  const objective = row?.objective ?? {};
  const answers = objectiveFields(useCase)
    .filter((f) => objective[f.id]?.trim())
    .map((f) => ({ id: `answer:${f.id}`, question: f.label, answer: f.options?.find((o) => o.value === objective[f.id])?.label ?? objective[f.id]! }));
  if (!answers.length) throw new AssessmentError("Answer the questionnaire for this assessment first.");
  const target =
    objective.main_metric && isMetricKey(objective.main_metric) && objective.target_value && Number.isFinite(Number(objective.target_value))
      ? { metric: METRICS[objective.main_metric].label, value: formatMetric(objective.main_metric, Number(objective.target_value)), by: objective.target_date ?? null }
      : null;

  // What they supplied for this question, in priority order.
  const rows = new Map(readiness.items.map((i) => [i.itemKey, i]));
  const supplied = (
    [
      ...useCase.requiredItems.map((k) => [k, "required"] as const),
      ...useCase.helpfulItems.map((k) => [k, "helpful"] as const),
      ...useCase.optionalItems.map((k) => [k, "optional"] as const),
    ] as const
  ).map(([key, priority]) => {
    const r = rows.get(key);
    const files = readiness.files.filter((f) => f.itemKeys.includes(key));
    return {
      id: `item:${key}`,
      item: getItem(key)?.name ?? key,
      priority,
      status: r?.status ?? "not_reviewed",
      coverage: r?.coverageStart && r?.coverageEnd ? `${r.coverageStart.slice(0, 7)} to ${r.coverageEnd.slice(0, 7)}` : null,
      files: files.length,
      columns: [...new Set(files.flatMap((f) => f.columns))].slice(0, 25),
    };
  });

  // Approved reference rows from the best-matching cohort, if any. None is a valid outcome.
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
    if (!entry.rows.has(r.metric.metric)) entry.rows.set(r.metric.metric, r);
    byCohort.set(r.cohort.id, entry);
  }
  const match = figures.length
    ? matchCohort(
        { stage: company.stage, arr: latest.get("arr")?.value ?? company.arr ?? null, revenueBand: company.revenueBand, salesModel: company.salesModel, industry: company.industry, primarySegment: company.primarySegment },
        [...byCohort.values()].map((c) => ({ id: c.cohort.id, name: c.cohort.name, criteria: c.cohort.criteria, approvedMetrics: [...c.rows.keys()] })),
        figures.map((f) => f.metric),
      )
    : null;
  const chosen = match ? byCohort.get(match.cohortId) : undefined;
  const refRows = chosen
    ? match!.overlap.filter(isMetricKey).flatMap((metric) => {
        const r = chosen.rows.get(metric);
        return r && r.metric.p75 != null ? [{ metric, row: r }] : [];
      })
    : [];
  const reference: AssessmentContent["reference"] = chosen && refRows.length
    ? { cohortId: chosen.cohort.id, name: chosen.cohort.name, companyCount: chosen.cohort.companyCount, rows: refRows.map((r) => ({ metric: r.metric, benchmarkMetricId: r.row.metric.id })) }
    : null;
  const referenceNote = reference
    ? `Peer reference: ${reference.name}${reference.companyCount ? ` (${reference.companyCount} companies)` : ""}, approved and cited.`
    : "No approved peer reference data matches this company yet, so this assessment uses the company's own figures, answers and target.";

  const fmt = (m: MetricKey, v: number) => formatMetric(m, v);
  const input: AssessmentInput = {
    use_case: { id: useCase.id, question: useCase.question, founder_gets: useCase.youGet, brief: ASSESSMENT_BRIEFS[useCase.id] },
    company: {
      name: company.name,
      stage: (intake["company.stage"] as string | undefined) ?? company.stage,
      industry: (intake["company.industry"] as string | undefined) ?? company.industry,
      primary_segment: (intake["customers.segment"] as string | undefined) ?? company.primarySegment,
      sales_model: (intake["gtm.model"] as string | undefined) ?? company.salesModel,
      revenue_band: company.revenueBand,
    },
    founder_answers: answers,
    founder_target: target,
    figures: figures.map((f) => ({
      id: f.dataPointId,
      metric: f.metric,
      label: METRICS[f.metric].label,
      value: fmt(f.metric, f.value),
      lower_is_better: METRICS[f.metric].lowerIsBetter,
      confirmed: f.point.status === "accepted",
      period: f.point.period,
    })),
    data_supplied: supplied,
    reference: refRows.map(({ metric, row: r }) => ({
      id: r.metric.id,
      metric,
      label: METRICS[metric].label,
      median: r.metric.median != null ? fmt(metric, r.metric.median) : null,
      top_quartile: fmt(metric, r.metric.p75!),
      source: r.source ? [r.source.name, r.source.year].filter(Boolean).join(", ") : null,
    })),
    reference_note: referenceNote,
    open_questions: openQuestions,
  };

  const byMetric = new Map(figures.map((f) => [f.metric, f.value]));
  const comparison = refRows.map(({ metric, row: r }) => ({ company: byMetric.get(metric)!, median: r.metric.median, topQuartile: r.metric.p75, p25: r.metric.p25 }));
  const answerNumbers = answers.flatMap((a) => numbersIn(a.answer).map((n) => n.value));
  const targetNumber = objective.target_value && Number.isFinite(Number(objective.target_value)) ? [Number(objective.target_value)] : [];
  const allowed = allowedNumbers(comparison, [
    ...figures.map((f) => f.value),
    ...answerNumbers,
    ...targetNumber,
    ...HORIZON_DAYS,
    ...(reference?.companyCount ? [reference.companyCount] : []),
  ]);

  const dataPointIds = new Set(figures.map((f) => f.dataPointId));
  const benchmarkIds = new Set(refRows.map((r) => r.row.metric.id));
  const answerNotes = new Map(answers.map((a) => [a.id, `Your answer to “${a.question}”: ${a.answer}`]));
  const itemNotes = new Map(supplied.map((s) => [s.id, `${s.item}: ${s.status.replace("_", " ")}${s.files ? `, ${s.files} ${s.files === 1 ? "file" : "files"}` : ""}${s.coverage ? `, ${s.coverage}` : ""}`]));
  return {
    input,
    figures: figures.map(({ metric, dataPointId, value }) => ({ metric, dataPointId, value })),
    reference,
    methodology: `${referenceNote} Figures come from your company profile and files (unconfirmed file figures are marked). Every statement was checked in code against these inputs.`,
    validIds: new Set([...dataPointIds, ...benchmarkIds, ...answerNotes.keys(), ...itemNotes.keys()]),
    dataPointIds,
    benchmarkIds,
    answerNotes,
    itemNotes,
    allowed,
  };
}

/** Claims the model wrote, keyed as stored in the content. */
export function claimsFromAssessment(out: AssessmentOutput): ClaimForCheck[] {
  return [
    { key: "summary", text: `${out.summary.headline} ${out.summary.body}`, sources: out.summary.sources },
    ...out.findings.map((f, i) => ({ key: `finding.${i}`, text: f.text, sources: f.sources })),
    { key: "diagnosis", text: out.diagnosis.text, sources: out.diagnosis.sources },
    { key: "decision", text: out.decision.text, sources: out.decision.sources },
    ...out.actions.map((a, i) => ({ key: `action.${i}`, text: `${a.action} ${a.why}`, sources: a.sources })),
  ];
}

export function contentFromAssessment(useCase: UseCaseId, inputs: Pick<AssessmentInputs, "figures" | "reference" | "methodology">, out: AssessmentOutput): AssessmentContent {
  return {
    useCase,
    figures: inputs.figures.map(({ metric, dataPointId }) => ({ metric, dataPointId })),
    reference: inputs.reference,
    summary: { headline: out.summary.headline, body: out.summary.body, claimKey: "summary" },
    findings: [...out.findings].sort((a, b) => Number(a.kind === "strength") - Number(b.kind === "strength")).map((f) => ({ kind: f.kind, text: f.text, claimKey: `finding.${out.findings.indexOf(f)}` })),
    diagnosis: { text: out.diagnosis.text, claimKey: "diagnosis" },
    decision: { text: out.decision.text, claimKey: "decision" },
    actions: out.actions.map((a, i) => ({ action: a.action, why: a.why, horizon: a.horizon, kpi: a.kpi, claimKey: `action.${i}` })),
    assumptions: out.assumptions,
    dataGaps: out.data_gaps,
    nextSteps: out.next_steps,
    methodology: inputs.methodology,
  };
}

async function saveClaims(deliverableId: string, claims: ClaimForCheck[], inputs: AssessmentInputs) {
  for (const c of claims) {
    const [row] = await db.insert(schema.claims).values({ deliverableId, claimKey: c.key, text: c.text, confidence: "high" }).returning({ id: schema.claims.id });
    const sources: (typeof schema.claimSources.$inferInsert)[] = [];
    for (const id of new Set(c.sources)) {
      if (inputs.dataPointIds.has(id)) sources.push({ claimId: row!.id, kind: "data_point", refId: id });
      else if (inputs.benchmarkIds.has(id)) sources.push({ claimId: row!.id, kind: "benchmark_metric", refId: id });
      else if (inputs.answerNotes.has(id)) sources.push({ claimId: row!.id, kind: "founder_answer", note: inputs.answerNotes.get(id)! });
      else if (inputs.itemNotes.has(id)) sources.push({ claimId: row!.id, kind: "document", note: inputs.itemNotes.get(id)! });
    }
    sources.push({ claimId: row!.id, kind: "methodology", note: inputs.methodology });
    await db.insert(schema.claimSources).values(sources);
  }
}

async function nextVersion(companyId: string): Promise<number> {
  const [row] = await db.select({ v: max(schema.deliverables.version) }).from(schema.deliverables).where(and(eq(schema.deliverables.companyId, companyId), eq(schema.deliverables.type, TYPE)));
  return (row?.v ?? 0) + 1;
}

/** Latest assessment version for a company and use case (any status). */
export async function latestAssessment(companyId: string, useCase: UseCaseId): Promise<Deliverable | null> {
  const [d] = await db
    .select()
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.companyId, companyId), eq(schema.deliverables.type, TYPE), eq(schema.deliverables.useCase, useCase)))
    .orderBy(desc(schema.deliverables.version))
    .limit(1);
  return d ?? null;
}

/** Starts a new version unless one is already being drafted. Requires the assessment to be purchased or granted. */
export async function createAssessmentVersion(company: Company, useCase: UseCaseId): Promise<Deliverable | null> {
  const owned = await getCompanyUseCase(company.id, useCase);
  if (!owned?.activatedAt) throw new AssessmentError("This assessment hasn't been purchased.");
  const last = await latestAssessment(company.id, useCase);
  if (last && (last.status === "drafting" || last.status === "qa") && !isStalled(last)) return null;
  if (last && isStalled(last)) await db.update(schema.deliverables).set({ status: "failed" }).where(eq(schema.deliverables.id, last.id));
  const [created] = await db
    .insert(schema.deliverables)
    .values({ companyId: company.id, type: TYPE, useCase, version: await nextVersion(company.id), status: "drafting" })
    .onConflictDoNothing()
    .returning();
  if (created) await setUseCaseStatus(company.id, useCase, "baseline_in_review");
  return created ?? null;
}

export type AssessmentDeps = { draft?: typeof draftAssessment; qa?: typeof qaAssessment };

async function logRun(values: typeof schema.agentRuns.$inferInsert) {
  const [run] = await db.insert(schema.agentRuns).values(values).returning({ id: schema.agentRuns.id });
  return run!.id;
}

async function fail(runId: string, deliverableId: string, err: unknown, started: number) {
  const known = err instanceof AssessmentError || err instanceof AssessmentDraftError || err instanceof AssessmentQaError;
  console.error(`[assessment] ${deliverableId} failed`, err);
  await db
    .update(schema.agentRuns)
    .set({ status: "failed", error: known ? (err as Error).message : isAiConfigError(err) ? aiProblemForStaff(err) : "Unexpected error. Try again.", durationMs: Date.now() - started })
    .where(eq(schema.agentRuns.id, runId));
  await db.update(schema.deliverables).set({ status: "failed" }).where(and(eq(schema.deliverables.id, deliverableId), inArray(schema.deliverables.status, ["drafting", "qa"])));
}

/** Draft → claims → QA Agent + code checks. Founders see the result once the code checks pass. */
export async function runAssessmentPipeline(deliverableId: string, deps: AssessmentDeps = {}): Promise<void> {
  const [d] = await db.select().from(schema.deliverables).where(eq(schema.deliverables.id, deliverableId)).limit(1);
  if (!d || d.status !== "drafting" || d.type !== TYPE) return;
  const useCase = d.useCase ? getUseCase(d.useCase) : undefined;
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, d.companyId)).limit(1);
  if (!company || !useCase) return;

  let started = Date.now();
  const draftRun = await logRun({ deliverableId, agent: "draft", model: AI_MODEL, status: "running" });
  let inputs: AssessmentInputs;
  let out: AssessmentOutput;
  try {
    inputs = await assembleAssessmentInputs(company, useCase);
    const result = await (deps.draft ?? draftAssessment)(inputs.input);
    out = result.output;
    await saveClaims(deliverableId, claimsFromAssessment(out), inputs);
    await db
      .update(schema.agentRuns)
      .set({
        status: "succeeded",
        model: result.model,
        inputHash: createHash("sha256").update(JSON.stringify(inputs.input)).digest("hex"),
        output: { input: inputs.input, draft: out },
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        durationMs: Date.now() - started,
      })
      .where(eq(schema.agentRuns.id, draftRun));
    await db
      .update(schema.deliverables)
      .set({ status: "qa", content: contentFromAssessment(useCase.id, inputs, out), headline: out.summary.headline, createdByRun: draftRun })
      .where(and(eq(schema.deliverables.id, deliverableId), eq(schema.deliverables.status, "drafting")));
  } catch (err) {
    return fail(draftRun, deliverableId, err, started);
  }

  started = Date.now();
  const qaRun = await logRun({ deliverableId, agent: "qa", model: AI_MODEL, status: "running" });
  try {
    const result = await (deps.qa ?? qaAssessment)(inputs.input, out);
    const code = checkDraft(claimsFromAssessment(out), inputs.allowed, inputs.validIds);
    const qaResults: QaResults = combineQa(result.results, code);
    await db
      .update(schema.agentRuns)
      .set({ status: "succeeded", model: result.model, output: { model: result.results, code }, tokensIn: result.tokensIn, tokensOut: result.tokensOut, durationMs: Date.now() - started })
      .where(eq(schema.agentRuns.id, qaRun));
    await db.insert(schema.reviews).values({ deliverableId, version: d.version, qaResults });
    const codeChecksPassed = !code.untracedNumbers.length && !code.unsourcedClaims.length && !code.unknownSources.length;
    await db.update(schema.deliverables).set({ status: "in_review", codeChecksPassed }).where(and(eq(schema.deliverables.id, deliverableId), eq(schema.deliverables.status, "qa")));
    await track("deliverable_published", { companyId: company.id, props: { type: "assessment", use_case: useCase.id, automated: true, codeChecksPassed } });
  } catch (err) {
    return fail(qaRun, deliverableId, err, started);
  }
}

/** An advisor or admin marks a version reviewed (founders then see "Reviewed by …"). Access is checked by the caller. */
export async function approveAssessment(actor: User, deliverableId: string, comment: string | null): Promise<boolean> {
  const [d] = await db.select().from(schema.deliverables).where(eq(schema.deliverables.id, deliverableId)).limit(1);
  if (!d || d.type !== TYPE || d.status !== "in_review" || !d.codeChecksPassed) return false;
  await db.update(schema.deliverables).set({ status: "published" }).where(eq(schema.deliverables.id, d.id));
  await db.insert(schema.reviews).values({ deliverableId: d.id, version: d.version, reviewerId: actor.id, decision: "approve", comment: comment?.trim() || null });
  return true;
}

// ---------------------------------------------------------------------------
// What the founder sees
// ---------------------------------------------------------------------------

export type SourceView = { kind: string; title: string; detail: string | null };
export type ResultsClaim = { text: string; sources: SourceView[] };

export type ResultsView = {
  version: number;
  reviewed: { by: string | null; at: string; comment: string | null } | null;
  summary: { headline: string; body: string; claimKey: string };
  findings: { kind: "concern" | "strength"; text: string; claimKey: string }[];
  evidence: { label: string; value: string; unconfirmed: boolean; median: string | null; topQuartile: string | null }[];
  reference: { name: string; companyCount: number | null } | null;
  diagnosis: { text: string; claimKey: string };
  decision: { text: string; claimKey: string };
  actions: { action: string; why: string; horizon: "next_30_days" | "next_90_days" | "later"; kpi: string | null; claimKey: string }[];
  assumptions: string[];
  dataGaps: string[];
  nextSteps: string[];
  methodology: string;
  confidence: Confidence;
  claims: Record<string, ResultsClaim>;
};

/** Renders a version for display. Figures are read from their data points now, never copied. */
export async function assessmentView(d: Deliverable): Promise<ResultsView | null> {
  const parsed = assessmentContentSchema.safeParse(d.content);
  if (!parsed.success) return null;
  const c = parsed.data;
  const dpIds = c.figures.map((f) => f.dataPointId);
  const bmIds = c.reference?.rows.map((r) => r.benchmarkMetricId) ?? [];
  const [points, refs, claims, review] = await Promise.all([
    dpIds.length ? db.select().from(schema.dataPoints).where(and(eq(schema.dataPoints.companyId, d.companyId), inArray(schema.dataPoints.id, dpIds))) : [],
    bmIds.length ? db.select().from(schema.benchmarkMetrics).where(and(inArray(schema.benchmarkMetrics.id, bmIds), eq(schema.benchmarkMetrics.status, "approved"))) : [],
    db
      .select({ claim: schema.claims, source: schema.claimSources })
      .from(schema.claims)
      .leftJoin(schema.claimSources, eq(schema.claimSources.claimId, schema.claims.id))
      .where(eq(schema.claims.deliverableId, d.id)),
    db
      .select({ review: schema.reviews, reviewer: schema.users })
      .from(schema.reviews)
      .leftJoin(schema.users, eq(schema.users.id, schema.reviews.reviewerId))
      .where(and(eq(schema.reviews.deliverableId, d.id), eq(schema.reviews.decision, "approve")))
      .orderBy(desc(schema.reviews.createdAt))
      .limit(1)
      .then((r) => r[0]),
  ]);
  const dp = new Map(points.map((p) => [p.id, p]));
  const refByMetric = new Map((c.reference?.rows ?? []).map((r) => [r.metric, r.benchmarkMetricId]));

  const evidence = c.figures.flatMap((f) => {
    const p = dp.get(f.dataPointId);
    if (!p) return [];
    const r = refByMetric.has(f.metric) ? refs.find((x) => x.id === refByMetric.get(f.metric)) : undefined;
    return [
      {
        label: METRICS[f.metric].label,
        value: formatMetric(f.metric, p.value),
        unconfirmed: p.status !== "accepted",
        median: r?.median != null ? formatMetric(f.metric, r.median) : null,
        topQuartile: r?.p75 != null ? formatMetric(f.metric, r.p75) : null,
      },
    ];
  });

  const describe = (s: typeof schema.claimSources.$inferSelect): SourceView | null => {
    if (s.kind === "data_point") {
      const p = s.refId ? dp.get(s.refId) : undefined;
      if (!p || !isMetricKey(p.metric)) return null;
      return { kind: "data_point", title: `${METRICS[p.metric].label}: ${formatMetric(p.metric, p.value)}${p.period ? ` (${p.period})` : ""}`, detail: [p.rawText, p.status === "accepted" ? "confirmed" : "from your file, not yet confirmed"].filter(Boolean).join(" · ") };
    }
    if (s.kind === "benchmark_metric") {
      const r = refs.find((x) => x.id === s.refId);
      if (!r || !isMetricKey(r.metric)) return null;
      const f = (n: number | null) => (n == null ? "—" : formatMetric(r.metric as MetricKey, n));
      return { kind: "benchmark_metric", title: `Peer reference, ${METRICS[r.metric as MetricKey].label}: median ${f(r.median)}, top quartile ${f(r.p75)}`, detail: c.reference?.name ?? null };
    }
    if (s.kind === "founder_answer") return { kind: "founder_answer", title: s.note ?? "Your answer", detail: null };
    if (s.kind === "document") return { kind: "document", title: s.note ?? "Data you shared", detail: null };
    return { kind: "methodology", title: "How this was produced", detail: s.note };
  };
  const claimMap: Record<string, ResultsClaim> = {};
  for (const { claim, source } of claims) {
    const entry = (claimMap[claim.claimKey] ??= { text: claim.text, sources: [] });
    const v = source ? describe(source) : null;
    if (v) entry.sources.push(v);
  }

  const reviewed = d.status === "published" && review ? { by: review.reviewer?.name ?? review.reviewer?.email ?? null, at: review.review.createdAt.toISOString(), comment: review.review.comment } : null;
  return {
    version: d.version,
    reviewed,
    summary: c.summary,
    findings: c.findings,
    evidence,
    reference: c.reference && evidence.some((e) => e.topQuartile) ? { name: c.reference.name, companyCount: c.reference.companyCount } : null,
    diagnosis: c.diagnosis,
    decision: c.decision,
    actions: c.actions,
    assumptions: c.assumptions,
    dataGaps: c.dataGaps,
    nextSteps: c.nextSteps,
    methodology: c.methodology,
    confidence: resultConfidence({ reviewed: Boolean(reviewed), unconfirmed: evidence.filter((e) => e.unconfirmed).length, gaps: c.dataGaps.length, metrics: evidence.length }),
    claims: claimMap,
  };
}

export type FounderAssessment =
  | { state: "not_started" }
  | { state: "building" }
  | { state: "failed"; reason: string }
  | { state: "ready"; view: ResultsView; completedAt: Date };

/** What the founder's Results step shows for one purchased assessment. */
export async function founderAssessment(companyId: string, useCase: UseCaseId): Promise<FounderAssessment> {
  const rows = await db
    .select()
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.companyId, companyId), eq(schema.deliverables.type, TYPE), eq(schema.deliverables.useCase, useCase)))
    .orderBy(desc(schema.deliverables.version));
  const visible = rows.find((d) => d.codeChecksPassed === true && (d.status === "in_review" || d.status === "approved" || d.status === "published"));
  const latest = rows[0];
  // A newer version being built doesn't hide the one they already have.
  if (visible && (!latest || latest.id === visible.id || latest.status !== "drafting")) {
    const view = await assessmentView(visible);
    if (view) return { state: "ready", view, completedAt: visible.updatedAt };
  }
  if (!latest) return { state: "not_started" };
  if ((latest.status === "drafting" || latest.status === "qa") && !isStalled(latest)) {
    if (visible) {
      const view = await assessmentView(visible);
      if (view) return { state: "ready", view, completedAt: visible.updatedAt };
    }
    return { state: "building" };
  }
  if (latest.codeChecksPassed === false) return { state: "failed", reason: "We couldn't verify every figure in this version, so we didn't show it. Try again; if it happens twice, your advisor will take a look." };
  const [run] = await db
    .select({ error: schema.agentRuns.error })
    .from(schema.agentRuns)
    .where(and(eq(schema.agentRuns.deliverableId, latest.id), eq(schema.agentRuns.status, "failed")))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(1);
  return { state: "failed", reason: run?.error?.includes("questionnaire") ? run.error : "The analysis didn't finish this time. Try again in a moment." };
}

/** When each purchased assessment's results first became visible (for history). */
export async function assessmentCompletions(companyId: string): Promise<Partial<Record<string, Date>>> {
  const rows = await db
    .select({ useCase: schema.deliverables.useCase, at: schema.deliverables.updatedAt, passed: schema.deliverables.codeChecksPassed, status: schema.deliverables.status })
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.companyId, companyId), eq(schema.deliverables.type, TYPE)));
  const out: Partial<Record<string, Date>> = {};
  for (const r of rows) {
    if (!r.useCase || !r.passed || !["in_review", "approved", "published"].includes(r.status)) continue;
    if (!out[r.useCase] || r.at < out[r.useCase]!) out[r.useCase] = r.at;
  }
  return out;
}
