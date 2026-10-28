import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import type { BenchmarkMatch, CandidateRecord } from "./match";
import { describeCohort, PERIOD_BASIS_LABEL, statisticLabel } from "./records";
import { bandText } from "./reference";

/**
 * Deterministic benchmark comparisons. Every number shown in a comparison is either the
 * company's own figure (observed), a published value (benchmark), or computed here from those
 * two (derived). The interpretation is a fixed sentence: it says where the company sits, never why.
 */

export type ComparisonStat = { recordId: string; statistic: string; value: number | null; low: number | null; high: number | null; formatted: string; percentile: number | null };

export type BenchmarkComparison = {
  metric: MetricKey;
  label: string;
  quality: "strong" | "directional";
  selection: "auto" | "override";
  /** Set when this is Growth Goaled's standard reference (an assumption), with why no published benchmark fit. */
  assumption?: string;
  observed: { value: number; formatted: string; period: string | null; origin: string };
  benchmark: {
    stats: ComparisonStat[];
    cohort: string;
    cohortDefinition: string | null;
    period: string;
    periodBasis: string;
    sampleSize: number | null;
    definition: string;
    source: { name: string; publisher: string | null; url: string | null; reference: string | null; publishedOn: string | null; attribution: string | null };
    dataset: { id: string; name: string; versionId: string; version: number };
  };
  /** Null when there's no central value, or the source's licence doesn't permit derived figures. */
  derived: { versus: string; difference: number; formatted: string; relativePct: number | null; better: boolean | null; position: string | null } | null;
  interpretation: string;
  limitations: string[];
};

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/** The value comparisons are made against: median, else the 50th percentile, else the mean. */
function centre(records: CandidateRecord[]): CandidateRecord | null {
  return (
    records.find((r) => r.statistic === "median") ??
    records.find((r) => r.statistic === "percentile" && r.percentile === 50) ??
    records.find((r) => r.statistic === "mean") ??
    null
  );
}

/** "between the 25th percentile and the median", "above the 75th percentile", "within the range". */
export function position(metric: MetricKey, value: number, records: CandidateRecord[]): string | null {
  const range = records.find((r) => r.statistic === "range");
  if (range && range.valueLow !== null && range.valueHigh !== null) {
    if (value < range.valueLow) return "below the published range";
    if (value > range.valueHigh) return "above the published range";
    return "within the published range";
  }
  const points = records
    .filter((r) => (r.statistic === "percentile" || r.statistic === "median") && r.value !== null)
    .map((r) => ({ p: r.statistic === "median" ? 50 : r.percentile!, v: r.value!, name: r.statistic === "median" || r.percentile === 50 ? "the median" : `the ${r.percentile}th percentile` }))
    .sort((a, b) => a.p - b.p);
  if (points.length < 2) return null;
  // Percentiles are stored as published: a higher percentile is a higher value, whatever the direction.
  if (value < points[0]!.v) return `below ${points[0]!.name}`;
  if (value > points.at(-1)!.v) return `above ${points.at(-1)!.name}`;
  for (let i = 1; i < points.length; i++) {
    if (value === points[i]!.v) return `at ${points[i]!.name}`;
    if (value < points[i]!.v) return `between ${points[i - 1]!.name} and ${points[i]!.name}`;
  }
  return `at ${points.at(-1)!.name}`;
}

export function difference(metric: MetricKey, value: number, ref: number): { difference: number; formatted: string; relativePct: number | null; better: boolean | null } {
  const diff = round(value - ref, 2);
  const lower = METRICS[metric].lowerIsBetter;
  const better = diff === 0 ? null : lower ? diff < 0 : diff > 0;
  const abs = Math.abs(diff);
  const side = diff === 0 ? "level with" : diff > 0 ? "above" : "below";
  // Percentages differ in points; everything else in the metric's own unit, plus a relative %.
  const formatted = METRICS[metric].unit === "percent" ? `${round(abs)} pts ${side}` : diff === 0 ? "level with" : `${formatMetric(metric, abs)} ${side}`;
  const relativePct = METRICS[metric].unit === "percent" || ref === 0 ? null : round((diff / Math.abs(ref)) * 100);
  return { difference: diff, formatted, relativePct, better };
}

/** Builds the comparison for one matched figure. */
export function compare(
  figure: { metric: MetricKey; value: number; period: string | null; origin: string },
  match: Extract<BenchmarkMatch, { status: "matched" }>,
  { assumption }: { assumption?: string } = {},
): BenchmarkComparison {
  const { metric } = figure;
  const label = METRICS[metric].label;
  const head = match.records[0]!;
  const fmt = (v: number) => formatMetric(metric, v);
  const stats: ComparisonStat[] = [...match.records]
    .sort((a, b) => (a.statistic === "percentile" ? a.percentile! : a.statistic === "median" ? 50 : 51) - (b.statistic === "percentile" ? b.percentile! : b.statistic === "median" ? 50 : 51))
    .map((r) => ({
      recordId: r.id,
      statistic: statisticLabel(r),
      value: r.value,
      low: r.valueLow,
      high: r.valueHigh,
      percentile: r.percentile,
      // A median or percentile published as a band (e.g. 20–25%) shows the band.
      formatted: r.statistic === "range" ? `${fmt(r.valueLow!)}–${fmt(r.valueHigh!)}` : bandText(metric, r),
    }));

  const ref = centre(match.records);
  const limitations: string[] = [];
  let derived: BenchmarkComparison["derived"] = null;
  if (!head.source.allowDerived) limitations.push("The source's licence doesn't cover derived figures, so the gap isn't calculated; compare the values side by side.");
  else {
    const raw = position(metric, figure.value, match.records);
    // "below the median" adds nothing when the gap is already measured against the median.
    const pos = raw && ref && statisticLabel(ref) === "median" && /^(below|above|at) the median$/.test(raw) ? null : raw;
    if (ref?.value != null) derived = { versus: statisticLabel(ref), ...difference(metric, figure.value, ref.value), position: pos };
    else if (pos) derived = { versus: "published range", difference: 0, formatted: "", relativePct: null, better: null, position: pos };
  }

  if (head.sampleSize === null) limitations.push("The source doesn't publish its sample size.");
  else if (head.sampleSize < 20) limitations.push(`Small sample: ${head.sampleSize} companies.`);
  for (const c of match.caveats) limitations.push(c.charAt(0).toUpperCase() + c.slice(1) + ".");
  if (head.limitations) limitations.push(`Source notes: ${head.limitations}`);
  if (match.alternatives.length)
    limitations.push(`${match.alternatives.map((a) => a.sourceName).join(", ")} also ${match.alternatives.length === 1 ? "reports" : "report"} this metric with a different cohort or period; values aren't averaged across sources.`);

  const where = derived?.position ? `, ${derived.position}` : "";
  const gap = derived && derived.formatted ? `${derived.formatted} the cohort ${derived.versus}${where}` : derived?.position ? derived.position : `compared side by side with the cohort's ${stats.map((s) => s.statistic).join(", ")}`;
  const verdict = derived?.better === true ? " (better)" : derived?.better === false ? " (worse)" : "";
  if (assumption) limitations.unshift(`No published benchmark fits (${assumption.replace(/\.$/, "")}), so this uses Growth Goaled's standard reference: an assumption, not a measured peer group.`);
  const interpretation = `${assumption ? "Standard reference (an assumption): " : match.quality === "directional" ? "Directional only: " : ""}${label} of ${fmt(figure.value)} is ${gap}${verdict}. This shows where the company sits against this cohort, not why; the diagnosis rests on the company's own data.`;

  return {
    metric,
    label,
    quality: match.quality,
    selection: match.selection,
    ...(assumption ? { assumption } : {}),
    observed: { value: figure.value, formatted: fmt(figure.value), period: figure.period, origin: figure.origin },
    benchmark: {
      stats,
      cohort: describeCohort(head),
      cohortDefinition: head.cohortDefinition,
      period: head.period,
      periodBasis: PERIOD_BASIS_LABEL[head.periodBasis],
      sampleSize: head.sampleSize,
      definition: head.definition,
      source: {
        name: head.source.name,
        publisher: head.source.publisher,
        url: head.source.url,
        reference: head.source.documentRef,
        publishedOn: head.source.publishedOn,
        attribution: head.source.attribution,
      },
      dataset: { id: head.datasetId, name: head.datasetName, versionId: head.versionId, version: head.version },
    },
    derived,
    interpretation,
    limitations,
  };
}
