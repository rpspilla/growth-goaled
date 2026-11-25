import "server-only";
import { and, desc, eq, inArray, isNotNull, like, ne, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { getIntakeAnswers } from "@/lib/data/intake";
import { companyPerformance } from "@/lib/data/performance";
import { answerKey, INTAKE_SECTIONS } from "@/lib/intake";
import { formatMetric, METRICS } from "@/lib/metrics";
import { driftSignals, isOverdue, OUTCOMES } from "@/lib/commitments";
import { companyCommitments } from "@/lib/data/commitments";
import { currentPriorities, today } from "@/lib/data/projects";

/** Pay and equity records in the Benchmark Library use these metric-id prefixes (e.g. comp_ae_base, equity_first_sales_hire). */
export const COMPENSATION_METRIC_PREFIXES = ["comp_", "equity_"] as const;

export type ChatContext = {
  company: Record<string, string | number | null>;
  answers: { question: string; answer: string }[];
  figures: { metric: string; value: string; period: string | null; basis: string }[];
  facts: { key: string; label: string; value: string; status: string }[];
  /** The work under way (AI CRO sprint): growth projects, the commitments in them, this week's priorities, approved results. */
  work: {
    projects: { name: string; status: string; started: string; completed: string | null; from_conversation: string | null }[];
    commitments: { title: string; owner: string; due: string | null; measure: string | null; status: string; overdue: boolean; project: string; outcome: string | null; outcome_note: string | null }[];
    priorities: { week: string; current: boolean; items: { title: string; action: string; due: string | null }[] } | null;
    results: { project: string; label: string; value: string | null; note: string | null }[];
    /** Patterns worth raising: commitments that keep moving, long overdue, or a run of drops. */
    attention: string[];
  };
  /** Earlier conversations, newest first (not the current one): what was asked and decided. */
  earlierConversations: { date: string; question: string; perspective: string; takeaway: string | null; recommendation: string | null; committed: boolean }[];
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
export async function chatContext(company: Company, opts: { compensation: boolean; conversationId?: string }): Promise<ChatContext> {
  const [answers, perf, facts, work, earlier, comp] = await Promise.all([
    getIntakeAnswers(company),
    companyPerformance(company),
    db.select().from(schema.companyFacts).where(eq(schema.companyFacts.companyId, company.id)).orderBy(schema.companyFacts.key),
    openWork(company),
    earlierConversations(company, opts.conversationId ?? null),
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
    work,
    earlierConversations: earlier,
    compensationData: comp,
  };
}

/** Open projects (and the last two completed), open commitments plus the last five closed, this week's priorities, approved results. */
async function openWork(company: Company): Promise<ChatContext["work"]> {
  const on = today();
  const [projects, priorities] = await Promise.all([
    db.select().from(schema.growthProjects).where(eq(schema.growthProjects.companyId, company.id)).orderBy(desc(schema.growthProjects.startedOn)),
    currentPriorities(company, on),
  ]);
  const shown = [...projects.filter((p) => p.status === "open").slice(0, 10), ...projects.filter((p) => p.status === "completed").slice(0, 2)];
  const ids = shown.map((p) => p.id);
  const sourceIds = shown.flatMap((p) => (p.conversationId ? [p.conversationId] : []));
  const [commitments, results, sources] = await Promise.all([
    companyCommitments(company, { projectIds: ids }),
    ids.length
      ? db
          .select()
          .from(schema.projectResults)
          .where(and(inArray(schema.projectResults.projectId, ids), isNotNull(schema.projectResults.approvedAt)))
          .limit(20)
      : Promise.resolve([]),
    sourceIds.length
      ? db.select({ id: schema.conversations.id, title: schema.conversations.title }).from(schema.conversations).where(inArray(schema.conversations.id, sourceIds))
      : Promise.resolve([]),
  ]);
  const name = new Map(shown.map((p) => [p.id, p.name]));
  const titles = new Map(sources.map((c) => [c.id, c.title]));
  const open = commitments.filter((c) => c.status === "open").slice(0, 15);
  const closed = commitments.filter((c) => c.status !== "open").slice(0, 8);
  return {
    projects: shown.map((p) => ({ name: p.name, status: p.status, started: p.startedOn, completed: p.completedOn, from_conversation: p.conversationId ? (titles.get(p.conversationId) ?? null) : null })),
    commitments: [...open, ...closed].map((c) => ({ title: c.title, owner: c.owner, due: c.dueOn, measure: c.measure, status: c.status, overdue: isOverdue(c, on), project: name.get(c.projectId) ?? "", outcome: c.outcome ? OUTCOMES[c.outcome] : null, outcome_note: c.outcomeNote })),
    priorities: priorities ? { week: priorities.weekStart, current: priorities.current, items: priorities.items.map((p) => ({ title: p.title, action: p.action, due: p.dueOn })) } : null,
    results: results.map((r) => ({ project: name.get(r.projectId) ?? "", label: r.label, value: r.value, note: r.note })),
    attention: driftSignals(commitments, on),
  };
}

/** The latest ten other conversations: the question, and the latest recommendation in each (if any) and whether it was committed. */
async function earlierConversations(company: Company, current: string | null): Promise<ChatContext["earlierConversations"]> {
  const convs = await db
    .select({ id: schema.conversations.id, title: schema.conversations.title, updatedAt: schema.conversations.updatedAt, cro: schema.croProfiles.name })
    .from(schema.conversations)
    .leftJoin(schema.croProfiles, eq(schema.croProfiles.id, schema.conversations.croId))
    .where(and(eq(schema.conversations.companyId, company.id), ...(current ? [ne(schema.conversations.id, current)] : [])))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(10);
  if (!convs.length) return [];
  const recs = await db
    .select({ conversationId: schema.recommendations.conversationId, card: schema.recommendations.card, status: schema.recommendations.status, createdAt: schema.recommendations.createdAt })
    .from(schema.recommendations)
    .where(inArray(schema.recommendations.conversationId, convs.map((c) => c.id)))
    .orderBy(desc(schema.recommendations.createdAt));
  return convs.map((c) => {
    const rec = recs.find((r) => r.conversationId === c.id);
    return {
      date: c.updatedAt.toISOString().slice(0, 10),
      question: c.title,
      // Whose perspective it was: a different CRO's advice is weighed as theirs, not repeated as this one's
      perspective: c.cro ? `${c.cro}'s CRO-Brain` : "Rally Collective Brain",
      takeaway: rec?.card.takeaway ?? null,
      recommendation: rec?.card.recommendation ?? null,
      committed: recs.some((r) => r.conversationId === c.id && r.status === "committed"),
    };
  });
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
