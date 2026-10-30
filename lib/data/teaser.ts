import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { diagnose, KEY_METRICS, type Figure } from "@/lib/diagnostics";
import { chartsFromAnalyses, type BriefCharts } from "@/lib/deliverables/charts";
import { figureRank } from "@/lib/figures";
import { formatMetric, isMetricKey, METRICS, type MetricKey } from "@/lib/metrics";
import type { UseCaseDef } from "@/lib/use-cases";

/**
 * The free teaser verdict (first-session simplification): from the founder's key file alone, the
 * deterministic diagnostic rules (no model, so no cost per teaser) name the likely constraint and
 * the ARR at stake, and the charts are computed in code. The page shows the headline and blurs the
 * chart; the full answer, evidence and plan are the paid assessment.
 */
export type Teaser =
  | { state: "no_file" }
  | { state: "reading"; filename: string }
  | { state: "unreadable"; filename: string; error: string | null }
  | {
      state: "ready";
      filename: string;
      /** The leading constraint, or null when the file can't separate the candidates. */
      headline: string | null;
      impactArr: number | null;
      certainty: "established" | "leading" | "unresolved";
      /** Calculated figures and findings the verdict rests on (counted, not shown). */
      evidenceCount: number;
      /** Up to three figures calculated from the key file, shown as tiles (real values, not blurred). */
      figures: { metric: MetricKey; label: string; value: string; period: string | null }[];
      charts: BriefCharts;
    };

export async function teaserVerdict(company: Pick<Company, "id">, useCase: Pick<UseCaseDef, "id" | "keyFile">): Promise<Teaser> {
  const keyItems = new Set(useCase.keyFile?.items ?? []);
  if (!keyItems.size) return { state: "no_file" };
  const docs = await db.select().from(schema.documents).where(eq(schema.documents.companyId, company.id));
  const keyDocs = docs.filter((d) => d.dataItemKeys.some((k) => keyItems.has(k))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latest = keyDocs[0];
  if (!latest) return { state: "no_file" };
  if (latest.status === "uploaded" || latest.status === "analyzing") return { state: "reading", filename: latest.filename };
  const analysed = keyDocs.filter((d) => d.analysis);
  if (!analysed.length) return { state: "unreadable", filename: latest.filename, error: latest.error };

  const points = await db
    .select()
    .from(schema.dataPoints)
    .where(and(eq(schema.dataPoints.companyId, company.id), ne(schema.dataPoints.status, "rejected")));
  const profileIds = new Set(
    (await db.select({ id: schema.intakeResponses.dataPointId }).from(schema.intakeResponses).where(eq(schema.intakeResponses.companyId, company.id))).map((r) => r.id).filter(Boolean),
  );
  points.sort((a, b) => figureRank({ ...a, fromProfile: profileIds.has(a.id) }, { ...b, fromProfile: profileIds.has(b.id) }));
  const best = new Map<MetricKey, (typeof points)[number]>();
  for (const p of points) if (isMetricKey(p.metric) && !best.has(p.metric)) best.set(p.metric, p);
  const figures: Figure[] = [...best.entries()].map(([metric, p]) => ({
    metric,
    value: p.value,
    period: p.period,
    origin: p.origin,
    confirmed: p.status === "accepted",
    ...(p.calc?.sampleSize !== undefined ? { sampleSize: p.calc.sampleSize } : {}),
  }));
  const analyses = analysed.map((d) => d.analysis!);
  const dx = diagnose(useCase.id, figures, analyses);
  const top = dx.certainty === "unresolved" ? null : dx.candidates[0];
  const fromKeyFile = new Set(analysed.map((d) => d.id));
  const shown = KEY_METRICS[useCase.id]
    .concat(["arr", "arr_growth", "nrr", "grr", "win_rate", "sales_cycle_days", "acv"].filter((m) => !KEY_METRICS[useCase.id].includes(m as MetricKey)) as MetricKey[])
    .map((m) => best.get(m))
    .filter((p): p is (typeof points)[number] => Boolean(p && p.origin === "calculated" && p.documentId && fromKeyFile.has(p.documentId)))
    .slice(0, 3)
    .map((p) => ({ metric: p.metric as MetricKey, label: METRICS[p.metric as MetricKey].label, value: formatMetric(p.metric as MetricKey, p.value), period: p.period }));
  return {
    state: "ready",
    filename: latest.filename,
    headline: top?.title ?? null,
    impactArr: top?.impactArr ?? null,
    certainty: dx.certainty,
    evidenceCount: top ? top.supporting.length + top.context.length : 0,
    figures: shown,
    charts: chartsFromAnalyses(analysed.map((d) => ({ filename: d.filename, analysis: d.analysis! }))),
  };
}
