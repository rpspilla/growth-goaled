import { formatMetric } from "@/lib/metrics";

/**
 * Growth Goaled's standard reference: the assumptions the free Snapshot falls back on when no
 * published data or Growth Goaled customer data fits the company. Set by Growth Goaled (owner
 * decision, Oct 2026) from common private B2B SaaS rules of thumb; always shown labelled as an
 * assumption with its basis, never as a peer measurement.
 */

export const REFERENCE_BASIS =
  "Growth Goaled's standard reference for private B2B SaaS, compiled from widely cited industry rules of thumb (SaaS Mag; Ryan Allis on LinkedIn) and the T2D3 growth framework. It's an assumption, used only because no published or Growth Goaled data fits your company yet.";

export type ReferencePoint = { label: string; value: number; formatted: string };
export type ReferenceSpread = { bottom: ReferencePoint; median: ReferencePoint; top: ReferencePoint; elite: string; metricLabel: string };

/** Year-over-year ARR growth. Plotted at each band's midpoint; shown as the band. */
export const GROWTH_REFERENCE: ReferenceSpread = {
  bottom: { label: "Bottom quartile", value: 22.5, formatted: "20–25%" },
  median: { label: "Median", value: 42.5, formatted: "40–45%" },
  top: { label: "Top quartile", value: 100, formatted: "80–120%" },
  elite: "Elite companies grow 200% or more a year.",
  metricLabel: "Year-over-year ARR growth",
};

/**
 * Annual gross revenue churn: over 20% (bottom quartile), ~10–12% (median), ~5% (top quartile),
 * under 2% (world class). Shown as churn; plotted on the gross retention scale (100% minus churn)
 * so further right is better, like every other strip.
 */
export const GROSS_CHURN_REFERENCE: ReferenceSpread = {
  bottom: { label: "Bottom quartile", value: 80, formatted: "over 20%" },
  median: { label: "Median", value: 89, formatted: "10–12%" },
  top: { label: "Top quartile", value: 95, formatted: "about 5%" },
  elite: "World-class companies lose less than 2% a year.",
  metricLabel: "Annual gross revenue churn",
};

/** The T2D3 path: triple ARR twice, then double three times, from $1M or from $2M (a common Series A entry point). */
export const T2D3 = [
  { year: 1, phase: "Triple (1st)", multiplier: 3, from1m: 1_000_000, from2m: 2_000_000 },
  { year: 2, phase: "Triple (2nd)", multiplier: 3, from1m: 3_000_000, from2m: 6_000_000 },
  { year: 3, phase: "Double (1st)", multiplier: 2, from1m: 9_000_000, from2m: 12_000_000 },
  { year: 4, phase: "Double (2nd)", multiplier: 2, from1m: 18_000_000, from2m: 24_000_000 },
  { year: 5, phase: "Double (3rd)", multiplier: 2, from1m: 36_000_000, from2m: 48_000_000 },
] as const;

/**
 * Next year's ARR on the T2D3 path. Both paths triple below $6M ARR and double from there.
 * Below $1M the path hasn't started: the target is reaching $1–2M.
 */
export function t2d3Target(arr: { lo: number | null; hi: number | null; exact: number | null }): string {
  const next = (v: number) => (v < 6_000_000 ? v * 3 : v * 2);
  const lo = arr.exact ?? arr.lo;
  const hi = arr.exact ?? arr.hi;
  if (hi !== null && hi <= 1_000_000) return "reach $1–2M ARR, where the T2D3 path (and a typical Series A) starts";
  if (lo === null || lo < 1_000_000) return hi !== null ? `reach up to ${formatMetric("arr", next(hi))} ARR next year` : "reach $1–2M ARR, where the T2D3 path starts";
  if (hi === null) return `reach at least ${formatMetric("arr", next(lo))} ARR next year`;
  return lo === hi ? `reach ${formatMetric("arr", next(lo))} ARR next year (${lo < 6_000_000 ? "triple" : "double"} today's)` : `reach ${formatMetric("arr", next(lo))}–${formatMetric("arr", next(hi))} ARR next year`;
}
