import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, lt, max, ne, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, QaResults, User } from "@/lib/db/schema";
import { AI_MODEL, aiProblemForStaff, isAiConfigError } from "@/lib/ai/config";
import { AssessmentDraftError, AssessmentQaError, ASSESSMENT_BRIEFS, draftAssessment, qaAssessment, type AssessmentInput, type AssessmentOutput } from "@/lib/ai/assessment";
import { matchCohort } from "@/lib/cohort-match";
import { parseBrief, type BriefContent } from "@/lib/deliverables/assessment";
import { allowedNumbers, checkDraft, numbersIn, type ClaimForCheck, type CodeCheckResult } from "@/lib/deliverables/checks";
export { claimsFromAssessment };
import { claimsFromAssessment, completeness, fallbackAssessment, sanitizeAssessment, systemGaps } from "@/lib/deliverables/assessment-safety";
import { diagnose, KEY_METRICS, type Figure } from "@/lib/diagnostics";
import { analysisTables, diagnosisInput } from "@/lib/diagnostics/evidence";
import { track } from "@/lib/events";
import { getItem } from "@/lib/readiness";
import { formatMetric, isMetricKey, METRICS, type MetricKey } from "@/lib/metrics";
import { assessmentMetrics, getUseCase, objectiveFields, type UseCaseDef, type UseCaseId } from "@/lib/use-cases";
import { resultConfidence, type Confidence } from "@/lib/use-cases/results";
import { combineQa, isStalled } from "./deliverables";
import { figureChoices } from "./figures";
import { getIntakeAnswers } from "./intake";
import { getReadiness } from "./readiness";
import { getCompanyUseCase, setUseCaseStatus } from "./use-cases";

/**
 * The assessment engine (HANDOFF §13.9): one pipeline for every use case, producing a Decision
 * Brief. Inputs are assembled in code: the founder's answers, figures (calculated, entered or
 * extracted, each with its method and period), tables computed from their files, approved
 * reference rows, and a rule-based diagnosis. The Draft Agent writes the brief; code checks
 * and the QA Agent verify it. Founders see a version once its code checks pass.
 */

type Deliverable = typeof schema.deliverables.$inferSelect;
const TYPE = "baseline" as const;
const HORIZON_DAYS = [30, 31, 60, 61, 90];

export class AssessmentError extends Error {}

export type AssessmentInputs = {
  input: AssessmentInput;
  figures: { metric: MetricKey; dataPointId: string; value: number }[];
  /** Snapshot of the figures the brief rests on, saved with it for later comparison. */
  baseline: BriefContent["baseline"];
  analyses: { title: string; rows: string[] }[];
  unknowns: string[];
  reference: BriefContent["reference"];
  methodology: string;
  validIds: Set<string>;
  dataPointIds: Set<string>;
  benchmarkIds: Set<string>;
  answerNotes: Map<string, string>;
  itemNotes: Map<string, string>;
  /** Code-side evidence ids (ev:, candidate:, analysis:) and what each says, for the Source Trail. */
  analysisNotes: Map<string, string>;
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
  const wanted = new Set<MetricKey>([...useCase.figures, ...KEY_METRICS[useCase.id], "arr", "arr_growth", "customers"]);
  const figures = [...latest.entries()].filter(([m]) => wanted.has(m)).map(([metric, p]) => ({ metric, dataPointId: p.id, value: p.value, point: p }));

  // Founder answers: the questionnaire for this use case.
  const objective = row?.objective ?? {};
  const answers = objectiveFields(useCase)
    .filter((f) => objective[f.id]?.trim())
    .map((f) => ({ id: `answer:${f.id}`, question: f.label, answer: f.options?.find((o) => o.value === objective[f.id])?.label ?? objective[f.id]! }));
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
  const reference: BriefContent["reference"] = chosen && refRows.length
    ? {
        cohortId: chosen.cohort.id,
        name: chosen.cohort.name,
        companyCount: chosen.cohort.companyCount,
        rows: refRows.map((r) => ({ metric: r.metric, benchmarkMetricId: r.row.metric.id })),
        matched: match!.matched,
        unmatched: match!.unmatched,
      }
    : null;
  const referenceNote = reference
    ? `Peer reference: ${reference.name}${reference.companyCount ? ` (${reference.companyCount} companies)` : ""}, approved and cited.${reference.unmatched.length ? ` An imperfect match: not matched on ${reference.unmatched.join("; ")}.` : ""}`
    : "No approved peer reference data matches this company yet, so this assessment uses the company's own figures, answers and target.";

  // Tables computed from their files, newest first, and the rule-based diagnosis over them.
  const files = await db
    .select({ filename: schema.documents.filename, analysis: schema.documents.analysis })
    .from(schema.documents)
    .where(and(eq(schema.documents.companyId, company.id), isNotNull(schema.documents.analysis), ne(schema.documents.status, "failed")))
    .orderBy(desc(schema.documents.updatedAt));
  const fileAnalyses = files.flatMap((f) => (f.analysis ? [{ filename: f.filename, analysis: f.analysis }] : []));
  const tables = analysisTables(fileAnalyses);
  const dxFigures: Figure[] = figures.map((f) => ({
    metric: f.metric,
    value: f.value,
    period: f.point.period,
    origin: f.point.origin,
    confirmed: f.point.status === "accepted",
    ...(f.point.calc?.sampleSize !== undefined ? { sampleSize: f.point.calc.sampleSize } : {}),
  }));
  const dx = diagnosisInput(diagnose(useCase.id, dxFigures, fileAnalyses.map((f) => f.analysis)));

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
      origin: f.point.origin,
      method: f.point.method,
      sample_size: f.point.calc?.sampleSize ?? null,
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
    diagnosis: dx,
    analyses: tables,
    open_questions: openQuestions,
    unreadable_files: readiness.files.filter((f) => f.status === "failed").map((f) => f.filename).slice(0, 10),
    conflicts: (await figureChoices(company, assessmentMetrics(useCase, objective)))
      .filter((c) => c.state === "conflict")
      .map((c) => ({ metric: c.metric, label: c.label, values: c.candidates.map((x) => `${x.formatted} in ${x.source === "Your company profile" ? "your company profile" : x.source}`).join(" vs ") })),
    completeness: "partial",
    trackable_metrics: [...wanted],
  };
  input.completeness = completeness(input);

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
    // Numbers in code-side evidence and tables are inputs too (they were computed, not written by the model).
    ...dx.evidence.flatMap((e) => numbersIn(e.text).map((n) => n.value)),
    ...dx.candidates.flatMap((c) => (c.arr_at_stake ? numbersIn(c.arr_at_stake).map((n) => n.value) : [])),
    ...tables.flatMap((t) => [t.title, ...t.rows]).flatMap((r) => numbersIn(r).map((n) => n.value)),
  ]);

  const dataPointIds = new Set(figures.map((f) => f.dataPointId));
  const benchmarkIds = new Set(refRows.map((r) => r.row.metric.id));
  const answerNotes = new Map(answers.map((a) => [a.id, `Your answer to “${a.question}”: ${a.answer}`]));
  const itemNotes = new Map(supplied.map((s) => [s.id, `${s.item}: ${s.status.replace("_", " ")}${s.files ? `, ${s.files} ${s.files === 1 ? "file" : "files"}` : ""}${s.coverage ? `, ${s.coverage}` : ""}`]));
  const analysisNotes = new Map<string, string>([
    ...dx.evidence.map((e) => [e.id, `${e.text} (${e.kind === "calculated" ? "calculated in code" : e.kind === "reported" ? "your figure" : "inference by rule"})`] as const),
    ...dx.candidates.map((c) => [`candidate:${c.id}`, `Diagnostic rule: ${c.title}. Test: ${c.test}`] as const),
    ...tables.map((t) => [t.id, `${t.title}: ${t.rows.join("; ")}`] as const),
  ]);
  return {
    input,
    figures: figures.map(({ metric, dataPointId, value }) => ({ metric, dataPointId, value })),
    baseline: figures.map(({ metric, point: p }) => ({
      metric,
      dataPointId: p.id,
      value: p.value,
      period: p.period,
      origin: p.origin,
      method: p.method,
      confirmed: p.status === "accepted",
      sampleSize: p.calc?.sampleSize ?? null,
      recordedAt: p.updatedAt.toISOString(),
    })),
    analyses: tables.map(({ title, rows }) => ({ title, rows })),
    unknowns: dx.unknowns,
    reference,
    methodology: `${referenceNote} Figures marked "calculated" were computed in code from your files; others come from your company profile or were read from your documents (unconfirmed ones are marked). The diagnosis is ranked by fixed rules over that evidence; the written brief was checked in code against every input.`,
    validIds: new Set([...dataPointIds, ...benchmarkIds, ...answerNotes.keys(), ...itemNotes.keys(), ...analysisNotes.keys()]),
    dataPointIds,
    benchmarkIds,
    answerNotes,
    itemNotes,
    analysisNotes,
    allowed,
  };
}

export function contentFromAssessment(
  useCase: UseCaseId,
  inputs: Pick<AssessmentInputs, "figures" | "reference" | "methodology" | "input" | "baseline" | "analyses" | "unknowns">,
  out: AssessmentOutput,
  degraded = false,
): BriefContent {
  const key = (k: string | null) => (k && isMetricKey(k) ? k : null);
  return {
    format: "brief",
    useCase,
    figures: inputs.figures.map(({ metric, dataPointId }) => ({ metric, dataPointId })),
    reference: inputs.reference,
    baseline: inputs.baseline,
    certainty: inputs.input.diagnosis?.certainty ?? null,
    executiveDecision: { decision: out.executive_decision.decision, conclusion: out.executive_decision.conclusion, claimKey: "decision" },
    diagnosis: {
      primary: { title: out.diagnosis.primary.title, explanation: out.diagnosis.primary.explanation, claimKey: "diagnosis" },
      alternatives: out.diagnosis.alternatives.map((a, i) => ({ title: a.title, assessment: a.assessment, claimKey: `diagnosis.alt.${i}` })),
      howToDistinguish: out.diagnosis.how_to_distinguish,
      unknowns: inputs.unknowns,
    },
    evidence: out.evidence.map((e, i) => ({ text: e.text, status: e.status, bearing: e.bearing, claimKey: `evidence.${i}` })),
    analyses: inputs.analyses,
    alternatives: out.alternatives.map((a, i) => ({ option: a.option, upside: a.upside, downside: a.downside, implications: a.implications, claimKey: `option.${i}` })),
    recommendation: { option: out.recommendation.option, why: out.recommendation.why, claimKey: "recommendation" },
    plan: out.action_plan
      .map((a, i) => ({
        priority: a.priority,
        action: a.action,
        rationale: a.rationale,
        timing: a.timing,
        role: a.role,
        successMetric: a.success_metric,
        metricKey: key(a.metric_key),
        expectedSignal: a.expected_signal,
        dependenciesRisks: a.dependencies_risks,
        claimKey: `action.${i}`,
      }))
      .sort((a, b) => a.priority - b.priority)
      .map((a, i) => ({ ...a, priority: i + 1 })),
    changeTriggers: out.change_triggers.map((t) => ({ ifThis: t.if_this, thenThis: t.then_this })),
    followUp: {
      metrics: out.follow_up.metrics.map((m) => ({ metricKey: key(m.metric_key), label: m.label, why: m.why })),
      revisitInDays: Math.min(Math.max(out.follow_up.revisit_in_days, 7), 180),
      revisitTrigger: out.follow_up.revisit_trigger,
    },
    assumptions: out.assumptions,
    dataGaps: out.data_gaps,
    methodology: inputs.methodology,
    systemGaps: systemGaps(inputs.input),
    completeness: inputs.input.completeness,
    degraded,
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
      else if (inputs.analysisNotes.has(id)) sources.push({ claimId: row!.id, kind: "analysis", note: inputs.analysisNotes.get(id)! });
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
  // A reassessment while tracking keeps Progress open.
  if (created && owned.status !== "tracking") await setUseCaseStatus(company.id, useCase, "baseline_in_review");
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

const codeCheck = (out: AssessmentOutput, inputs: AssessmentInputs) => checkDraft(claimsFromAssessment(out), inputs.allowed, inputs.validIds);
const passes = (c: CodeCheckResult) => !c.untracedNumbers.length && !c.unsourcedClaims.length && !c.unknownSources.length;
const describeFailures = (c: CodeCheckResult) =>
  [
    ...c.untracedNumbers.map((u) => `"${u.raw}" in ${u.claim} isn't in the input`),
    ...c.unsourcedClaims.map((k) => `${k} cites no valid id`),
    ...c.unknownSources.map((u) => `${u.claim} cites unknown id ${u.id}`),
  ].join("; ");

/**
 * Draft → code checks → (one revision) → sanitise → QA Agent. It never leaves the founder with
 * nothing: if the model fails, a plain report is built from the inputs; statements that still
 * fail the checks are dropped; a QA Agent failure is recorded but doesn't block the result.
 * Only an error assembling the inputs (e.g. the database) fails the run.
 */
export async function runAssessmentPipeline(deliverableId: string, deps: AssessmentDeps = {}): Promise<void> {
  const [d] = await db.select().from(schema.deliverables).where(eq(schema.deliverables.id, deliverableId)).limit(1);
  if (!d || d.status !== "drafting" || d.type !== TYPE) return;
  const useCase = d.useCase ? getUseCase(d.useCase) : undefined;
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, d.companyId)).limit(1);
  if (!company || !useCase) return;

  let started = Date.now();
  const draftRun = await logRun({ deliverableId, agent: "draft", model: AI_MODEL, status: "running" });
  let inputs: AssessmentInputs;
  try {
    inputs = await assembleAssessmentInputs(company, useCase);
  } catch (err) {
    return fail(draftRun, deliverableId, err, started);
  }

  const draft = deps.draft ?? draftAssessment;
  let out: AssessmentOutput;
  let degraded = false;
  let model = AI_MODEL;
  let tokensIn = 0;
  let tokensOut = 0;
  const notes: string[] = [];
  try {
    const first = await draft(inputs.input);
    tokensIn += first.tokensIn;
    tokensOut += first.tokensOut;
    model = first.model;
    out = first.output;
    const check = codeCheck(out, inputs);
    if (!passes(check)) {
      notes.push(`First draft failed the code checks: ${describeFailures(check)}`);
      const second = await draft({ ...inputs.input, revision_notes: describeFailures(check) });
      tokensIn += second.tokensIn;
      tokensOut += second.tokensOut;
      out = second.output;
    }
  } catch (err) {
    console.error(`[assessment] ${deliverableId} draft failed; building a plain report from the inputs`, err);
    notes.push(`Draft Agent failed (${err instanceof AssessmentDraftError ? err.message : isAiConfigError(err) ? aiProblemForStaff(err) : "unexpected error"}); plain report built from the inputs.`);
    out = fallbackAssessment(inputs.input);
    degraded = true;
  }

  const sanitized = sanitizeAssessment(out, codeCheck(out, inputs));
  if (sanitized.removed) notes.push(`${sanitized.removed} statement(s) removed for failing the code checks.`);
  out = sanitized.output;
  // Belt and braces: if anything still fails, fall back to the plain report, which passes by construction.
  if (!passes(codeCheck(out, inputs))) {
    notes.push("Sanitised draft still failed the code checks; plain report used.");
    out = fallbackAssessment(inputs.input);
    degraded = true;
  }

  await saveClaims(deliverableId, claimsFromAssessment(out), inputs);
  await db
    .update(schema.agentRuns)
    .set({
      status: "succeeded",
      model: degraded ? "fallback" : model,
      inputHash: createHash("sha256").update(JSON.stringify(inputs.input)).digest("hex"),
      output: { input: inputs.input, draft: out, notes },
      tokensIn,
      tokensOut,
      durationMs: Date.now() - started,
    })
    .where(eq(schema.agentRuns.id, draftRun));
  await db
    .update(schema.deliverables)
    .set({ status: "qa", content: contentFromAssessment(useCase.id, inputs, out, degraded), headline: out.executive_decision.decision, createdByRun: draftRun })
    .where(and(eq(schema.deliverables.id, deliverableId), eq(schema.deliverables.status, "drafting")));

  started = Date.now();
  const qaRun = await logRun({ deliverableId, agent: "qa", model: AI_MODEL, status: "running" });
  const code = codeCheck(out, inputs);
  let qaResults: QaResults;
  try {
    if (degraded) throw new AssessmentQaError("Skipped: plain report built from the inputs.");
    const result = await (deps.qa ?? qaAssessment)(inputs.input, out);
    qaResults = combineQa(result.results, code);
    await db
      .update(schema.agentRuns)
      .set({ status: "succeeded", model: result.model, output: { model: result.results, code, notes }, tokensIn: result.tokensIn, tokensOut: result.tokensOut, durationMs: Date.now() - started })
      .where(eq(schema.agentRuns.id, qaRun));
  } catch (err) {
    // The code checks still ran and passed; the founder isn't held up by the QA Agent.
    const why = err instanceof AssessmentQaError ? err.message : isAiConfigError(err) ? aiProblemForStaff(err) : "QA Agent unavailable.";
    const note = { result: "pass" as const, note: `Code checks passed. QA Agent: ${why}` };
    qaResults = { data_consistency: note, benchmark_methodology: note, source_trail: note, recommendation_logic: note, missing_inputs: note };
    await db.update(schema.agentRuns).set({ status: "failed", error: why, output: { code, notes }, durationMs: Date.now() - started }).where(eq(schema.agentRuns.id, qaRun));
  }
  await db.insert(schema.reviews).values({ deliverableId, version: d.version, qaResults });
  await db.update(schema.deliverables).set({ status: "in_review", codeChecksPassed: true }).where(and(eq(schema.deliverables.id, deliverableId), eq(schema.deliverables.status, "qa")));
  await track("deliverable_published", { companyId: company.id, props: { type: "assessment", use_case: useCase.id, automated: true, degraded, completeness: inputs.input.completeness } });
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

export type BaselineRow = {
  metric: MetricKey;
  label: string;
  value: string;
  period: string | null;
  origin: "manual" | "extracted" | "calculated";
  method: string | null;
  confirmed: boolean;
  sampleSize: number | null;
  /** Recorded more than 90 days before this brief was built. */
  stale: boolean;
  /** The same figure in the previous brief for this question, when it differs or matches. */
  previous: { value: string; version: number; direction: "better" | "worse" | "same" } | null;
  median: string | null;
  topQuartile: string | null;
};

export type ResultsView = {
  deliverableId: string;
  version: number;
  builtAt: string;
  reviewed: { by: string | null; at: string; comment: string | null } | null;
  certainty: BriefContent["certainty"];
  executiveDecision: BriefContent["executiveDecision"];
  baseline: BaselineRow[];
  reference: { name: string; companyCount: number | null; matched: string[]; unmatched: string[]; sources: string[] } | null;
  diagnosis: BriefContent["diagnosis"];
  evidence: BriefContent["evidence"];
  analyses: BriefContent["analyses"];
  alternatives: BriefContent["alternatives"];
  recommendation: BriefContent["recommendation"];
  plan: (BriefContent["plan"][number] & { metricLabel: string | null })[];
  changeTriggers: BriefContent["changeTriggers"];
  followUp: BriefContent["followUp"] & { revisitBy: string };
  assumptions: string[];
  /** Every known gap: those found in code first, then those the analysis named. */
  dataGaps: string[];
  methodology: string;
  confidence: Confidence;
  completeness: "complete" | "partial" | "minimal";
  /** The model couldn't produce the brief; this one was built from the inputs and rules only. */
  degraded: boolean;
  /** Which advisor offer fits: a review of the gaps, or monthly support to hit the target on time. */
  advisor: "review" | "monthly";
  /** When the founder committed to this plan (Progress tracks it from then). */
  committedAt: string | null;
  claims: Record<string, ResultsClaim>;
};

const VISIBLE = ["in_review", "approved", "published"] as const;
const STALE_MS = 90 * 86_400_000;

/** Renders a version for display, with the previous version's figures for comparison. */
export async function assessmentView(d: Deliverable): Promise<ResultsView | null> {
  const c = parseBrief(d.content);
  if (!c) return null;
  const dpIds = c.figures.map((f) => f.dataPointId);
  const bmIds = c.reference?.rows.map((r) => r.benchmarkMetricId) ?? [];
  const [points, refs, claims, review, previous, committed] = await Promise.all([
    dpIds.length ? db.select().from(schema.dataPoints).where(and(eq(schema.dataPoints.companyId, d.companyId), inArray(schema.dataPoints.id, dpIds))) : [],
    bmIds.length
      ? db
          .select({ metric: schema.benchmarkMetrics, source: schema.benchmarkSources })
          .from(schema.benchmarkMetrics)
          .leftJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkMetrics.sourceId))
          .where(and(inArray(schema.benchmarkMetrics.id, bmIds), eq(schema.benchmarkMetrics.status, "approved")))
      : [],
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
    d.useCase
      ? db
          .select()
          .from(schema.deliverables)
          .where(
            and(
              eq(schema.deliverables.companyId, d.companyId),
              eq(schema.deliverables.type, TYPE),
              eq(schema.deliverables.useCase, d.useCase),
              lt(schema.deliverables.version, d.version),
              eq(schema.deliverables.codeChecksPassed, true),
              inArray(schema.deliverables.status, [...VISIBLE]),
            ),
          )
          .orderBy(desc(schema.deliverables.version))
          .limit(1)
          .then((r) => r[0])
      : undefined,
    db.select({ at: schema.planActions.createdAt }).from(schema.planActions).where(eq(schema.planActions.deliverableId, d.id)).limit(1).then((r) => r[0]),
  ]);
  const dp = new Map(points.map((p) => [p.id, p]));
  const refByMetric = new Map((c.reference?.rows ?? []).map((r) => [r.metric, refs.find((x) => x.metric.id === r.benchmarkMetricId)]));
  const prev = previous ? parseBrief(previous.content) : null;
  const prevByMetric = new Map((prev?.baseline ?? []).map((b) => [b.metric, b.value]));
  const built = d.createdAt.getTime();

  // The snapshot the brief was built on; briefs in the first format read their figures live.
  const snapshot: BriefContent["baseline"] = c.baseline.length
    ? c.baseline
    : c.figures.flatMap((f) => {
        const p = dp.get(f.dataPointId);
        return p ? [{ metric: f.metric, dataPointId: p.id, value: p.value, period: p.period, origin: p.origin, method: p.method, confirmed: p.status === "accepted", sampleSize: p.calc?.sampleSize ?? null, recordedAt: p.updatedAt.toISOString() }] : [];
      });
  const baseline: BaselineRow[] = snapshot.map((b) => {
    const r = refByMetric.get(b.metric)?.metric;
    const before = prevByMetric.get(b.metric);
    const lower = METRICS[b.metric].lowerIsBetter;
    return {
      metric: b.metric,
      label: METRICS[b.metric].label,
      value: formatMetric(b.metric, b.value),
      period: b.period,
      origin: b.origin,
      method: b.method,
      confirmed: b.confirmed,
      sampleSize: b.sampleSize,
      stale: built - Date.parse(b.recordedAt) > STALE_MS,
      previous:
        before === undefined || !previous
          ? null
          : { value: formatMetric(b.metric, before), version: previous.version, direction: before === b.value ? "same" : before < b.value !== lower ? "better" : "worse" },
      median: r?.median != null ? formatMetric(b.metric, r.median) : null,
      topQuartile: r?.p75 != null ? formatMetric(b.metric, r.p75) : null,
    };
  });

  const describe = (s: typeof schema.claimSources.$inferSelect): SourceView | null => {
    if (s.kind === "data_point") {
      const p = s.refId ? dp.get(s.refId) : undefined;
      if (!p || !isMetricKey(p.metric)) return null;
      const how = p.origin === "calculated" ? "calculated in code" : p.origin === "manual" ? "entered by you" : "read from your document";
      return {
        kind: "data_point",
        title: `${METRICS[p.metric].label}: ${formatMetric(p.metric, p.value)}${p.period ? ` (${p.period})` : ""}`,
        detail: [how, p.method, p.origin === "calculated" ? null : p.rawText, p.status === "accepted" ? "confirmed" : "not yet confirmed"].filter(Boolean).join(" · "),
      };
    }
    if (s.kind === "benchmark_metric") {
      const r = refs.find((x) => x.metric.id === s.refId);
      if (!r || !isMetricKey(r.metric.metric)) return null;
      const m = r.metric.metric as MetricKey;
      const f = (n: number | null) => (n == null ? "—" : formatMetric(m, n));
      return {
        kind: "benchmark_metric",
        title: `Peer reference, ${METRICS[m].label}: median ${f(r.metric.median)}, top quartile ${f(r.metric.p75)}`,
        detail: [c.reference?.name, r.source ? [r.source.name, r.source.year].filter(Boolean).join(", ") : null].filter(Boolean).join(" · ") || null,
      };
    }
    if (s.kind === "founder_answer") return { kind: "founder_answer", title: s.note ?? "Your answer", detail: null };
    if (s.kind === "document") return { kind: "document", title: s.note ?? "Data you shared", detail: null };
    if (s.kind === "analysis") return { kind: "analysis", title: s.note ?? "Calculated from your data", detail: null };
    return { kind: "methodology", title: "How this was produced", detail: s.note };
  };
  const claimMap: Record<string, ResultsClaim> = {};
  for (const { claim, source } of claims) {
    const entry = (claimMap[claim.claimKey] ??= { text: claim.text, sources: [] });
    const v = source ? describe(source) : null;
    if (v) entry.sources.push(v);
  }

  const gaps = [...new Set([...c.systemGaps, ...c.dataGaps])];
  const confidence = c.degraded
    ? { level: "Low" as const, reasons: ["The written analysis didn't complete, so this brief goes no further than the rule-based diagnosis, your figures and the gaps."] }
    : resultConfidence({ reviewed: d.status === "published", unconfirmed: baseline.filter((e) => !e.confirmed).length, gaps: gaps.length, metrics: baseline.length });
  const reviewed = d.status === "published" && review ? { by: review.reviewer?.name ?? review.reviewer?.email ?? null, at: review.review.createdAt.toISOString(), comment: review.review.comment } : null;
  const usedRefs = refs.filter((r) => baseline.some((b) => b.metric === r.metric.metric));
  return {
    deliverableId: d.id,
    version: d.version,
    builtAt: d.createdAt.toISOString(),
    reviewed,
    certainty: c.certainty,
    executiveDecision: c.executiveDecision,
    baseline,
    reference:
      c.reference && baseline.some((e) => e.topQuartile)
        ? {
            name: c.reference.name,
            companyCount: c.reference.companyCount,
            matched: c.reference.matched,
            unmatched: c.reference.unmatched,
            sources: [...new Set(usedRefs.flatMap((r) => (r.source ? [[r.source.name, r.source.year].filter(Boolean).join(", ")] : [])))],
          }
        : null,
    diagnosis: c.diagnosis,
    evidence: c.evidence,
    analyses: c.analyses,
    alternatives: c.alternatives,
    recommendation: c.recommendation,
    plan: c.plan.map((a) => ({ ...a, metricLabel: a.metricKey ? METRICS[a.metricKey].label : null })),
    changeTriggers: c.changeTriggers,
    followUp: { ...c.followUp, revisitBy: new Date(built + c.followUp.revisitInDays * 86_400_000).toISOString() },
    assumptions: c.assumptions,
    dataGaps: gaps,
    methodology: c.methodology,
    confidence,
    completeness: c.completeness,
    degraded: c.degraded,
    advisor: !c.degraded && c.completeness === "complete" && !gaps.length && confidence.level === "High" ? "monthly" : "review",
    committedAt: committed ? committed.at.toISOString() : null,
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
  if (latest.codeChecksPassed === false) return { state: "failed", reason: "This version couldn't be completed. Run it again, or book time with an advisor to go through your data together." };
  const [run] = await db
    .select({ error: schema.agentRuns.error })
    .from(schema.agentRuns)
    .where(and(eq(schema.agentRuns.deliverableId, latest.id), eq(schema.agentRuns.status, "failed")))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(1);
  return { state: "failed", reason: run?.error ? "The analysis didn't finish this time. Run it again, or book time with an advisor to go through your data together." : "The analysis didn't finish this time. Run it again in a moment." };
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
