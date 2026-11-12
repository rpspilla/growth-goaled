import type { DataRequest, RequestField } from "./plan-requests";

/**
 * The Growth Hiring Plan (Nov 12, 2026 call): exactly six founder inputs, and the hiring math
 * worked out from them in code (never by the model). Founder targets are the founder's own figures
 * and are labelled "your target", never presented as analysis.
 */

export const DEFAULT_RAMP_DAYS = 90;
/** Annual gross revenue churn above this (or monthly above LEAKY_MONTHLY) is a leaky bucket: fix it before hiring. */
export const LEAKY_ANNUAL = 15;
export const LEAKY_MONTHLY = 1.25;
const DAYS_PER_MONTH = 30.4375;

type Timing = "next_30_days" | "days_31_60" | "days_61_90";
export type HiringInput = { id: string; title: string; action: string; measure: string; timing: Timing; request: DataRequest };

const f = (key: string, label: string, kind: RequestField["kind"], extra: Partial<RequestField> = {}): RequestField => ({ key, label, kind, ...extra });
const DEALS = ["Deal name", "Owner (founder or AE)", "Created date", "Close date", "Outcome (won or lost)", "Amount"];

/** The six inputs, in order. Field keys are fixed: the math reads them. */
export const HIRING_INPUTS: readonly HiringInput[] = [
  {
    id: "conversion",
    title: "Conversion rate",
    action: "Enter your conversion rate for founder-owned deals and for AE-owned deals.",
    measure: "Whether your sales motion transfers from you to an AE.",
    timing: "next_30_days",
    request: { fields: [f("founder_conversion", "Conversion rate, founder-owned deals", "percent", { hint: "Won ÷ (won + lost), last 12 months" }), f("ae_conversion", "Conversion rate, AE-owned deals", "percent", { hint: "Won ÷ (won + lost), last 12 months" })], columns: DEALS },
  },
  {
    id: "cycle",
    title: "Deal cycle time",
    action: "Enter your average deal cycle time in days, founder-closed and AE-closed.",
    measure: "How long a new AE's deals will take, and how far ahead pipeline is needed.",
    timing: "next_30_days",
    request: { fields: [f("founder_cycle_days", "Average deal cycle, founder-closed", "days"), f("ae_cycle_days", "Average deal cycle, AE-closed", "days")], columns: DEALS },
  },
  {
    id: "acv",
    title: "ACV",
    action: "Enter your average annual contract value (ACV), by segment if you split it, otherwise blended.",
    measure: "How many deals the AE's quota means.",
    timing: "next_30_days",
    request: { fields: [f("acv", "ACV, blended", "currency", { metric: "acv" }), f("acv_by_segment", "ACV by segment (if you split it)", "text", { optional: true, hint: "e.g. SMB $12,000; Mid-market $40,000" })], columns: ["Customer", "Segment", "Annual contract value", "Start date"] },
  },
  {
    id: "ramp",
    title: "Expected ramp time",
    action: "Confirm how long a new AE takes to ramp to full productivity.",
    measure: "When the new AE carries a full quota.",
    timing: "days_31_60",
    request: { fields: [f("ramp_days", "Expected ramp time", "days", { metric: "ramp_months", defaultValue: String(DEFAULT_RAMP_DAYS), defaultLabel: "Default for mid-market: 90 days. Change it if yours differs." })], columns: ["AE", "Start date", "Date at full quota"] },
  },
  {
    id: "churn",
    title: "Churn",
    action: "Enter your gross revenue churn for the last 12 months, so we can check there's no leaky bucket before hiring.",
    measure: "Whether to fix retention before adding sellers.",
    timing: "days_31_60",
    request: { fields: [f("gross_churn", "Gross revenue churn, last 12 months", "percent", { metric: "grr", hint: "ARR lost to cancellations and downgrades ÷ ARR 12 months ago" })], columns: ["Customer", "ARR 12 months ago", "ARR lost", "Date lost"] },
  },
  {
    id: "target",
    title: "Revenue target",
    action: "Enter your revenue target and the date you want to reach it.",
    measure: "The gap the hire has to close.",
    timing: "days_61_90",
    request: { fields: [f("target_arr", "Revenue target (ARR)", "currency"), f("target_date", "Target date", "date")], columns: ["Month", "Target ARR"] },
  },
];

const FIELDS = new Map(HIRING_INPUTS.flatMap((i) => i.request.fields.map((x) => [x.key, { field: x, input: i }] as const)));

/** Pure: a typed answer's value as stored in a figure (ramp in months, churn as gross retention). */
export function figureFromField(key: string, value: string): { metric: string; value: number; unit: string } | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (key === "acv") return { metric: "acv", value: n, unit: "usd" };
  if (key === "ramp_days") return { metric: "ramp_months", value: Math.round((n / DAYS_PER_MONTH) * 10) / 10, unit: "months" };
  if (key === "gross_churn") return { metric: "grr", value: Math.round((100 - n) * 10) / 10, unit: "percent" };
  return null;
}

/** Pure: a stored figure as the input it pre-fills (the newest confirmed value per figure). */
export function prefillFromFigures(figures: Partial<Record<"acv" | "ramp_months" | "grr" | "sales_cycle_days" | "win_rate", number>>): Record<string, string> {
  const out: Record<string, string> = {};
  if (figures.acv !== undefined) out.acv = String(Math.round(figures.acv));
  if (figures.ramp_months !== undefined) out.ramp_days = String(Math.round(figures.ramp_months * DAYS_PER_MONTH));
  if (figures.grr !== undefined) out.gross_churn = String(Math.round((100 - figures.grr) * 10) / 10);
  return out;
}

export type HiringValues = Partial<Record<string, string>>;
export type TrailInput = { label: string; value: string; source: "your answer" | "your target" | "default" | "your data" | "calculated" };
export type TrailStep = { label: string; formula: string; result: string; inputs: TrailInput[] };
export type HiringResult = {
  /** Inputs (and figures) the math still needs, by name. Nothing is guessed in their place. */
  missing: string[];
  /** Said in the plan before any hiring recommendation. */
  leakyBucket: string | null;
  /** Things that make the numbers unusable as they stand (target already met, date passed). */
  problems: string[];
  numbers: {
    gap: number;
    monthsToTarget: number;
    rampMonths: number;
    effectiveMonths: number;
    monthlyQuota: number;
    quota: number;
    coverage: number;
    coverageSource: "stored" | "ae_conversion";
    pipelinePerMonth: number;
    dealsPerMonth: number | null;
    pipelineStartBy: string;
  } | null;
  trail: TrailStep[];
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + Math.round(days) * 86400000).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pure: the hiring math. Gap = target − current ARR by the target date. Ramp is linear, so during
 * ramp the AE produces half. Monthly quota = gap ÷ (months after ramp + half the ramp months);
 * quota = monthly × 12. Coverage = the stored pipeline coverage, else 1 ÷ AE conversion. Pipeline the
 * AE must generate per month = monthly quota × coverage, created one AE deal cycle ahead. The
 * founder's own closing carries on and isn't counted towards the gap. Assumes the AE starts today.
 */
export function computeHiringPlan(values: HiringValues, ctx: { currentArr: number | null; storedCoverage: number | null; today: string }): HiringResult {
  const label = (key: string) => FIELDS.get(key)!.field.label;
  const missing: string[] = [];
  const need = (key: string) => {
    const v = num(values[key]);
    if (v === null) missing.push(label(key));
    return v;
  };
  const target = need("target_arr");
  const targetDate = values.target_date && /^\d{4}-\d{2}-\d{2}$/.test(values.target_date) ? values.target_date : null;
  if (!targetDate) missing.push(label("target_date"));
  const aeConversion = need("ae_conversion");
  const aeCycle = need("ae_cycle_days");
  const acv = num(values.acv);
  const churn = num(values.gross_churn);
  if (churn === null) missing.push(label("gross_churn"));
  if (ctx.currentArr === null) missing.push("Current ARR (add it under Company Details or Performance)");
  const rampAnswered = num(values.ramp_days);
  const rampDays = rampAnswered ?? DEFAULT_RAMP_DAYS;

  const leakyBucket =
    churn !== null && churn > LEAKY_ANNUAL
      ? `Gross revenue churn is ${round1(churn)}% a year, above ${LEAKY_ANNUAL}%: a leaky bucket. Fix retention before hiring, or a new AE's wins drain away as fast as they close.`
      : null;

  const problems: string[] = [];
  const trail: TrailStep[] = [];
  if (target === null || !targetDate || ctx.currentArr === null || aeCycle === null || (aeConversion === null && ctx.storedCoverage === null)) {
    return { missing, leakyBucket, problems, numbers: null, trail };
  }
  const gap = target - ctx.currentArr;
  const monthsToTarget = (Date.parse(`${targetDate}T12:00:00Z`) - Date.parse(`${ctx.today}T12:00:00Z`)) / 86400000 / DAYS_PER_MONTH;
  const rampMonths = rampDays / DAYS_PER_MONTH;
  const effectiveMonths = Math.max(0, monthsToTarget - rampMonths) + Math.min(rampMonths, Math.max(0, monthsToTarget)) / 2;
  if (gap <= 0) problems.push(`Your current ARR (${usd(ctx.currentArr)}) already meets your target (${usd(target)}), so there's no gap for a new AE to close.`);
  if (monthsToTarget <= 0) problems.push("Your target date has passed. Enter a date in the future.");
  else if (effectiveMonths <= 0) problems.push("Your target date is too soon for a new AE to contribute.");
  if (aeConversion !== null && (aeConversion <= 0 || aeConversion > 100)) problems.push("AE conversion should be between 0% and 100%.");
  if (problems.length) return { missing, leakyBucket, problems, numbers: null, trail };

  const monthlyQuota = gap / effectiveMonths;
  const quota = monthlyQuota * 12;
  const coverageSource = ctx.storedCoverage !== null ? ("stored" as const) : ("ae_conversion" as const);
  const coverage = ctx.storedCoverage ?? 100 / aeConversion!;
  const pipelinePerMonth = monthlyQuota * coverage;
  const dealsPerMonth = acv && acv > 0 ? monthlyQuota / acv : null;
  const start = addDays(ctx.today, rampDays - aeCycle);
  const pipelineStartBy = start < ctx.today ? ctx.today : start;

  const ramp: TrailInput = { label: label("ramp_days"), value: `${Math.round(rampDays)} days`, source: rampAnswered === null ? "default" : "your answer" };
  trail.push(
    { label: "Gap to your target", formula: "Revenue target − current ARR", result: usd(gap), inputs: [{ label: label("target_arr"), value: usd(target), source: "your target" }, { label: "Current ARR", value: usd(ctx.currentArr), source: "your data" }] },
    {
      label: "Selling months the AE has",
      formula: "Months after ramp + half the ramp months (ramp is linear: half productive on average)",
      result: `${round1(effectiveMonths)} months`,
      inputs: [{ label: label("target_date"), value: targetDate, source: "your target" }, ramp, { label: "Months to the target date (from today, assuming the AE starts now)", value: `${round1(monthsToTarget)}`, source: "calculated" }],
    },
    { label: "Quota recommendation", formula: "Gap ÷ selling months × 12 (monthly quota × 12)", result: `${usd(quota)} a year (${usd(monthlyQuota)} a month)`, inputs: [{ label: "Gap", value: usd(gap), source: "calculated" }, { label: "Selling months", value: `${round1(effectiveMonths)}`, source: "calculated" }] },
    {
      label: "Pipeline coverage",
      formula: coverageSource === "stored" ? "Your pipeline coverage, as recorded" : "1 ÷ AE conversion rate",
      result: `${round1(coverage)}x`,
      inputs: coverageSource === "stored" ? [{ label: "Pipeline coverage", value: `${round1(coverage)}x`, source: "your data" }] : [{ label: label("ae_conversion"), value: `${aeConversion}%`, source: "your answer" }],
    },
    {
      label: "Pipeline the AE must generate each month",
      formula: "Monthly quota × pipeline coverage, created one AE deal cycle ahead",
      result: `${usd(pipelinePerMonth)} a month, starting by ${pipelineStartBy}`,
      inputs: [{ label: "Monthly quota", value: usd(monthlyQuota), source: "calculated" }, { label: "Coverage", value: `${round1(coverage)}x`, source: coverageSource === "stored" ? "your data" : "calculated" }, { label: label("ae_cycle_days"), value: `${aeCycle} days`, source: "your answer" }, ramp],
    },
  );
  if (dealsPerMonth !== null) trail.push({ label: "Deals a month", formula: "Monthly quota ÷ ACV", result: `${round1(dealsPerMonth)}`, inputs: [{ label: "Monthly quota", value: usd(monthlyQuota), source: "calculated" }, { label: label("acv"), value: usd(acv!), source: "your answer" }] });

  return {
    missing,
    leakyBucket,
    problems,
    numbers: { gap, monthsToTarget, rampMonths, effectiveMonths, monthlyQuota, quota, coverage, coverageSource, pipelinePerMonth, dealsPerMonth, pipelineStartBy },
    trail,
  };
}

/** Pure: the six inputs' answers (typed values) gathered from a plan's items, by field key. */
export function hiringValues(items: { request: DataRequest | null }[]): HiringValues {
  const out: HiringValues = {};
  for (const i of items) for (const [k, v] of Object.entries(i.request?.answer?.values ?? {})) if (FIELDS.has(k)) out[k] = v;
  return out;
}
