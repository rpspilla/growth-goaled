export type MetricUnit = "usd" | "percent" | "days" | "months" | "count" | "ratio";

export type MetricDefinition = {
  label: string;
  unit: MetricUnit;
  /** How to display a value: currency is abbreviated ($4.2M), percent/ratio keep one decimal at most. */
  format: "currency" | "percent" | "days" | "months" | "integer" | "multiple";
  lowerIsBetter: boolean;
};

export const METRICS = {
  arr: { label: "ARR", unit: "usd", format: "currency", lowerIsBetter: false },
  arr_growth: { label: "ARR Growth", unit: "percent", format: "percent", lowerIsBetter: false },
  nrr: { label: "NRR", unit: "percent", format: "percent", lowerIsBetter: false },
  grr: { label: "Gross Retention", unit: "percent", format: "percent", lowerIsBetter: false },
  acv: { label: "ACV", unit: "usd", format: "currency", lowerIsBetter: false },
  sales_cycle_days: { label: "Sales Cycle", unit: "days", format: "days", lowerIsBetter: true },
  ae_productivity: { label: "AE Productivity", unit: "usd", format: "currency", lowerIsBetter: false },
  cac_payback_months: { label: "CAC Payback", unit: "months", format: "months", lowerIsBetter: true },
  win_rate: { label: "Win Rate", unit: "percent", format: "percent", lowerIsBetter: false },
  customers: { label: "Customers", unit: "count", format: "integer", lowerIsBetter: false },
  employees: { label: "Employees", unit: "count", format: "integer", lowerIsBetter: false },
  sales_reps: { label: "Sales Reps (AE)", unit: "count", format: "integer", lowerIsBetter: false },
  sdrs: { label: "SDRs / BDRs", unit: "count", format: "integer", lowerIsBetter: false },
  magic_number: { label: "Magic Number", unit: "ratio", format: "multiple", lowerIsBetter: false },
  burn_multiple: { label: "Burn Multiple", unit: "ratio", format: "multiple", lowerIsBetter: true },
  // Added for the use case library (HANDOFF §13)
  mom_growth: { label: "MoM Growth", unit: "percent", format: "percent", lowerIsBetter: false },
  gross_margin: { label: "Gross Margin", unit: "percent", format: "percent", lowerIsBetter: false },
  recurring_share: { label: "Recurring Revenue Share", unit: "percent", format: "percent", lowerIsBetter: false },
  new_arr: { label: "New ARR", unit: "usd", format: "currency", lowerIsBetter: false },
  expansion_arr: { label: "Expansion ARR", unit: "usd", format: "currency", lowerIsBetter: false },
  churned_arr: { label: "Churned ARR", unit: "usd", format: "currency", lowerIsBetter: true },
  runway_months: { label: "Runway", unit: "months", format: "months", lowerIsBetter: false },
  top_customer_concentration: { label: "Top-Customer Concentration", unit: "percent", format: "percent", lowerIsBetter: true },
  pipeline_coverage: { label: "Pipeline Coverage", unit: "ratio", format: "multiple", lowerIsBetter: false },
  quota_attainment: { label: "Quota Attainment", unit: "percent", format: "percent", lowerIsBetter: false },
  ramp_months: { label: "AE Ramp Time", unit: "months", format: "months", lowerIsBetter: true },
  forecast_accuracy: { label: "Forecast Accuracy", unit: "percent", format: "percent", lowerIsBetter: false },
  founder_closed_share: { label: "Founder-Closed Share", unit: "percent", format: "percent", lowerIsBetter: true },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRICS;

export function isMetricKey(key: string): key is MetricKey {
  return Object.hasOwn(METRICS, key);
}

function compactUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${trim(value / 1_000_000)}M`;
  if (abs >= 1_000) return `$${trim(value / 1_000)}K`;
  return `$${trim(value)}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function formatMetric(key: MetricKey, value: number): string {
  switch (METRICS[key].format) {
    case "currency":
      return compactUsd(value);
    case "percent":
      return `${trim(value)}%`;
    case "days":
      return `${Math.round(value)}d`;
    case "months":
      return `${trim(value)} mo`;
    case "integer":
      return Math.round(value).toLocaleString("en-US");
    case "multiple":
      return `${trim(value)}x`;
  }
}
