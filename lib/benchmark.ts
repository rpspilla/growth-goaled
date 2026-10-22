import { METRICS, type MetricKey } from "@/lib/metrics";

export type BenchmarkStatus = "ahead" | "behind";

/** True when `a` is better than `b` for this metric. */
export function isBetter(metric: MetricKey, a: number, b: number): boolean {
  return METRICS[metric].lowerIsBetter ? a < b : a > b;
}

/** "ahead" when the company matches or beats the cohort's top quartile. */
export function statusVsTopQuartile(metric: MetricKey, value: number, topQuartile: number): BenchmarkStatus {
  return value === topQuartile || isBetter(metric, value, topQuartile) ? "ahead" : "behind";
}

/**
 * Radar position as % of top-quartile performance (100 = top quartile),
 * inverted for lower-is-better metrics and capped at 120 so one outlier
 * doesn't flatten the chart.
 */
export function radarScore(metric: MetricKey, value: number, topQuartile: number): number {
  if (value <= 0 || topQuartile <= 0) return 0;
  const ratio = METRICS[metric].lowerIsBetter ? topQuartile / value : value / topQuartile;
  return Math.min(120, Math.round(ratio * 100));
}

/** Short radar axis labels. */
export const RADAR_LABEL: Partial<Record<MetricKey, string>> = {
  arr_growth: "Growth",
  nrr: "NRR",
  grr: "Retention",
  win_rate: "Win Rate",
  ae_productivity: "AE Prod.",
  cac_payback_months: "CAC PBK",
  sales_cycle_days: "Cycle",
};
