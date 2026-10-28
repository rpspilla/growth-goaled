/**
 * Ranges a founder can pick instead of typing an exact figure. A range is never stored as a
 * figure (no data point, no company column); the free Snapshot reads it as a range and says so.
 * Keyed by the exact intake field it stands in for ("section.field").
 */
export type Range = { label: string; lo: number | null; hi: number | null };

const r = (label: string, lo: number | null, hi: number | null): Range => ({ label, lo, hi });

export const RANGES: Readonly<Record<string, { label: string; options: readonly Range[]; help?: string }>> = {
  "company.arr": {
    label: "Annual recurring revenue (ARR)",
    options: [r("Under $250K", 0, 250_000), r("$250K–$1M", 250_000, 1_000_000), r("$1M–$3M", 1_000_000, 3_000_000), r("$3M–$5M", 3_000_000, 5_000_000), r("$5M–$10M", 5_000_000, 10_000_000), r("$10M–$20M", 10_000_000, 20_000_000), r("$20M+", 20_000_000, null)],
  },
  "company.growth": {
    label: "Year-over-year revenue growth",
    options: [r("Shrinking", null, 0), r("0–25%", 0, 25), r("25–50%", 25, 50), r("50–100%", 50, 100), r("100–200%", 100, 200), r("200%+", 200, null)],
  },
  "company.employees": {
    label: "Number of employees",
    options: [r("1–5", 1, 5), r("6–10", 6, 10), r("11–25", 11, 25), r("26–50", 26, 50), r("50+", 50, null)],
  },
  "company.funding": {
    label: "Total funding raised",
    options: [r("Bootstrapped", 0, 0), r("Under $1M", 0, 1_000_000), r("$1M–$5M", 1_000_000, 5_000_000), r("$5M–$15M", 5_000_000, 15_000_000), r("$15M–$30M", 15_000_000, 30_000_000), r("$30M+", 30_000_000, null)],
  },
  "customers.count": {
    label: "Number of customers",
    options: [r("1–9", 1, 9), r("10–19", 10, 19), r("20–49", 20, 49), r("50–99", 50, 99), r("100–249", 100, 249), r("250+", 250, null)],
  },
  "customers.acv": {
    label: "Average annual contract value",
    options: [r("Under $5K", 0, 5_000), r("$5K–$15K", 5_000, 15_000), r("$15K–$30K", 15_000, 30_000), r("$30K–$60K", 30_000, 60_000), r("$60K–$100K", 60_000, 100_000), r("$100K+", 100_000, null)],
  },
  "customers.nrr": {
    label: "Net revenue retention (NRR)",
    options: [r("Under 80%", null, 80), r("80–90%", 80, 90), r("90–100%", 90, 100), r("100–110%", 100, 110), r("110–120%", 110, 120), r("120%+", 120, null)],
  },
  // Asked as annual gross churn (what founders know); the bounds stay on the gross retention scale
  // (100% minus churn), so "5–10%" churn is 90–95% gross retention.
  "customers.gross_retention": {
    label: "Annual gross revenue churn",
    options: [r("Under 2%", 98, 100), r("2–5%", 95, 98), r("5–10%", 90, 95), r("10–20%", 80, 90), r("Over 20%", null, 80)],
    help: "The share of last year's recurring revenue you lost to cancellations and downgrades, before any upsells. 100% minus this is your gross revenue retention.",
  },
  "customers.sales_cycle": {
    label: "Average sales cycle",
    options: [r("Under 30 days", 0, 30), r("30–60 days", 30, 60), r("60–90 days", 60, 90), r("90–180 days", 90, 180), r("180+ days", 180, null)],
  },
  "gtm.sales_reps": {
    label: "Account executives (AEs)",
    options: [r("None yet", 0, 0), r("1–2", 1, 2), r("3–5", 3, 5), r("6–10", 6, 10), r("11+", 11, null)],
  },
};

/** The intake field id that holds the range for an exact field, e.g. "arr" → "arr_range". */
export const rangeFieldId = (field: string) => `${field}_range`;

/** The range a stored answer names, or null. */
export function findRange(key: string, label: unknown): Range | null {
  if (typeof label !== "string") return null;
  return RANGES[key]?.options.find((o) => o.label === label) ?? null;
}
