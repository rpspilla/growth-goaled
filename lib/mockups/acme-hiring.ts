/**
 * V0 mockup data (docs/briefs/2026-10-29-visual-founder-flow.md): Acme AI, the sample
 * company, on "Build a growth hiring plan". Company-level figures and peer quartiles come
 * from the sample seed (prototype/src/data/mock.ts). Per-rep, funnel and pipeline figures
 * are ILLUSTRATIVE and exist only to show the visual direction; they are labelled as such
 * on the page and never reach real reports.
 */

export type Quartiles = { p25: number; median: number; p75: number };

export type PeerMetric = {
  key: string;
  label: string;
  value: number;
  display: string;
  peers: Quartiles;
  lowerIsBetter?: boolean;
  format: (n: number) => string;
};

const usdK = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `$${Math.round(n / 1000)}K`);
const pct = (n: number) => `${n}%`;
const days = (n: number) => `${n}d`;

export const company = { name: "Acme AI", stage: "Series A", question: "Build a growth hiring plan", shortTitle: "Growth Hiring Plan" };

/** Answers from the questionnaire, compared with the sample cohort (Series A B2B SaaS, n=14, illustrative). */
export const peerMetrics: PeerMetric[] = [
  { key: "arr_growth", label: "ARR growth", value: 72, display: "72%", peers: { p25: 41, median: 58, p75: 89 }, format: pct },
  { key: "nrr", label: "Net revenue retention", value: 108, display: "108%", peers: { p25: 97, median: 104, p75: 119 }, format: pct },
  { key: "ae_productivity", label: "New ACV per rep", value: 840_000, display: "$840K", peers: { p25: 700_000, median: 920_000, p75: 1_200_000 }, format: usdK },
  { key: "sales_cycle", label: "Sales cycle", value: 94, display: "94d", peers: { p25: 102, median: 78, p75: 61 }, lowerIsBetter: true, format: days },
];

export const peerSource = "Sample cohort · Series A B2B SaaS · n=14 · illustrative";

export type Signal = { tone: "positive" | "watch" | "info"; title: string; basis: string; why: string };

export const snapshotSignals: Signal[] = [
  { tone: "watch", title: "Reps produce less than peers", basis: "Your answer: $840K new ACV per rep", why: "Peer median is $920K. Adding reps at today's productivity adds cost faster than revenue." },
  { tone: "watch", title: "Deals take 16 days longer", basis: "Your answer: 94-day sales cycle", why: "Peer median is 78 days. Longer cycles mean a new hire takes longer to pay back." },
  { tone: "positive", title: "Win rate beats top quartile", basis: "Your answer: 28% win rate", why: "Top quartile is 24%. Demand and product fit look strong; the constraint is likely efficiency." },
];

export const confirmData = [
  { icon: "users", label: "Rep roster & quotas" },
  { icon: "list", label: "Pipeline export" },
  { icon: "trophy", label: "Won / lost deals" },
  { icon: "mic", label: "3 sales calls" },
] as const;

/* ---------------- Results ---------------- */

export const verdict = { label: "Fix first", tone: "amber" as const, answer: "Raise rep productivity and shorten the cycle before adding headcount." };

export const confidence = { level: "Medium", score: 0.62, basis: "3 of 4 data areas supplied · 2 of 3 sales calls" };

/** ILLUSTRATIVE per-rep figures (average = $840K, matching Acme's reported productivity). */
export const reps = [
  { name: "Rep A", acv: 1_080_000 },
  { name: "Rep B", acv: 960_000 },
  { name: "Rep C", acv: 840_000 },
  { name: "Rep D", acv: 720_000 },
  { name: "Rep E", acv: 600_000 },
];
export const repTarget = 1_000_000;

/** ILLUSTRATIVE funnel for the last 12 months. */
export const funnel = [
  { stage: "Discovery", deals: 214 },
  { stage: "Demo", deals: 168 },
  { stage: "Proposal", deals: 102 },
  { stage: "Negotiation", deals: 78 },
  { stage: "Won", deals: 60 },
];

export const pipelineCoverage = { value: 2.4, target: 3 };

export type Dimension = {
  id: string;
  title: string;
  status: "in" | "partial" | "missing";
  findings: string[];
  evidence: string[];
};

export const dimensions: Dimension[] = [
  {
    id: "capacity",
    title: "Team capacity",
    status: "in",
    findings: ["2 of 5 reps are below $750K", "Top rep is 1.8× the lowest", "Average sits 16% under target"],
    evidence: [
      "Per-rep new ACV from the rep roster and closed-won deals, last 12 months.",
      "Target of $1.0M per rep from your quota file.",
      "Points against: Rep E joined 7 months ago and is still ramping.",
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline and conversion",
    status: "in",
    findings: ["Biggest drop: Demo → Proposal (61%)", "Pipeline covers 2.4× this quarter's target", "Late stages convert well (76–77%)"],
    evidence: ["Stage counts from your CRM export, deals created in the last 12 months.", "Coverage = open pipeline ÷ remaining quarterly target."],
  },
  {
    id: "sales_calls",
    title: "Sales call reviews",
    status: "partial",
    findings: ["Next steps unclear on 2 of 2 calls", "Pricing raised late in both calls"],
    evidence: ["Two call transcripts reviewed. One more is needed for results to publish without advisor review."],
  },
  {
    id: "hiring",
    title: "Hiring profile",
    status: "missing",
    findings: [],
    evidence: [],
  },
];

export type PlanAction = { title: string; kpi: string; owner: string };

export const stagedPlan: { now: PlanAction[]; next: PlanAction[]; later: PlanAction[] } = {
  now: [
    { title: "Add exit criteria to the Demo stage", kpi: "Demo → Proposal", owner: "Founder" },
    { title: "Weekly deal review for every rep", kpi: "New ACV per rep", owner: "Founder" },
  ],
  next: [
    { title: "Mutual action plans on deals over $40K", kpi: "Sales cycle", owner: "Sales" },
    { title: "Coach Reps D and E on discovery", kpi: "Win rate", owner: "Founder" },
  ],
  later: [{ title: "Hire an enterprise AE once reps average $950K+", kpi: "New ACV per rep", owner: "Founder" }],
};

export const dataGaps = [
  { icon: "mic", label: "1 more sales call" },
  { icon: "briefcase", label: "Open roles & comp" },
] as const;
