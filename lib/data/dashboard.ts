import "server-only";
import { connection } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { formatMetric, type MetricKey } from "@/lib/metrics";
import { getPublishedBenchmark } from "./benchmark";

export type MetricCardView = { label: string; value: string; sub: string; trend: "up" | "down" | "neutral" };


const CARDS: { metric: MetricKey; label: string; sub: string; trend: MetricCardView["trend"] }[] = [
  { metric: "arr", label: "ARR", sub: "", trend: "up" },
  { metric: "arr_growth", label: "Growth", sub: "YoY rate", trend: "up" },
  { metric: "nrr", label: "NRR", sub: "Trailing 12M", trend: "neutral" },
  { metric: "acv", label: "ACV", sub: "Per customer", trend: "neutral" },
  { metric: "sales_cycle_days", label: "Sales Cycle", sub: "Avg. close", trend: "down" },
  { metric: "customers", label: "Customers", sub: "Active", trend: "up" },
];

/** Dashboard data for a company the caller is allowed to see. Figures come from accepted data points only. */
export async function getDashboard(company: Company) {
  const [points, scoreRow, questions, deliverables, benchmark] = await Promise.all([
    db
      .select()
      .from(schema.dataPoints)
      .where(and(eq(schema.dataPoints.companyId, company.id), eq(schema.dataPoints.status, "accepted")))
      .orderBy(desc(schema.dataPoints.updatedAt)),
    db
      .select({ score: schema.companyScores, rubric: schema.scoreRubrics })
      .from(schema.companyScores)
      .innerJoin(schema.scoreRubrics, eq(schema.scoreRubrics.id, schema.companyScores.rubricId))
      .where(eq(schema.companyScores.companyId, company.id))
      .orderBy(desc(schema.companyScores.updatedAt))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({ n: count() })
      .from(schema.registerItems)
      .where(and(eq(schema.registerItems.companyId, company.id), eq(schema.registerItems.status, "open")))
      .then((r) => r[0]?.n ?? 0),
    db
      .selectDistinct({ type: schema.deliverables.type })
      .from(schema.deliverables)
      .where(and(eq(schema.deliverables.companyId, company.id), eq(schema.deliverables.status, "published"))),
    getPublishedBenchmark(company.id),
  ]);

  // Latest accepted value per metric
  const latest = new Map<string, number>();
  for (const p of points) if (!latest.has(p.metric)) latest.set(p.metric, p.value);

  const metrics: MetricCardView[] = CARDS.filter((c) => latest.has(c.metric)).map((c) => ({
    label: c.label,
    value: formatMetric(c.metric, latest.get(c.metric)!),
    sub: c.metric === "arr" && latest.has("arr_growth") ? `${formatMetric("arr_growth", latest.get("arr_growth")!)} YoY` : c.sub,
    trend: c.trend,
  }));

  let score: { value: number; label: string | null } | null = null;
  if (scoreRow) {
    const value = scoreRow.score.overrideScore ?? scoreRow.score.computedScore;
    if (value != null) {
      const label = scoreRow.rubric.labels.find((l) => value >= l.min && value <= l.max)?.label ?? null;
      score = { value: Math.round(value), label };
    }
  }

  return {
    companyName: company.name,
    metrics,
    score,
    scoreBreakdown: (scoreRow?.score.breakdown as { label: string; score: number }[] | null) ?? null,
    openQuestions: questions,
    benchmark,
    published: deliverables.map((d) => d.type),
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

/** The public demo company. Only ever returns a row flagged is_sample. */
export async function getSampleCompany(): Promise<Company | null> {
  await connection(); // always read live seed data, never a build-time snapshot
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.isSample, true)).limit(1);
  return company ?? null;
}
