import "server-only";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { describeCriteria } from "@/lib/benchmarks";
import { completionSteps, type CompletionStep } from "@/lib/completion";
import { benchmarkContentSchema } from "@/lib/deliverables/benchmark";
import { isMetricKey, METRICS } from "@/lib/metrics";
import { benchmarkViewFor, getPublishedBenchmark, type BenchmarkView } from "./benchmark";
import { createBenchmarkVersion, isStalled } from "./deliverables";
import { getReadiness } from "./readiness";
import { isUseCaseActive } from "./use-cases";

type Deliverable = typeof schema.deliverables.$inferSelect;

/** Files still being read or sorted. */
async function filesInProgress(companyId: string): Promise<number> {
  const docs = await db
    .select({ status: schema.documents.status, sortStatus: schema.documents.sortStatus, inbox: schema.documents.inbox, updatedAt: schema.documents.updatedAt })
    .from(schema.documents)
    .where(eq(schema.documents.companyId, companyId));
  const recent = (d: (typeof docs)[number]) => Date.now() - d.updatedAt.getTime() < 10 * 60_000; // older ones were cut off
  return docs.filter((d) => recent(d) && (d.status === "uploaded" || d.status === "analyzing" || (d.inbox && (d.sortStatus === "sorting" || d.sortStatus === null)))).length;
}

/** Most recent change to the company's figures (new or reviewed data points). */
async function dataChangedAt(companyId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: max(schema.dataPoints.updatedAt) })
    .from(schema.dataPoints)
    .where(and(eq(schema.dataPoints.companyId, companyId), inArray(schema.dataPoints.status, ["accepted", "proposed"])));
  return row?.at ?? null;
}

export async function latestPreliminary(companyId: string): Promise<Deliverable | null> {
  const [d] = await db
    .select()
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.companyId, companyId), eq(schema.deliverables.type, "benchmark"), eq(schema.deliverables.preliminary, true)))
    .orderBy(desc(schema.deliverables.version))
    .limit(1);
  return d ?? null;
}

/**
 * Starts a preliminary Benchmark when uploads have settled and the figures
 * changed since the last one. Returns the new version's id, or null.
 */
/** Automatic rebuilds are at most this often (each one is two model calls); "Build it again" isn't limited. */
const AUTO_INTERVAL_MS = 5 * 60_000;

export async function startPreliminaryIfDue(company: Company, now = Date.now()): Promise<string | null> {
  const [doc] = await db.select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.companyId, company.id)).limit(1);
  if (!doc) return null; // only after the founder has uploaded something
  if (await filesInProgress(company.id)) return null;
  const changed = await dataChangedAt(company.id);
  if (!changed) return null;
  const last = await latestPreliminary(company.id);
  if (last && (last.createdAt >= changed || now - last.createdAt.getTime() < AUTO_INTERVAL_MS)) return null;
  const version = await createBenchmarkVersion(company, { preliminary: true });
  return version?.id ?? null;
}

export type FounderBenchmark =
  | { kind: "published"; view: BenchmarkView }
  | {
      kind: "preliminary";
      state: "building" | "ready" | "unavailable" | "none";
      unlocked: boolean;
      /** Full report, only when ready and unlocked. */
      view: BenchmarkView | null;
      /** Free preview: no figures. */
      preview: { cohortName: string; criteria: string; companyCount: number | null; metrics: string[] } | null;
      steps: CompletionStep[];
      reason: string | null;
      /** The advisor is preparing the full (reviewed) report. */
      advisorInProgress: boolean;
    };

/** What the founder's Benchmark page shows. Figures are only loaded once paid (or advisor-published). */
export async function founderBenchmark(company: Company): Promise<FounderBenchmark> {
  const published = await getPublishedBenchmark(company.id);
  if (published) return { kind: "published", view: published };

  const [d, readiness, advisorActive] = await Promise.all([
    latestPreliminary(company.id),
    getReadiness(company),
    db
      .select({ id: schema.deliverables.id })
      .from(schema.deliverables)
      .where(
        and(
          eq(schema.deliverables.companyId, company.id),
          eq(schema.deliverables.type, "benchmark"),
          eq(schema.deliverables.preliminary, false),
          inArray(schema.deliverables.status, ["drafting", "qa", "in_review", "approved"]),
        ),
      )
      .limit(1),
  ]);
  const unlocked = await isUseCaseActive(company.id, "growth_leak");
  const content = d ? benchmarkContentSchema.safeParse(d.content) : null;
  const cohortId = content?.success ? content.data.cohortId : null;
  const [cohort, cohortRows, points] = await Promise.all([
    cohortId ? db.select().from(schema.benchmarkCohorts).where(eq(schema.benchmarkCohorts.id, cohortId)).then((r) => r[0] ?? null) : null,
    cohortId
      ? db.select({ metric: schema.benchmarkMetrics.metric }).from(schema.benchmarkMetrics).where(and(eq(schema.benchmarkMetrics.cohortId, cohortId), eq(schema.benchmarkMetrics.status, "approved")))
      : [],
    content?.success && content.data.rows.length
      ? db
          .select({ metric: schema.dataPoints.metric, status: schema.dataPoints.status })
          .from(schema.dataPoints)
          .where(and(eq(schema.dataPoints.companyId, company.id), inArray(schema.dataPoints.id, content.data.rows.map((r) => r.dataPointId))))
      : [],
  ]);
  const compared = content?.success ? content.data.rows.map((r) => r.metric) : [];

  let state: "building" | "ready" | "unavailable" | "none" = "none";
  let reason: string | null = null;
  if (d) {
    if (d.status === "drafting" || d.status === "qa") state = isStalled(d) ? "unavailable" : "building";
    else if (d.status === "failed") state = "unavailable";
    else if (d.status === "changes_requested") {
      state = "unavailable";
      reason = "Your advisor is revising your report. You'll see the updated version here.";
    }
    else if (d.codeChecksPassed === false) {
      state = "unavailable";
      reason = "The preliminary draft didn't pass our accuracy checks, so it isn't shown. Your advisor will review it.";
    } else state = content?.success ? "ready" : "unavailable";
  }
  let noCohort = false;
  if (state === "unavailable" && d && !reason) {
    const [run] = await db
      .select({ error: schema.agentRuns.error })
      .from(schema.agentRuns)
      .where(and(eq(schema.agentRuns.deliverableId, d.id), eq(schema.agentRuns.status, "failed")))
      .orderBy(desc(schema.agentRuns.createdAt))
      .limit(1);
    noCohort = /No approved benchmark cohort/.test(run?.error ?? "");
    reason = noCohort
      ? null
      : /no accepted figures/.test(run?.error ?? "")
        ? "We need at least one figure (like ARR or growth) to compare. Add it in Company Profile or upload a file that has it."
        : "We couldn't build the preliminary report this time. Your advisor has been notified.";
  }

  const steps = completionSteps({
    cohortMetrics: [...new Set(cohortRows.map((r) => r.metric))].filter(isMetricKey),
    comparedMetrics: compared,
    unconfirmedMetrics: points.filter((p) => p.status !== "accepted").map((p) => p.metric),
    openConflicts: readiness.openConflicts.length,
    assessment: readiness.assessment,
    noCohort,
  });

  return {
    kind: "preliminary",
    state,
    unlocked,
    view: state === "ready" && unlocked && d ? await benchmarkViewFor(d) : null,
    preview:
      state === "ready" && cohort
        ? { cohortName: cohort.name, criteria: describeCriteria(cohort.criteria), companyCount: cohort.companyCount, metrics: compared.map((m) => METRICS[m].label) }
        : null,
    steps,
    reason,
    advisorInProgress: advisorActive.length > 0,
  };
}

/** For the review queue and company view: is this the version the founder may see after paying? */
export const founderCanSeePreliminary = (d: Pick<Deliverable, "preliminary" | "codeChecksPassed" | "status">) =>
  d.preliminary && d.codeChecksPassed === true && (d.status === "in_review" || d.status === "approved");

