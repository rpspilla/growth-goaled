import type { RawRecord } from "./records";

/**
 * The initial Growth Goaled standard reference (owner decision, Oct 2026), loaded into the
 * Benchmark Library as an ordinary dataset when none exists yet. From then on admins edit it
 * there (new versions, validate, publish); this file is only the starting point.
 */
export const STANDARD_REFERENCE_SOURCE = {
  name: "Growth Goaled standard reference",
  publisher: "Growth Goaled",
  kind: "internal_research" as const,
  type: "advisory" as const,
  reliability: "use_with_caution" as const,
  allowCustomerDisplay: true,
  allowDerived: true,
  standardReference: true,
  notes: "Assumptions for private B2B SaaS, used only when no published or Growth Goaled customer data fits a company. Always shown labelled as an assumption.",
};

export const STANDARD_REFERENCE_DATASET = {
  name: "Growth Goaled standard reference: private B2B SaaS",
  description: "ARR growth and gross retention quartiles, and the T2D3 growth path. Edit here to change what Snapshots and assessments fall back on.",
};

const METHOD = "Compiled by Growth Goaled from widely cited private B2B SaaS rules of thumb (SaaS Mag; Ryan Allis on LinkedIn) and the T2D3 growth framework.";
const base = {
  definitionMatches: "yes",
  unit: "percent",
  period: "2026 standard reference",
  periodBasis: "annual",
  methodology: METHOD,
  limitations: "An assumption, not a measured cohort: no sample size.",
} satisfies RawRecord;

const growth = { ...base, metric: "arr_growth", definition: "Year-over-year ARR growth", cohortDefinition: "Private B2B SaaS (standard reference)" };
const retention = {
  ...base,
  metric: "grr",
  definition: "Gross revenue retention: 100% minus annual gross revenue churn (cancellations and downgrades, before upsells)",
  cohortDefinition: "Private B2B SaaS (standard reference)",
};
const path = { ...base, metric: "arr_growth", definition: "Year-over-year ARR growth on the T2D3 path", statistic: "percentile", percentile: "75" };

export const STANDARD_REFERENCE_RECORDS: RawRecord[] = [
  // ARR growth: bottom quartile 20–25%, median 40–45%, top quartile 80–120%, elite 200%+
  { ...growth, statistic: "percentile", percentile: "25", value: "22.5", valueLow: "20", valueHigh: "25" },
  { ...growth, statistic: "median", value: "42.5", valueLow: "40", valueHigh: "45" },
  { ...growth, statistic: "percentile", percentile: "75", value: "100", valueLow: "80", valueHigh: "120" },
  { ...growth, statistic: "percentile", percentile: "97", value: "200", valueLow: "200" },
  // Gross retention from annual gross churn: >20% churn, ~10–12%, ~5%, <2% (world class)
  { ...retention, statistic: "percentile", percentile: "25", value: "80", valueHigh: "80" },
  { ...retention, statistic: "median", value: "89", valueLow: "88", valueHigh: "90" },
  { ...retention, statistic: "percentile", percentile: "75", value: "95" },
  { ...retention, statistic: "percentile", percentile: "97", value: "98", valueLow: "98" },
  // T2D3: triple (200% growth) from $1M to $6M ARR, then double (100%)
  { ...path, value: "200", arrMin: "1M", arrMax: "6M", cohortDefinition: "T2D3 path: triple from $1M to $6M ARR" },
  { ...path, value: "100", arrMin: "6M", cohortDefinition: "T2D3 path: double from $6M ARR" },
];
