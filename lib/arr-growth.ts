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
 * earlier figures count, flagged, since they are often the only history a company has. Null when
 * there is nothing to compare.
 */
export function arrGrowthSinceLastUpdate(readings: ArrReading[]): ArrGrowth | null {
  const usable = readings.filter((r) => r.status !== "rejected" && r.value > 0);
  const [latest] = usable.filter((r) => r.status === "accepted").sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  if (!latest) return null;
  const [prev] = usable
    .filter((r) => r !== latest && r.value !== latest.value && r.createdAt < latest.createdAt)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || Number(b.status === "accepted") - Number(a.status === "accepted"));
  if (!prev) return null;
  return {
    to: { value: latest.value, period: latest.period, at: latest.createdAt },
    from: { value: prev.value, period: prev.period, at: prev.createdAt, confirmed: prev.status === "accepted" || prev.origin !== "extracted" },
    pct: Math.round(((latest.value - prev.value) / prev.value) * 1000) / 10,
  };
}
