import "server-only";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { getIntakeAnswers } from "@/lib/data/intake";
import { companyPerformance } from "@/lib/data/performance";
import { answerKey, INTAKE_SECTIONS } from "@/lib/intake";
import { formatMetric, METRICS } from "@/lib/metrics";

/** Pay and equity records in the Benchmark Library use these metric-id prefixes (e.g. comp_ae_base, equity_first_sales_hire). */
export const COMPENSATION_METRIC_PREFIXES = ["comp_", "equity_"] as const;

export type ChatContext = {
  company: Record<string, string | number | null>;
  answers: { question: string; answer: string }[];
  figures: { metric: string; value: string; period: string | null; basis: string }[];
  facts: { key: string; label: string; value: string; status: string }[];
  plan: { action: string; status: string; timing: string | null }[];
  pastRecommendations: { topic: string; takeaway: string; date: string }[];
  compensationData: {
    source: string;
    metric: string;
    statistic: string;
    value: string;
    cohort: string;
    period: string;
    sampleSize: number | null;
  }[];
};

/** The company characteristics stored with every recommendation. */
export function characteristics(company: Company): Record<string, string | number | null> {
  return {
    name: company.name,
    stage: company.stage,
    industry: company.industry,
    revenue_band: company.revenueBand,
    employees: company.employees,
    arr: company.arr,
    acv: company.acv,
    sales_model: company.salesModel,
    founder_led: company.founderLed === null ? null : company.founderLed ? "yes" : "no",
  };
}

const display = (v: unknown) => (typeof v === "number" ? String(v) : typeof v === "string" ? v : "");

/** Everything Growth Goaled already knows about one company, compact enough to send with each turn. */
export async function chatContext(company: Company, opts: { compensation: boolean }): Promise<ChatContext> {
  const [answers, perf, facts, plan, past, comp] = await Promise.all([
    getIntakeAnswers(company),
    companyPerformance(company),
    db.select().from(schema.companyFacts).where(eq(schema.companyFacts.companyId, company.id)).orderBy(schema.companyFacts.key),
    db
      .select({ action: schema.planActions.action, status: schema.planActions.status, timing: schema.planActions.timing })
      .from(schema.planActions)
      .where(and(eq(schema.planActions.companyId, company.id), inArray(schema.planActions.status, ["not_started", "in_progress"])))
      .orderBy(schema.planActions.priority)
      .limit(10),
    db
      .select({ topic: schema.recommendations.topic, card: schema.recommendations.card, createdAt: schema.recommendations.createdAt })
      .from(schema.recommendations)
      .where(eq(schema.recommendations.companyId, company.id))
      .orderBy(desc(schema.recommendations.createdAt))
      .limit(5),
    opts.compensation ? compensationRecords() : Promise.resolve([]),
  ]);

  const answered: ChatContext["answers"] = [];
  for (const section of INTAKE_SECTIONS) {
    for (const field of section.fields) {
      const v = display(answers[answerKey(section.id, field.id)]);
      if (v.trim()) answered.push({ question: field.label, answer: v.slice(0, 400) });
    }
  }

  return {
    company: characteristics(company),
    answers: answered,
    figures: [...perf.metrics.values()].map((m) => ({
      metric: METRICS[m.metric].label,
      value: formatMetric(m.metric, m.value),
      period: m.period,
      basis: m.origin === "calculated" ? `calculated from their files${m.method ? ` (${m.method})` : ""}` : m.origin === "manual" ? "entered by the founder" : "read from their files",
    })),
    facts: facts.map((f) => ({ key: f.key, label: f.label, value: f.value, status: f.status })),
    plan,
    pastRecommendations: past.map((r) => ({ topic: r.topic, takeaway: r.card.takeaway, date: r.createdAt.toISOString().slice(0, 10) })),
    compensationData: comp,
  };
}

/** Published pay and equity records from sources whose licence allows showing them to customers (e.g. Wellfound, Carta). */
async function compensationRecords(): Promise<ChatContext["compensationData"]> {
  const rows = await db
    .select({ r: schema.benchmarkRecords, source: schema.benchmarkSources.name, year: schema.benchmarkSources.year })
    .from(schema.benchmarkRecords)
    .innerJoin(schema.benchmarkDatasetVersions, eq(schema.benchmarkDatasetVersions.id, schema.benchmarkRecords.versionId))
    .innerJoin(schema.benchmarkDatasets, eq(schema.benchmarkDatasets.id, schema.benchmarkDatasetVersions.datasetId))
    .innerJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkDatasets.sourceId))
    .where(
      and(
        eq(schema.benchmarkDatasetVersions.status, "published"),
        eq(schema.benchmarkSources.allowCustomerDisplay, true),
        or(...COMPENSATION_METRIC_PREFIXES.map((p) => like(schema.benchmarkRecords.metric, `${p}%`))),
      ),
    )
    .limit(200);
  return rows.map(({ r, source, year }) => {
    const v = r.value ?? null;
    const range = r.valueLow !== null && r.valueHigh !== null ? `${r.valueLow}–${r.valueHigh}` : v !== null ? String(v) : "";
    const cohort = [r.stages.join("/"), r.geography, r.industry, r.customerSegment, r.cohortDefinition].filter(Boolean).join(" · ");
    return {
      source: year ? `${source} (${year})` : source,
      metric: `${r.displayName} [${r.unit}]`,
      statistic: r.statistic === "percentile" && r.percentile ? `p${r.percentile}` : r.statistic,
      value: range,
      cohort: cohort || "all companies in the source",
      period: r.period,
      sampleSize: r.sampleSize,
    };
  });
}
