import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CohortCriteria } from "@/lib/db/schema";
import { benchmarkContentSchema, type BenchmarkContent } from "@/lib/deliverables/benchmark";
import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import { radarScore, RADAR_LABEL, statusVsTopQuartile, type BenchmarkStatus } from "@/lib/benchmark";

export type SourceView = { kind: "data_point" | "benchmark_metric" | "document" | "methodology"; title: string; detail: string | null };
export type ClaimView = { text: string; confidence: string | null; sources: SourceView[] };

export type BenchmarkRowView = {
  metric: MetricKey;
  label: string;
  value: string;
  median: string | null;
  topQuartile: string;
  status: BenchmarkStatus;
  claimKey: string;
  /** Read from the founder's file and not yet confirmed by them (preliminary reports only). */
  unconfirmed: boolean;
};

export type BenchmarkView = {
  headline: string | null;
  cohort: { name: string; companyCount: number | null; tags: string[] };
  rows: BenchmarkRowView[];
  radar: { subject: string; company: number; median: number }[];
  insight: BenchmarkContent["insight"];
  summary: BenchmarkContent["summary"];
  methodology: string;
  claims: Record<string, ClaimView>;
  approval: { reviewerName: string | null; comment: string | null; at: string } | null;
};

const usd = (n: number) => formatMetric("arr", n);

function cohortTags(criteria: CohortCriteria): string[] {
  const tags: string[] = [...(criteria.stage ?? [])];
  if (criteria.arr_min != null || criteria.arr_max != null) {
    tags.push(`${criteria.arr_min != null ? usd(criteria.arr_min) : "<"}–${criteria.arr_max != null ? usd(criteria.arr_max) : "+"} ARR`);
  }
  if (criteria.model) tags.push(criteria.model);
  if (criteria.gtm_motion) tags.push(criteria.gtm_motion);
  return tags;
}

/**
 * Latest published Benchmark deliverable for a company, resolved against the
 * data points and approved benchmark rows it references. Callers must have
 * already checked the viewer may see this company.
 */
export async function getPublishedBenchmark(companyId: string): Promise<BenchmarkView | null> {
  const [deliverable] = await db
    .select()
    .from(schema.deliverables)
    .where(
      and(
        eq(schema.deliverables.companyId, companyId),
        eq(schema.deliverables.type, "benchmark"),
        eq(schema.deliverables.status, "published"),
      ),
    )
    .orderBy(desc(schema.deliverables.version))
    .limit(1);
  return deliverable ? benchmarkViewFor(deliverable) : null;
}

/**
 * Renders any Benchmark deliverable version (drafts included) for the views.
 * Only staff may be shown unpublished versions; founders go through
 * getPublishedBenchmark.
 */
export async function benchmarkViewFor(deliverable: typeof schema.deliverables.$inferSelect): Promise<BenchmarkView | null> {
  const companyId = deliverable.companyId;
  const parsed = benchmarkContentSchema.safeParse(deliverable.content);
  if (!parsed.success) {
    console.error(`[benchmark] Deliverable ${deliverable.id} has invalid content`, parsed.error.issues);
    return null;
  }
  const content = parsed.data;

  const dataPointIds = content.rows.map((r) => r.dataPointId);
  const metricIds = content.rows.map((r) => r.benchmarkMetricId);

  const [cohort, dataPoints, metrics, claims, review] = await Promise.all([
    db.select().from(schema.benchmarkCohorts).where(eq(schema.benchmarkCohorts.id, content.cohortId)).then((r) => r[0]),
    db
      .select()
      .from(schema.dataPoints)
      .where(and(eq(schema.dataPoints.companyId, companyId), inArray(schema.dataPoints.id, dataPointIds))),
    db
      .select({ metric: schema.benchmarkMetrics, source: schema.benchmarkSources })
      .from(schema.benchmarkMetrics)
      .leftJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkMetrics.sourceId))
      .where(and(inArray(schema.benchmarkMetrics.id, metricIds), eq(schema.benchmarkMetrics.status, "approved"))),
    db
      .select({ claim: schema.claims, source: schema.claimSources })
      .from(schema.claims)
      .leftJoin(schema.claimSources, eq(schema.claimSources.claimId, schema.claims.id))
      .where(eq(schema.claims.deliverableId, deliverable.id)),
    db
      .select({ review: schema.reviews, reviewer: schema.users })
      .from(schema.reviews)
      .leftJoin(schema.users, eq(schema.users.id, schema.reviews.reviewerId))
      .where(and(eq(schema.reviews.deliverableId, deliverable.id), eq(schema.reviews.decision, "approve")))
      .orderBy(desc(schema.reviews.createdAt))
      .limit(1)
      .then((r) => r[0]),
  ]);
  if (!cohort) return null;

  const dpById = new Map(dataPoints.map((d) => [d.id, d]));
  const bmById = new Map(metrics.map((m) => [m.metric.id, m]));

  const rows: BenchmarkRowView[] = [];
  const radar: BenchmarkView["radar"] = [];
  for (const row of content.rows) {
    const dp = dpById.get(row.dataPointId);
    const bm = bmById.get(row.benchmarkMetricId)?.metric;
    // A figure without its data point or approved benchmark row is never shown.
    if (!dp || !bm || bm.p75 == null) continue;
    rows.push({
      metric: row.metric,
      label: METRICS[row.metric].label,
      value: formatMetric(row.metric, dp.value),
      median: bm.median != null ? formatMetric(row.metric, bm.median) : null,
      topQuartile: formatMetric(row.metric, bm.p75),
      status: statusVsTopQuartile(row.metric, dp.value, bm.p75),
      claimKey: row.claimKey,
      unconfirmed: dp.status !== "accepted",
    });
    const subject = RADAR_LABEL[row.metric];
    if (subject && bm.median != null) {
      radar.push({ subject, company: radarScore(row.metric, dp.value, bm.p75), median: radarScore(row.metric, bm.median, bm.p75) });
    }
  }

  // Resolve claim sources to readable lines for the Source Trail panel.
  const sourceDpIds = new Set<string>();
  const sourceBmIds = new Set<string>();
  for (const { source } of claims) {
    if (source?.kind === "data_point" && source.refId) sourceDpIds.add(source.refId);
    if (source?.kind === "benchmark_metric" && source.refId) sourceBmIds.add(source.refId);
  }
  const extraDpIds = [...sourceDpIds].filter((id) => !dpById.has(id));
  const extraBmIds = [...sourceBmIds].filter((id) => !bmById.has(id));
  const [extraDps, extraBms] = await Promise.all([
    extraDpIds.length
      ? db.select().from(schema.dataPoints).where(and(eq(schema.dataPoints.companyId, companyId), inArray(schema.dataPoints.id, extraDpIds)))
      : [],
    extraBmIds.length
      ? db
          .select({ metric: schema.benchmarkMetrics, source: schema.benchmarkSources })
          .from(schema.benchmarkMetrics)
          .leftJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkMetrics.sourceId))
          .where(and(inArray(schema.benchmarkMetrics.id, extraBmIds), eq(schema.benchmarkMetrics.status, "approved")))
      : [],
  ]);
  for (const d of extraDps) dpById.set(d.id, d);
  for (const m of extraBms) bmById.set(m.metric.id, m);

  const describe = (s: typeof schema.claimSources.$inferSelect): SourceView | null => {
    if (s.kind === "methodology") return { kind: "methodology", title: "Cohort matching methodology", detail: s.note };
    if (s.kind === "data_point") {
      const d = s.refId ? dpById.get(s.refId) : undefined;
      if (!d) return null;
      const key = d.metric as MetricKey;
      const label = METRICS[key]?.label ?? d.metric;
      const value = METRICS[key] ? formatMetric(key, d.value) : String(d.value);
      return {
        kind: "data_point",
        title: `${label}: ${value}${d.period ? ` (${d.period})` : ""}`,
        detail: [d.rawText, `${d.confidence} confidence`].filter(Boolean).join(" · "),
      };
    }
    if (s.kind === "benchmark_metric") {
      const m = s.refId ? bmById.get(s.refId) : undefined;
      if (!m) return null;
      const key = m.metric.metric as MetricKey;
      const fmt = (n: number | null) => (n == null ? "—" : METRICS[key] ? formatMetric(key, n) : String(n));
      const label = METRICS[key]?.label ?? m.metric.metric;
      const src = m.source;
      return {
        kind: "benchmark_metric",
        title: `${label}: median ${fmt(m.metric.median)}, top quartile ${fmt(m.metric.p75)}`,
        detail: [src?.name, src?.publisher, src?.year, m.metric.sampleSize ? `n=${m.metric.sampleSize}` : null]
          .filter(Boolean)
          .join(" · "),
      };
    }
    return { kind: s.kind, title: s.note ?? "Document", detail: null };
  };

  const claimMap: Record<string, ClaimView> = {};
  for (const { claim, source } of claims) {
    const entry = (claimMap[claim.claimKey] ??= { text: claim.text, confidence: claim.confidence, sources: [] });
    const view = source ? describe(source) : null;
    if (view) entry.sources.push(view);
  }

  return {
    headline: deliverable.headline,
    cohort: { name: cohort.name, companyCount: cohort.companyCount, tags: cohortTags(cohort.criteria) },
    rows,
    radar,
    insight: content.insight,
    summary: content.summary,
    methodology: content.methodology,
    claims: claimMap,
    approval: review
      ? { reviewerName: review.reviewer?.name ?? null, comment: review.review.comment, at: review.review.createdAt.toISOString() }
      : null,
  };
}
