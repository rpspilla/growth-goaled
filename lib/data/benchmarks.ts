import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { AI_MODEL, aiProblemForStaff, isAiConfigError } from "@/lib/ai/config";
import { researchBenchmarks, ResearchError } from "@/lib/ai/research";
import { type CohortInput, parseBenchmarkCsv, quartileProblem, sourceInputSchema } from "@/lib/benchmarks";
import { isMetricKey } from "@/lib/metrics";
import type { z } from "zod";

type Cohort = typeof schema.benchmarkCohorts.$inferSelect;
type MetricStatus = (typeof schema.benchmarkMetricStatus.enumValues)[number];

const isStaff = (u: User) => u.role === "advisor" || u.role === "admin";

export async function listCohorts() {
  const cohorts = await db.select().from(schema.benchmarkCohorts).orderBy(asc(schema.benchmarkCohorts.isSample), asc(schema.benchmarkCohorts.name));
  const counts = await db.select({ cohortId: schema.benchmarkMetrics.cohortId, status: schema.benchmarkMetrics.status }).from(schema.benchmarkMetrics);
  return cohorts.map((c) => ({
    ...c,
    approved: counts.filter((m) => m.cohortId === c.id && m.status === "approved").length,
    proposed: counts.filter((m) => m.cohortId === c.id && m.status === "proposed").length,
  }));
}

export async function getCohort(id: string): Promise<Cohort | null> {
  const [c] = await db.select().from(schema.benchmarkCohorts).where(eq(schema.benchmarkCohorts.id, id)).limit(1);
  return c ?? null;
}

function criteriaOf(input: CohortInput) {
  return {
    ...(input.stage.length ? { stage: input.stage } : {}),
    ...(input.arr_min !== undefined ? { arr_min: input.arr_min } : {}),
    ...(input.arr_max !== undefined ? { arr_max: input.arr_max } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.gtm_motion ? { gtm_motion: input.gtm_motion } : {}),
  };
}

export async function createCohort(actor: User, input: CohortInput): Promise<Cohort | null> {
  if (!isStaff(actor)) return null;
  const [c] = await db
    .insert(schema.benchmarkCohorts)
    .values({ name: input.name, description: input.description || null, criteria: criteriaOf(input), companyCount: input.companyCount ?? null })
    .returning();
  return c ?? null;
}

/** Sample cohorts are seed data for the demo and can't be edited here. */
export async function updateCohort(actor: User, id: string, input: CohortInput): Promise<boolean> {
  if (!isStaff(actor)) return false;
  const updated = await db
    .update(schema.benchmarkCohorts)
    .set({ name: input.name, description: input.description || null, criteria: criteriaOf(input), companyCount: input.companyCount ?? null })
    .where(and(eq(schema.benchmarkCohorts.id, id), eq(schema.benchmarkCohorts.isSample, false)))
    .returning({ id: schema.benchmarkCohorts.id });
  return updated.length > 0;
}

export type MetricRow = Awaited<ReturnType<typeof listCohortMetrics>>[number];

export async function listCohortMetrics(cohortId: string) {
  const rows = await db
    .select({ metric: schema.benchmarkMetrics, source: schema.benchmarkSources })
    .from(schema.benchmarkMetrics)
    .leftJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkMetrics.sourceId))
    .where(eq(schema.benchmarkMetrics.cohortId, cohortId))
    .orderBy(asc(schema.benchmarkMetrics.metric), desc(schema.benchmarkMetrics.createdAt));
  return rows.map(({ metric, source }) => ({
    ...metric,
    source: source ? { id: source.id, name: source.name, publisher: source.publisher, url: source.url, year: source.year, type: source.type } : null,
  }));
}

/**
 * Approve, retire or send back a row. Approving retires any other approved row
 * for the same cohort, metric and period, so agents only ever see one.
 */
export async function setMetricStatus(actor: User, metricId: string, status: MetricStatus): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isStaff(actor)) return { ok: false, error: "Not allowed." };
  const [row] = await db
    .select({ m: schema.benchmarkMetrics, sample: schema.benchmarkCohorts.isSample })
    .from(schema.benchmarkMetrics)
    .innerJoin(schema.benchmarkCohorts, eq(schema.benchmarkCohorts.id, schema.benchmarkMetrics.cohortId))
    .where(eq(schema.benchmarkMetrics.id, metricId))
    .limit(1);
  if (!row) return { ok: false, error: "Row not found." };
  if (row.sample) return { ok: false, error: "Sample cohort rows can't be changed." };
  const m = row.m;
  if (status === "approved") {
    if (!isMetricKey(m.metric)) return { ok: false, error: "Unknown metric." };
    const problem = quartileProblem(m.metric, { p25: m.p25, median: m.median, p75: m.p75 });
    if (problem) return { ok: false, error: problem };
    if (!m.sourceId) return { ok: false, error: "Rows need a source before they can be approved." };
    const others = await db
      .select({ id: schema.benchmarkMetrics.id, period: schema.benchmarkMetrics.period })
      .from(schema.benchmarkMetrics)
      .where(and(eq(schema.benchmarkMetrics.cohortId, m.cohortId), eq(schema.benchmarkMetrics.metric, m.metric), eq(schema.benchmarkMetrics.status, "approved")));
    const clash = others.filter((o) => o.id !== m.id && (o.period ?? "") === (m.period ?? "")).map((o) => o.id);
    if (clash.length) await db.update(schema.benchmarkMetrics).set({ status: "retired" }).where(inArray(schema.benchmarkMetrics.id, clash));
  }
  await db
    .update(schema.benchmarkMetrics)
    .set({ status, approvedBy: status === "approved" ? actor.id : status === "proposed" ? null : m.approvedBy })
    .where(eq(schema.benchmarkMetrics.id, m.id));
  return { ok: true };
}

/** Removes a proposed row that was never approved (e.g. a bad research result). */
export async function discardProposedMetric(actor: User, metricId: string): Promise<boolean> {
  if (!isStaff(actor)) return false;
  const deleted = await db
    .delete(schema.benchmarkMetrics)
    .where(and(eq(schema.benchmarkMetrics.id, metricId), eq(schema.benchmarkMetrics.status, "proposed")))
    .returning({ id: schema.benchmarkMetrics.id });
  return deleted.length > 0;
}

export async function listSources() {
  const sources = await db.select().from(schema.benchmarkSources).orderBy(desc(schema.benchmarkSources.createdAt));
  const uses = await db.select({ sourceId: schema.benchmarkMetrics.sourceId, status: schema.benchmarkMetrics.status }).from(schema.benchmarkMetrics);
  return sources.map((s) => ({
    ...s,
    rows: uses.filter((u) => u.sourceId === s.id).length,
    approved: uses.filter((u) => u.sourceId === s.id && u.status === "approved").length,
  }));
}

export type ImportResult = { ok: true; imported: number; errors: { line: number; message: string }[] } | { ok: false; error: string; errors?: { line: number; message: string }[] };

/** Imports the owner's advisory benchmarks from CSV as proposed rows with one advisory source. */
export async function importBenchmarkCsv(
  actor: User,
  cohortId: string,
  csv: string,
  source: z.infer<typeof sourceInputSchema>,
): Promise<ImportResult> {
  if (!isStaff(actor)) return { ok: false, error: "Not allowed." };
  const cohort = await getCohort(cohortId);
  if (!cohort || cohort.isSample) return { ok: false, error: "Choose one of your cohorts." };
  const { rows, errors } = parseBenchmarkCsv(csv);
  if (!rows.length) return { ok: false, error: errors.length ? "No rows could be imported." : "The file has no rows.", errors };

  const [src] = await db
    .insert(schema.benchmarkSources)
    .values({ ...source, publisher: source.publisher || null, url: source.url || null, type: "advisory", importedBy: actor.id })
    .returning({ id: schema.benchmarkSources.id });
  await db.insert(schema.benchmarkMetrics).values(
    rows.map((r) => ({ cohortId, metric: r.metric, p25: r.p25, median: r.median, p75: r.p75, sampleSize: r.sampleSize, period: r.period, sourceId: src!.id, status: "proposed" as const })),
  );
  return { ok: true, imported: rows.length, errors };
}

// ---------------------------------------------------------------------------
// Public benchmark research (runs after the action responds)
// ---------------------------------------------------------------------------

export async function latestResearchRun(cohortId: string) {
  const [run] = await db
    .select()
    .from(schema.agentRuns)
    .where(and(eq(schema.agentRuns.cohortId, cohortId), eq(schema.agentRuns.agent, "research")))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(1);
  return run ?? null;
}

/** Records a research run; returns null if one is already running for the cohort. */
export async function startResearch(actor: User, cohortId: string): Promise<{ runId: string } | { error: string }> {
  if (!isStaff(actor)) return { error: "Not allowed." };
  const cohort = await getCohort(cohortId);
  if (!cohort || cohort.isSample) return { error: "Choose one of your cohorts." };
  const last = await latestResearchRun(cohortId);
  // A run that has been "running" for over 10 minutes was cut off; allow a new one.
  if (last?.status === "running" && Date.now() - last.createdAt.getTime() < 10 * 60_000) return { error: "Research is already running for this cohort." };
  const [run] = await db
    .insert(schema.agentRuns)
    .values({ agent: "research", cohortId, model: AI_MODEL, status: "running", startedBy: actor.id })
    .returning({ id: schema.agentRuns.id });
  return { runId: run!.id };
}

/** Executes a research run: stores sources and proposed rows, and logs the outcome on the run. */
export async function runResearch(runId: string, research = researchBenchmarks): Promise<void> {
  const [run] = await db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, runId)).limit(1);
  if (!run?.cohortId || run.status !== "running") return;
  const cohort = await getCohort(run.cohortId);
  if (!cohort) return;
  const started = Date.now();

  try {
    const result = await research(cohort);
    const sourceIds: string[] = [];
    for (const s of result.output.sources) {
      const [row] = await db
        .insert(schema.benchmarkSources)
        .values({
          name: s.name.slice(0, 200),
          publisher: s.publisher.slice(0, 200) || null,
          url: s.url.slice(0, 1000),
          year: s.year,
          type: "public",
          importedBy: run.startedBy,
          notes: s.sample_description?.slice(0, 2000) || null,
          licenceNote: "Public report. Aggregates and citation only.",
        })
        .returning({ id: schema.benchmarkSources.id });
      sourceIds.push(row!.id);
    }
    const rejected: string[] = [...result.dropped];
    const values = result.output.metrics.flatMap((m) => {
      const problem = quartileProblem(m.metric, { p25: m.p25, median: m.median, p75: m.top_quartile });
      if (problem) {
        rejected.push(`${m.metric}: ${problem}`);
        return [];
      }
      return [
        {
          cohortId: cohort.id,
          metric: m.metric,
          p25: m.p25,
          median: m.median,
          p75: m.top_quartile,
          sampleSize: m.sample_size,
          period: m.period?.slice(0, 40) ?? null,
          sourceId: sourceIds[m.source_index] ?? null,
          status: "proposed" as const,
        },
      ];
    });
    if (values.length) await db.insert(schema.benchmarkMetrics).values(values);
    await db
      .update(schema.agentRuns)
      .set({
        status: "succeeded",
        model: result.model,
        output: { ...result.output, proposed: values.length, rejected, searched_urls: result.searchedUrls.length },
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        durationMs: Date.now() - started,
      })
      .where(eq(schema.agentRuns.id, runId));
  } catch (err) {
    console.error(`[research] Run ${runId} failed`, err);
    await db
      .update(schema.agentRuns)
      .set({
        status: "failed",
        error: err instanceof ResearchError ? err.message : isAiConfigError(err) ? aiProblemForStaff(err) : "Research failed. Try again.",
        durationMs: Date.now() - started,
      })
      .where(eq(schema.agentRuns.id, runId));
  }
}
