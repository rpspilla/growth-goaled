import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { assessReadiness } from "@/lib/readiness-assessment";
import { isMetricKey, type MetricKey } from "@/lib/metrics";
import { isStalled } from "./deliverables";

export type PortfolioRow = {
  id: string;
  name: string;
  isSample: boolean;
  stage: string | null;
  phase: Company["phase"];
  health: Company["health"];
  arr: number | null;
  growth: number | null;
  score: number | null;
  readinessPercent: number;
  openQuestions: number;
  openConflicts: number;
  benchmarkStatus: string | null;
  attention: string[];
};

/** Latest accepted value per metric for each company. */
export async function latestMetrics(companyIds: string[]): Promise<Map<string, Map<MetricKey, { id: string; value: number }>>> {
  const out = new Map<string, Map<MetricKey, { id: string; value: number }>>();
  if (!companyIds.length) return out;
  const rows = await db
    .select({ id: schema.dataPoints.id, companyId: schema.dataPoints.companyId, metric: schema.dataPoints.metric, value: schema.dataPoints.value })
    .from(schema.dataPoints)
    .where(and(inArray(schema.dataPoints.companyId, companyIds), eq(schema.dataPoints.status, "accepted")))
    .orderBy(desc(schema.dataPoints.updatedAt));
  for (const r of rows) {
    if (!isMetricKey(r.metric)) continue;
    const m = out.get(r.companyId) ?? new Map();
    if (!m.has(r.metric)) m.set(r.metric, { id: r.id, value: r.value });
    out.set(r.companyId, m);
  }
  return out;
}

/** Portfolio table and counts for the companies an advisor manages (callers pass those companies). */
export async function portfolioRows(companies: Company[], now = new Date()): Promise<PortfolioRow[]> {
  const ids = companies.map((c) => c.id);
  if (!ids.length) return [];
  const [metrics, registers, items, deliverables, scores] = await Promise.all([
    latestMetrics(ids),
    db
      .select({ companyId: schema.registerItems.companyId, type: schema.registerItems.type, owner: schema.registerItems.owner })
      .from(schema.registerItems)
      .where(and(inArray(schema.registerItems.companyId, ids), eq(schema.registerItems.status, "open"))),
    db.select().from(schema.dataItems).where(inArray(schema.dataItems.companyId, ids)),
    db
      .select()
      .from(schema.deliverables)
      .where(and(inArray(schema.deliverables.companyId, ids), eq(schema.deliverables.type, "benchmark")))
      .orderBy(desc(schema.deliverables.version)),
    db.select().from(schema.companyScores).where(inArray(schema.companyScores.companyId, ids)).orderBy(desc(schema.companyScores.updatedAt)),
  ]);

  return companies.map((c) => {
    const m = metrics.get(c.id);
    const regs = registers.filter((r) => r.companyId === c.id);
    const readiness = assessReadiness(
      items
        .filter((i) => i.companyId === c.id)
        .map((i) => ({ key: i.itemKey, status: i.status, quality: i.quality, coverageStart: i.coverageStart, coverageEnd: i.coverageEnd, limitations: i.limitations, followUp: i.followUp, fileCount: 0, missingFields: [] })),
      [],
      now,
    );
    const latest = deliverables.find((d) => d.companyId === c.id);
    const benchmarkStatus = latest ? (isStalled(latest, now.getTime()) ? "stalled" : latest.status) : null;
    const score = scores.find((s) => s.companyId === c.id);
    const conflicts = regs.filter((r) => r.type === "conflict").length;

    const attention: string[] = [];
    if (benchmarkStatus === "in_review") attention.push("Benchmark ready for review");
    if (benchmarkStatus === "approved") attention.push("Approved benchmark not published");
    if (benchmarkStatus === "failed" || benchmarkStatus === "stalled") attention.push("Benchmark run failed");
    if (conflicts) attention.push(`${conflicts} data ${conflicts === 1 ? "conflict" : "conflicts"}`);
    if (c.health === "critical") attention.push("Health: at risk");

    return {
      id: c.id,
      name: c.name,
      isSample: c.isSample,
      stage: c.stage,
      phase: c.phase,
      health: c.health,
      arr: m?.get("arr")?.value ?? c.arr,
      growth: m?.get("arr_growth")?.value ?? c.growthPct,
      score: score ? (score.overrideScore ?? score.computedScore) : null,
      readinessPercent: readiness.collection.requiredPercent,
      openQuestions: regs.filter((r) => r.owner === "founder").length,
      openConflicts: conflicts,
      benchmarkStatus,
      attention,
    };
  });
}

export function portfolioCounts(rows: PortfolioRow[]) {
  return {
    active: rows.filter((r) => r.phase !== "complete").length,
    attention: rows.filter((r) => r.attention.length > 0).length,
    awaitingFounder: rows.filter((r) => r.phase === "intake" || r.phase === "upload" || r.openQuestions > 0).length,
    inReview: rows.filter((r) => r.benchmarkStatus === "in_review" || r.benchmarkStatus === "approved").length,
    complete: rows.filter((r) => r.phase === "complete").length,
  };
}

export async function setHealth(actor: User, company: Company, health: Company["health"]): Promise<boolean> {
  if (actor.role !== "advisor" && actor.role !== "admin") return false;
  await db.update(schema.companies).set({ health }).where(eq(schema.companies.id, company.id));
  return true;
}

export async function saveAdvisorSummary(actor: User, company: Company, text: string): Promise<boolean> {
  if (actor.role !== "advisor" && actor.role !== "admin") return false;
  const summary = text.trim().slice(0, 4000) || null;
  await db
    .update(schema.companies)
    .set({ advisorSummary: summary, advisorSummaryAt: summary ? new Date() : null, advisorSummaryBy: summary ? actor.id : null })
    .where(eq(schema.companies.id, company.id));
  return true;
}

export async function userName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const [u] = await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return u ? (u.name ?? u.email) : null;
}
