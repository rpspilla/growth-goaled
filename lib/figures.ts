import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";

/**
 * The founder's figures for one metric, as the assessment sees them: every candidate value
 * (company profile, each uploaded file, values they entered) and whether they agree.
 */

export type FigureCandidate = {
  id: string;
  value: number;
  status: "accepted" | "proposed";
  /** "Your company profile", a filename, or "Entered by you". */
  source: string;
  period: string | null;
  rawText: string | null;
  updatedAt: Date;
};

export type FigureState = "agreed" | "conflict" | "unconfirmed" | "missing";

export type FigureChoice = {
  metric: MetricKey;
  label: string;
  /** Unit hint for typing a value in. */
  unitHint: string;
  /** What the figure means, in a sentence. */
  definition: string;
  state: FigureState;
  /** The value the assessment will use (latest confirmed, else latest), or null when missing. */
  inUseId: string | null;
  candidates: (FigureCandidate & { formatted: string })[];
};

/** Two values that round to the same figure count as agreeing. */
export const sameValue = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.005);

const UNIT_HINT: Record<string, string> = { usd: "in dollars", percent: "as a percent", days: "in days", months: "in months", count: "a count", ratio: "as a multiple, e.g. 1.5" };

export function figureChoice(metric: MetricKey, candidates: readonly FigureCandidate[]): FigureChoice {
  const sorted = [...candidates].sort((a, b) => Number(b.status === "accepted") - Number(a.status === "accepted") || b.updatedAt.getTime() - a.updatedAt.getTime());
  const distinct = sorted.filter((c, i) => sorted.findIndex((d) => sameValue(c.value, d.value)) === i);
  const state: FigureState = !sorted.length ? "missing" : distinct.length > 1 ? "conflict" : sorted.some((c) => c.status === "accepted") ? "agreed" : "unconfirmed";
  return {
    metric,
    label: METRICS[metric].label,
    unitHint: UNIT_HINT[METRICS[metric].unit] ?? "",
    definition: METRICS[metric].definition,
    state,
    inUseId: sorted[0]?.id ?? null,
    candidates: sorted.map((c) => ({ ...c, formatted: formatMetric(metric, c.value) })),
  };
}

/** Parses what the founder typed ("$1.2M", "4,200,000", "94%", "1.5x"); null if it isn't a number. */
export function parseFigure(raw: string): number | null {
  const m = /^\s*\$?\s*(-?[\d,]*\.?\d+)\s*(k|m|bn|b)?\s*(%|x|days?|d|months?|mo)?\s*$/i.exec(raw);
  if (!m) return null;
  let v = Number(m[1]!.replace(/,/g, ""));
  const s = m[2]?.toLowerCase();
  if (s === "k") v *= 1_000;
  else if (s === "m") v *= 1_000_000;
  else if (s === "b" || s === "bn") v *= 1_000_000_000;
  return Number.isFinite(v) ? v : null;
}
