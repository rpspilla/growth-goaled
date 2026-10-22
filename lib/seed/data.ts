/**
 * Seed rows for the Acme AI sample company (all environments) and the fake
 * advisory portfolio (staging only). Figures come from the prototype's
 * prototype/src/data/mock.ts and are illustrative, not market data.
 */
import type { BenchmarkContent } from "@/lib/deliverables/benchmark";
import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import { seedId } from "./ids";
import type * as schema from "@/lib/db/schema";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];
type S = typeof schema;

const HOUR = 60 * 60 * 1000;

export const SEED_USERS = {
  advisor: seedId("user:advisor-jamie"),
  acmeFounder: seedId("user:founder-acme"),
};
export const ACME_ID = seedId("company:acme-ai");
const COHORT_ID = seedId("cohort:sample-series-a");
const SOURCE_ID = seedId("source:sample-cohort");
const RUBRIC_ID = seedId("rubric:sample-default");
const DELIVERABLE_ID = seedId("deliverable:acme-benchmark-v1");

/** Onboarding revenue band for a known ARR. */
function bandFor(arr: number): Insert<S["companies"]>["revenueBand"] {
  if (arr < 1_000_000) return "lt_1m";
  if (arr < 3_000_000) return "1m_3m";
  if (arr < 10_000_000) return "3m_10m";
  if (arr < 20_000_000) return "10m_20m";
  return "20m_50m";
}

const dp = (company: string, metric: string) => seedId(`dp:${company}:${metric}`);
const bm = (metric: string) => seedId(`bm:sample:${metric}`);

export function users(): Insert<S["users"]>[] {
  const onboardedAt = new Date();
  return [
    {
      id: SEED_USERS.advisor,
      authUserId: "seed:advisor-jamie",
      email: "jamie.sterling@example.com",
      name: "Jamie Sterling",
      title: "Lead Advisor",
      role: "advisor",
      onboardedAt,
    },
    {
      id: SEED_USERS.acmeFounder,
      authUserId: "seed:founder-acme",
      email: "sam@acme-ai.example",
      name: "Sam Avery",
      title: "CEO & Co-founder",
      role: "founder",
      onboardedAt,
    },
  ];
}

// ---------------------------------------------------------------------------
// Benchmark cohort (illustrative)
// ---------------------------------------------------------------------------

/** median / top quartile, from mock.ts benchmarkMetrics */
const COHORT: Record<string, { median: number; top: number }> = {
  arr_growth: { median: 58, top: 89 },
  nrr: { median: 104, top: 119 },
  sales_cycle_days: { median: 78, top: 61 },
  ae_productivity: { median: 920_000, top: 1_200_000 },
  cac_payback_months: { median: 14, top: 11 },
  win_rate: { median: 21, top: 24 },
  grr: { median: 88, top: 94 },
};

export function benchmark() {
  const source: Insert<S["benchmarkSources"]> = {
    id: SOURCE_ID,
    name: "Growth Goaled sample cohort (illustrative)",
    publisher: "Growth Goaled",
    year: 2026,
    type: "advisory",
    licenceNote: "Internal demo data",
    notes: "Illustrative figures for the Acme AI sample company. Not real market data and never used for real companies.",
  };
  const cohort: Insert<S["benchmarkCohorts"]> = {
    id: COHORT_ID,
    name: "Series A B2B SaaS · founder-led (sample)",
    criteria: { stage: ["Series A"], arr_min: 2_000_000, arr_max: 10_000_000, model: "B2B SaaS", gtm_motion: "Founder-led → scaled GTM" },
    description: "Illustrative cohort used by the sample company.",
    companyCount: 14,
    isSample: true,
  };
  const metrics: Insert<S["benchmarkMetrics"]>[] = Object.entries(COHORT).map(([metric, v]) => ({
    id: bm(metric),
    cohortId: COHORT_ID,
    metric,
    median: v.median,
    p75: v.top,
    sampleSize: 14,
    sourceId: SOURCE_ID,
    period: "2026",
    status: "approved",
    approvedBy: SEED_USERS.advisor,
  }));
  return { source, cohort, metrics };
}

export function rubric(): Insert<S["scoreRubrics"]> {
  return {
    id: RUBRIC_ID,
    advisorId: SEED_USERS.advisor,
    name: "Growth Intelligence Score (sample)",
    isDefault: true,
    criteria: [
      { metric: "arr_growth", weight: 0.3, bands: [{ min: null, max: 40, points: 40 }, { min: 40, max: 80, points: 75 }, { min: 80, max: null, points: 100 }] },
      { metric: "nrr", weight: 0.25, bands: [{ min: null, max: 100, points: 40 }, { min: 100, max: 115, points: 70 }, { min: 115, max: null, points: 100 }] },
      { metric: "ae_productivity", weight: 0.25, bands: [{ min: null, max: 800_000, points: 40 }, { min: 800_000, max: 1_100_000, points: 60 }, { min: 1_100_000, max: null, points: 100 }] },
      { metric: "win_rate", weight: 0.2, bands: [{ min: null, max: 20, points: 50 }, { min: 20, max: null, points: 90 }] },
    ],
    labels: [
      { min: 0, max: 49, label: "Significant constraints across the growth engine." },
      { min: 50, max: 69, label: "Solid base with clear gaps to close." },
      { min: 70, max: 84, label: "Strong foundation. Efficiency is the constraint." },
      { min: 85, max: 100, label: "Top-quartile growth engine." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Acme AI
// ---------------------------------------------------------------------------

/** Accepted operating data, from mock.ts acmeAI / benchmarkMetrics. */
const ACME_METRICS: Record<string, number> = {
  arr: 4_200_000,
  arr_growth: 72,
  nrr: 108,
  grr: 91,
  acv: 42_000,
  sales_cycle_days: 94,
  ae_productivity: 840_000,
  cac_payback_months: 16,
  win_rate: 28,
  customers: 87,
  employees: 38,
  sales_reps: 5,
  sdrs: 2,
};

const ROW_ORDER: MetricKey[] = ["arr_growth", "nrr", "sales_cycle_days", "ae_productivity", "cac_payback_months", "win_rate", "grr"];

export function acme() {
  const company: Insert<S["companies"]> = {
    id: ACME_ID,
    name: "Acme AI",
    website: "https://acme-ai.com",
    industry: "AI / Automation",
    stage: "Series A",
    arr: 4_200_000,
    revenueBand: bandFor(4_200_000),
    growthPct: 72,
    funding: 8_500_000,
    employees: 38,
    customers: 87,
    acv: 42_000,
    nrr: 108,
    grr: 91,
    salesCycleDays: 94,
    primarySegment: "Mid-market",
    salesModel: "Founder-led",
    founderLed: true,
    phase: "benchmark",
    health: "watch",
    advisorId: SEED_USERS.advisor,
    isSample: true,
  };

  const member: Insert<S["companyMembers"]> = {
    id: seedId("member:acme-founder"),
    companyId: ACME_ID,
    userId: SEED_USERS.acmeFounder,
    memberRole: "owner",
  };

  const dataPoints: Insert<S["dataPoints"]>[] = Object.entries(ACME_METRICS).map(([metric, value]) => ({
    id: dp("acme", metric),
    companyId: ACME_ID,
    metric,
    value,
    unit: METRICS[metric as MetricKey].unit,
    rawText: metric === "sales_cycle_days" ? "CRM operating data: average sales cycle 94 days" : "Company-provided operating data",
    period: "Q3 2026",
    confidence: "high",
    status: "accepted",
    acceptedBy: SEED_USERS.advisor,
  }));
  // The board deck reported a shorter cycle; kept as a proposed (unaccepted) value behind the conflict below.
  const boardDeckCycle = seedId("dp:acme:sales_cycle_days:board-deck");
  dataPoints.push({
    id: boardDeckCycle,
    companyId: ACME_ID,
    metric: "sales_cycle_days",
    value: 62,
    unit: "days",
    rawText: "Board deck: average sales cycle 62 days",
    period: "Q2 2026",
    confidence: "medium",
    status: "proposed",
  });

  const registerItems: Insert<S["registerItems"]>[] = [
    {
      id: seedId("register:acme:sales-cycle-conflict"),
      companyId: ACME_ID,
      type: "conflict",
      title: "Conflicting sales-cycle data",
      description:
        "We found conflicting sales-cycle data between your board deck (62 days) and your current CRM operating data (94 days). This gap materially affects your benchmark position.",
      dataPointIds: [boardDeckCycle, dp("acme", "sales_cycle_days")],
      owner: "founder",
    },
    {
      id: seedId("register:acme:gross-margin"),
      companyId: ACME_ID,
      type: "missing",
      title: "Gross margin not provided",
      description: "Gross margin is required to calculate your CAC payback period accurately. Your financial model did not include this figure.",
      owner: "founder",
    },
    {
      id: seedId("register:acme:sdr-quota"),
      companyId: ACME_ID,
      type: "assumption",
      title: "Assumption: SDR quota",
      description: "We assumed a $500K pipeline quota per SDR based on benchmark cohort norms. Confirm or correct this assumption.",
      owner: "founder",
    },
  ];

  const score: Insert<S["companyScores"]> = {
    id: seedId("score:acme"),
    companyId: ACME_ID,
    rubricId: RUBRIC_ID,
    overrideScore: 72,
    overrideNote: "Sample score set by the advisor.",
    breakdown: [
      { label: "Sales efficiency", score: 45 },
      { label: "Growth rate", score: 78 },
      { label: "Retention", score: 71 },
      { label: "Pipeline quality", score: 84 },
    ],
    computedAt: new Date(),
  };

  return { company, member, dataPoints, registerItems, score, ...acmeBenchmarkDeliverable() };
}

function acmeBenchmarkDeliverable() {
  const v = (m: MetricKey) => formatMetric(m, ACME_METRICS[m]!);
  const top = (m: MetricKey) => formatMetric(m, COHORT[m]!.top);
  const median = (m: MetricKey) => formatMetric(m, COHORT[m]!.median);

  const content: BenchmarkContent = {
    cohortId: COHORT_ID,
    rows: ROW_ORDER.map((metric) => ({
      metric,
      dataPointId: dp("acme", metric),
      benchmarkMetricId: bm(metric),
      claimKey: `row.${metric}`,
    })),
    insight: {
      headline: "Your biggest gap is sales efficiency, not pipeline generation.",
      body:
        "Acme AI outperforms the cohort on win rate, suggesting the top-of-funnel and product are strong. The constraint is in the sales cycle (94 vs. 61 days) and AE productivity ($840K vs. $1.2M). Expanding headcount before fixing efficiency would increase burn without improving growth rate.",
      claimKey: "insight",
    },
    summary: {
      strengths: [
        { text: `Growth above cohort median (${v("arr_growth")} vs. ${median("arr_growth")})`, claimKey: "strength.growth" },
        { text: `Attractive ACV for stage (${v("acv")})`, claimKey: "strength.acv" },
        { text: `Win rate above top quartile (${v("win_rate")} vs. ${top("win_rate")})`, claimKey: "strength.win_rate" },
      ],
      watchAreas: [
        { text: "Sales cycle (+33 days vs. benchmark)", claimKey: "watch.sales_cycle" },
        { text: "AE productivity ($360K below top quartile)", claimKey: "watch.ae_productivity" },
        { text: `NRR below top quartile (${v("nrr")} vs. ${top("nrr")})`, claimKey: "watch.nrr" },
      ],
      priority: { text: "Improve sales efficiency before increasing headcount.", claimKey: "priority" },
    },
    methodology:
      "Companies matched on funding stage (Series A), ARR band ($2M–$10M), business model (B2B SaaS) and primary GTM motion (founder-led). Cohort size n=14. Status compares each metric with the cohort's top quartile. Sample cohort: illustrative figures.",
  };

  const deliverable: Insert<S["deliverables"]> = {
    id: DELIVERABLE_ID,
    companyId: ACME_ID,
    type: "benchmark",
    version: 1,
    status: "published",
    content,
    headline: content.insight.headline,
  };

  type Src = { kind: "data_point" | "benchmark_metric" | "methodology"; refId?: string; note?: string };
  const pair = (m: MetricKey): Src[] => [
    { kind: "data_point", refId: dp("acme", m) },
    { kind: "benchmark_metric", refId: bm(m) },
  ];
  const method: Src = { kind: "methodology", note: content.methodology };

  const claimDefs: { key: string; text: string; sources: Src[] }[] = [
    ...ROW_ORDER.map((m) => ({
      key: `row.${m}`,
      text: `${METRICS[m].label}: ${v(m)} vs. cohort median ${median(m)} and top quartile ${top(m)}.`,
      sources: [...pair(m), method],
    })),
    {
      key: "insight",
      text: content.insight.headline,
      sources: [...pair("win_rate"), ...pair("sales_cycle_days"), ...pair("ae_productivity"), method],
    },
    { key: "strength.growth", text: content.summary.strengths[0]!.text, sources: pair("arr_growth") },
    { key: "strength.acv", text: content.summary.strengths[1]!.text, sources: [{ kind: "data_point", refId: dp("acme", "acv") }] },
    { key: "strength.win_rate", text: content.summary.strengths[2]!.text, sources: pair("win_rate") },
    { key: "watch.sales_cycle", text: content.summary.watchAreas[0]!.text, sources: pair("sales_cycle_days") },
    { key: "watch.ae_productivity", text: content.summary.watchAreas[1]!.text, sources: pair("ae_productivity") },
    { key: "watch.nrr", text: content.summary.watchAreas[2]!.text, sources: pair("nrr") },
    {
      key: "priority",
      text: content.summary.priority.text,
      sources: [...pair("sales_cycle_days"), ...pair("ae_productivity"), method],
    },
  ];

  const claims: Insert<S["claims"]>[] = claimDefs.map((c) => ({
    id: seedId(`claim:acme-benchmark:${c.key}`),
    deliverableId: DELIVERABLE_ID,
    claimKey: c.key,
    text: c.text,
    confidence: "high",
  }));
  const claimSources: Insert<S["claimSources"]>[] = claimDefs.flatMap((c) =>
    c.sources.map((s, i) => ({
      id: seedId(`claim-source:acme-benchmark:${c.key}:${i}`),
      claimId: seedId(`claim:acme-benchmark:${c.key}`),
      kind: s.kind,
      refId: s.refId ?? null,
      note: s.note ?? null,
    })),
  );

  const approvedAt = new Date(Date.now() - 2 * HOUR);
  const review: Insert<S["reviews"]> = {
    id: seedId("review:acme-benchmark-v1"),
    deliverableId: DELIVERABLE_ID,
    version: 1,
    qaResults: {
      data_consistency: { result: "pass" },
      benchmark_methodology: { result: "pass" },
      source_trail: { result: "pass" },
      recommendation_logic: { result: "pass" },
      missing_inputs: { result: "pass", note: "1 assumption flagged" },
    },
    decision: "approve",
    comment: "Sales efficiency diagnosis is accurate. I agree with the recommended priority.",
    reviewerId: SEED_USERS.advisor,
    createdAt: approvedAt,
    updatedAt: approvedAt,
  };

  return { deliverable, claims, claimSources, review };
}

// ---------------------------------------------------------------------------
// Fake portfolio (staging only) — mock.ts portfolioCompanies minus Acme
// ---------------------------------------------------------------------------

type PortfolioDef = {
  slug: string;
  name: string;
  stage: string;
  arr: number;
  growth: number;
  health: "good" | "watch" | "critical";
  phase: Insert<S["companies"]>["phase"];
  gis: number;
  assigned: boolean;
};

const PORTFOLIO: PortfolioDef[] = [
  { slug: "beta-health", name: "Beta Health", stage: "Series A", arr: 7_100_000, growth: 94, health: "good", phase: "channels", gis: 81, assigned: true },
  { slug: "gamma-fintech", name: "Gamma Fintech", stage: "Series A", arr: 3_800_000, growth: 48, health: "critical", phase: "baseline", gis: 58, assigned: true },
  // Left unassigned so the advisor Unassigned queue has something in it.
  { slug: "delta-ai", name: "Delta AI", stage: "Seed", arr: 1_400_000, growth: 112, health: "good", phase: "icp", gis: 77, assigned: false },
  { slug: "epsilon-saas", name: "Epsilon SaaS", stage: "Series A", arr: 9_200_000, growth: 61, health: "watch", phase: "hiring", gis: 68, assigned: true },
  { slug: "zeta-commerce", name: "Zeta Commerce", stage: "Series B+", arr: 18_400_000, growth: 55, health: "good", phase: "complete", gis: 85, assigned: true },
  { slug: "eta-robotics", name: "Eta Robotics", stage: "Series A", arr: 5_700_000, growth: 83, health: "good", phase: "complete", gis: 79, assigned: true },
];

export const PORTFOLIO_IDS = PORTFOLIO.map((p) => seedId(`company:${p.slug}`));

export function portfolio() {
  const companies: Insert<S["companies"]>[] = [];
  const dataPoints: Insert<S["dataPoints"]>[] = [];
  const scores: Insert<S["companyScores"]>[] = [];

  for (const p of PORTFOLIO) {
    const id = seedId(`company:${p.slug}`);
    companies.push({
      id,
      name: p.name,
      stage: p.stage,
      arr: p.arr,
      revenueBand: bandFor(p.arr),
      growthPct: p.growth,
      phase: p.phase,
      health: p.health,
      advisorId: p.assigned ? SEED_USERS.advisor : null,
    });
    for (const [metric, value] of [["arr", p.arr], ["arr_growth", p.growth]] as const) {
      dataPoints.push({
        id: dp(p.slug, metric),
        companyId: id,
        metric,
        value,
        unit: METRICS[metric].unit,
        rawText: "Company-provided operating data (staging fixture)",
        period: "Q3 2026",
        confidence: "high",
        status: "accepted",
        acceptedBy: SEED_USERS.advisor,
      });
    }
    scores.push({
      id: seedId(`score:${p.slug}`),
      companyId: id,
      rubricId: RUBRIC_ID,
      overrideScore: p.gis,
      overrideNote: "Staging fixture score.",
      computedAt: new Date(),
    });
  }
  return { companies, dataPoints, scores };
}

export const SAMPLE_IDS = { cohort: COHORT_ID, source: SOURCE_ID, rubric: RUBRIC_ID, deliverable: DELIVERABLE_ID };
