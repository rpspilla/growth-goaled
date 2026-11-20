import "server-only";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { isMetricKey, type MetricKey } from "@/lib/metrics";
import { arrGrowthSinceLastUpdate, type ArrGrowth } from "@/lib/arr-growth";

export type CompanyMetric = {
  metric: MetricKey;
  value: number;
  period: string | null;
  origin: "manual" | "extracted" | "calculated";
  method: string | null;
  confirmed: boolean;
  updatedAt: Date;
  /** The previous different value for the same metric, for a simple change indicator. */
  previous: { value: number; updatedAt: Date } | null;
};

/**
 * The company's own figures: the latest confirmed or calculated value per metric (unconfirmed
 * extractions are left out, they're shown on the Data step for checking), plus the monthly
 * recurring revenue series calculated from their newest revenue file, if any.
 */
export async function companyPerformance(company: Pick<Company, "id">) {
  const [points, docs] = await Promise.all([
    db
      .select()
      .from(schema.dataPoints)
      .where(and(eq(schema.dataPoints.companyId, company.id), ne(schema.dataPoints.status, "rejected")))
      .orderBy(desc(schema.dataPoints.updatedAt)),
    db
      .select({ filename: schema.documents.filename, analysis: schema.documents.analysis, updatedAt: schema.documents.updatedAt })
      .from(schema.documents)
      .where(and(eq(schema.documents.companyId, company.id), isNotNull(schema.documents.analysis), ne(schema.documents.status, "failed")))
      .orderBy(desc(schema.documents.updatedAt)),
  ]);
  const usable = points.filter((p) => isMetricKey(p.metric) && (p.status === "accepted" || p.origin === "calculated"));
  usable.sort((a, b) => Number(b.status === "accepted") - Number(a.status === "accepted") || b.updatedAt.getTime() - a.updatedAt.getTime());
  const metrics = new Map<MetricKey, CompanyMetric>();
  for (const p of usable) {
    const key = p.metric as MetricKey;
    const existing = metrics.get(key);
    if (!existing) metrics.set(key, { metric: key, value: p.value, period: p.period, origin: p.origin, method: p.method, confirmed: p.status === "accepted", updatedAt: p.updatedAt, previous: null });
    else if (!existing.previous && p.value !== existing.value && p.updatedAt < existing.updatedAt) existing.previous = { value: p.value, updatedAt: p.updatedAt };
  }
  const revenueFile = docs.find((d) => (d.analysis?.monthly?.length ?? 0) >= 3);
  return {
    metrics,
    monthly: revenueFile ? { filename: revenueFile.filename, points: revenueFile.analysis!.monthly!.slice(-12) } : null,
  };
}

/** Growth since the company's last data update (see lib/arr-growth). */
export async function arrGrowth(company: Pick<Company, "id">): Promise<ArrGrowth | null> {
  const readings = await db
    .select({ value: schema.dataPoints.value, period: schema.dataPoints.period, status: schema.dataPoints.status, origin: schema.dataPoints.origin, createdAt: schema.dataPoints.createdAt, updatedAt: schema.dataPoints.updatedAt })
    .from(schema.dataPoints)
    .where(and(eq(schema.dataPoints.companyId, company.id), eq(schema.dataPoints.metric, "arr"), ne(schema.dataPoints.status, "rejected")));
  return arrGrowthSinceLastUpdate(readings);
}
