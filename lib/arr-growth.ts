/** An ARR figure on file for a company (any origin; rejected ones are left out by the caller). */
export type ArrReading = { value: number; period: string | null; status: "proposed" | "accepted" | "rejected"; origin: "manual" | "extracted" | "calculated"; createdAt: Date; updatedAt: Date };

export type ArrGrowth = {
  /** The ARR the company page shows: the newest confirmed figure. */
  to: { value: number; period: string | null; at: Date };
  /** The figure from the data update before it. */
  from: { value: number; period: string | null; at: Date; confirmed: boolean };
  /** Percent change, e.g. 12.5 for +12.5%. */
  pct: number;
};

/**
 * How much the company has grown since its last data update: the newest confirmed ARR against the
 * ARR from the update before it (the newest earlier figure with a different value). Unconfirmed
 * earlier figures count, flagged, since they are often the only history a company has. Figures set
 * aside when a conflict was settled still count as history if they're for an earlier, named month
 * (they lost to a newer figure, not because they were wrong). Null when there is nothing to compare.
 */
export function arrGrowthSinceLastUpdate(readings: ArrReading[]): ArrGrowth | null {
  const [latest] = readings.filter((r) => r.status === "accepted" && r.value > 0).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  if (!latest) return null;
  // The same figure can be on file more than once (e.g. read from a file, then copied to the profile
  // when chosen): it arrived with the first of them, for the month the dated ones name.
  const same = readings.filter((r) => r.status !== "rejected" && sameValue(r.value, latest.value));
  const arrived = same.reduce((a, r) => (r.createdAt < a.createdAt ? r : a), latest);
  const dated = same.filter((r) => monthOf(r.period) !== null).sort((a, b) => monthOf(b.period)! - monthOf(a.period)!)[0];
  const toMonth = monthOf(dated?.period ?? null);
  const history = (r: ArrReading) => {
    if (r.status !== "rejected") return true;
    const m = monthOf(r.period);
    return m !== null && (toMonth === null || m < toMonth);
  };
  const [prev] = readings
    .filter((r) => r.value > 0 && !sameValue(r.value, latest.value) && r.createdAt < arrived.createdAt && history(r))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (monthOf(b.period) ?? 0) - (monthOf(a.period) ?? 0) || Number(b.status === "accepted") - Number(a.status === "accepted"));
  if (!prev) return null;
  return {
    to: { value: latest.value, period: dated?.period ?? latest.period, at: arrived.createdAt },
    from: { value: prev.value, period: prev.period, at: prev.createdAt, confirmed: prev.status === "accepted" || prev.origin !== "extracted" },
    pct: Math.round(((latest.value - prev.value) / prev.value) * 1000) / 10,
  };
}

/** Two values that round to the same figure (within 0.5%). */
const sameValue = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.005);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "Nov 2026" or "2026-11" → 202611; null for anything else ("Current", ranges, none). */
function monthOf(period: string | null): number | null {
  if (!period) return null;
  const named = /^([A-Za-z]{3})[a-z]*\.? (\d{4})$/.exec(period.trim());
  if (named) {
    const m = MONTHS.indexOf(named[1]!.toLowerCase());
    return m < 0 ? null : Number(named[2]) * 100 + m + 1;
  }
  const iso = /^(\d{4})-(\d{2})$/.exec(period.trim());
  return iso ? Number(iso[1]) * 100 + Number(iso[2]) : null;
}
