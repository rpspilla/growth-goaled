import { formatMetric, type MetricKey } from "@/lib/metrics";
import { incompatible, type CandidateRecord } from "./match";

/**
 * Growth Goaled's standard reference: assumptions used only when no published data or Growth
 * Goaled customer data fits a company. They live in the Benchmark Library like any other dataset
 * (a source flagged "standard reference"), so admins edit and version them; everything here reads
 * the published version. Always shown labelled as an assumption with its basis.
 */

export type ReferencePoint = { label: string; value: number; formatted: string };
export type ReferenceSpread = { bottom: ReferencePoint; median: ReferencePoint; top: ReferencePoint; elite: string | null; metricLabel: string; basis: string };
export type GrowthPath = { rules: { from: number; to: number | null; multiplier: number }[]; basis: string };

export const isReference = (r: CandidateRecord) => Boolean(r.source.standardReference);

/** A published band as text: "20–25%", "200%+", "under 80%", or the value. */
export function bandText(metric: MetricKey, r: Pick<CandidateRecord, "value" | "valueLow" | "valueHigh">): string {
  const f = (v: number) => formatMetric(metric, v);
  if (r.valueLow !== null && r.valueHigh !== null) return `${f(r.valueLow).replace(/%$/, "")}–${f(r.valueHigh)}`;
  if (r.valueLow !== null) return `${f(r.valueLow)}+`;
  if (r.valueHigh !== null) return `under ${f(r.valueHigh)}`;
  return r.value !== null ? f(r.value) : "";
}

/** The same band as annual gross churn (100% minus gross retention): 88–90% retention is "10–12%" churn. */
export function churnText(r: Pick<CandidateRecord, "value" | "valueLow" | "valueHigh">): string {
  const c = (v: number) => +(100 - v).toFixed(1);
  if (r.valueLow !== null && r.valueHigh !== null) return `${c(r.valueHigh)}–${c(r.valueLow)}%`;
  if (r.valueLow !== null) return `under ${c(r.valueLow)}%`;
  if (r.valueHigh !== null) return `over ${c(r.valueHigh)}%`;
  return r.value !== null ? `about ${c(r.value)}%` : "";
}

const basisOf = (r: CandidateRecord) =>
  `Growth Goaled's standard reference (${r.datasetName}, version ${r.version}).${r.methodology ? ` ${r.methodology}` : ""} It's an assumption, used only because no published or Growth Goaled data fits your company yet.`;

const pct = (r: CandidateRecord) => (r.statistic === "median" ? 50 : r.statistic === "percentile" ? r.percentile : null);
const eligible = (rows: readonly CandidateRecord[], metric: MetricKey) =>
  rows.filter((r) => isReference(r) && r.metric === metric && !incompatible(r, metric, "customer_report") && r.value !== null && pct(r) !== null);
const cohortWide = (r: CandidateRecord) => r.arrMin === null && r.arrMax === null && !r.stages.length && !r.industry;

/**
 * Bottom quartile, median and top quartile (and the elite tier above it, if published) for a
 * metric. `asChurn` shows gross retention as churn. Null when the reference doesn't cover it.
 */
export function referenceSpread(metric: MetricKey, rows: readonly CandidateRecord[], { asChurn = false, metricLabel }: { asChurn?: boolean; metricLabel: string }): ReferenceSpread | null {
  const own = eligible(rows, metric).filter(cohortWide);
  const latest = Math.max(...own.map((r) => r.version));
  const ranked = own.filter((r) => r.version === latest).sort((a, b) => pct(a)! - pct(b)!);
  const bottom = [...ranked].reverse().find((r) => pct(r)! <= 30);
  const median = ranked.find((r) => pct(r) === 50);
  const top = ranked.find((r) => pct(r)! >= 70);
  if (!bottom || !median || !top) return null;
  const elite = ranked.filter((r) => pct(r)! > pct(top)!).at(-1);
  const text = (r: CandidateRecord) => (asChurn ? churnText(r) : bandText(metric, r));
  const point = (r: CandidateRecord, label: string): ReferencePoint => ({ label, value: r.value!, formatted: text(r) });
  return {
    bottom: point(bottom, "Bottom quartile"),
    median: point(median, "Median"),
    top: point(top, "Top quartile"),
    elite: elite ? (asChurn ? `World-class companies lose ${text(elite)} a year.` : `Elite companies grow ${text(elite)} a year.`) : null,
    metricLabel,
    basis: basisOf(top),
  };
}

/**
 * The growth path (T2D3 in the default reference): growth by ARR band, e.g. 200% (triple) from
 * $1M to $6M and 100% (double) from $6M. Read from the reference's ARR-banded growth records.
 */
export function growthPath(rows: readonly CandidateRecord[]): GrowthPath | null {
  const own = eligible(rows, "arr_growth").filter((r) => r.arrMin !== null);
  if (!own.length) return null;
  const latest = Math.max(...own.map((r) => r.version));
  const rules = own
    .filter((r) => r.version === latest)
    .sort((a, b) => a.arrMin! - b.arrMin!)
    .map((r) => ({ from: r.arrMin!, to: r.arrMax, multiplier: 1 + r.value! / 100 }));
  return { rules, basis: basisOf(own.find((r) => r.version === latest)!) };
}

const step = (path: GrowthPath, v: number) => {
  const rule = path.rules.find((r) => v >= r.from && (r.to === null || v < r.to)) ?? path.rules.at(-1)!;
  return v * rule.multiplier;
};

/** The path's first five years from a starting ARR, e.g. $1M → $3M → $9M → $18M → $36M. */
export function pathYears(path: GrowthPath, start: number): { year: number; arr: number; multiplier: number }[] {
  const out: { year: number; arr: number; multiplier: number }[] = [];
  let v = start;
  for (let year = 1; year <= 5; year++) {
    const next = step(path, v);
    out.push({ year, arr: v, multiplier: +(next / v).toFixed(2) });
    v = next;
  }
  return out;
}

/** Next year's ARR on the path, for an exact ARR or a range. Below the path's start, reaching it is the target. */
export function pathTarget(path: GrowthPath, arr: { lo: number | null; hi: number | null; exact: number | null }): string {
  const start = path.rules[0]!.from;
  const f = (v: number) => formatMetric("arr", v);
  const lo = arr.exact ?? arr.lo;
  const hi = arr.exact ?? arr.hi;
  const begin = `reach ${f(start)}–${f(start * 2)} ARR, where the path (and a typical Series A) starts`;
  if (hi !== null && hi <= start) return begin;
  if (lo === null || lo < start) return hi !== null ? `reach up to ${f(step(path, hi))} ARR next year` : begin;
  if (hi === null) return `reach at least ${f(step(path, lo))} ARR next year`;
  if (lo === hi) {
    const m = step(path, lo) / lo;
    return `reach ${f(step(path, lo))} ARR next year (${m === 3 ? "triple" : m === 2 ? "double" : `${+m.toFixed(1)}×`} today's)`;
  }
  return `reach ${f(step(path, lo))}–${f(step(path, hi))} ARR next year`;
}
