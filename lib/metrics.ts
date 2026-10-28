export type MetricUnit = "usd" | "percent" | "days" | "months" | "count" | "ratio";

export type MetricDefinition = {
  label: string;
  unit: MetricUnit;
  /** How to display a value: currency is abbreviated ($4.2M), percent/ratio keep one decimal at most. */
  format: "currency" | "percent" | "days" | "months" | "integer" | "multiple";
  lowerIsBetter: boolean;
  /** A one-line plain-English definition, shown wherever we ask for the figure. */
  definition: string;
};

export const METRICS = {
  arr: { label: "ARR", unit: "usd", format: "currency", lowerIsBetter: false, definition: "Annual recurring revenue: what your subscriptions bring in per year, not counting one-off fees." },
  arr_growth: { label: "ARR Growth", unit: "percent", format: "percent", lowerIsBetter: false, definition: "How much your ARR grew compared with the same time last year, as a percent." },
  nrr: { label: "NRR", unit: "percent", format: "percent", lowerIsBetter: false, definition: "Net revenue retention: revenue this year from customers you had a year ago, divided by their revenue then. Includes upsells, downgrades and churn; over 100% means they grew." },
  grr: { label: "Gross Retention", unit: "percent", format: "percent", lowerIsBetter: false, definition: "Gross revenue retention: the share of last year's revenue from existing customers you kept, counting churn and downgrades but not upsells. It can't exceed 100%." },
  acv: { label: "ACV", unit: "usd", format: "currency", lowerIsBetter: false, definition: "Average annual contract value: what a typical customer pays you per year." },
  sales_cycle_days: { label: "Sales Cycle", unit: "days", format: "days", lowerIsBetter: true, definition: "How long a typical deal takes, from first sales conversation to signed contract." },
  ae_productivity: { label: "AE Productivity", unit: "usd", format: "currency", lowerIsBetter: false, definition: "New ARR closed per account executive in a year." },
  cac_payback_months: { label: "CAC Payback", unit: "months", format: "months", lowerIsBetter: true, definition: "How many months of a new customer's gross profit it takes to earn back what you spent to win them." },
  win_rate: { label: "Win Rate", unit: "percent", format: "percent", lowerIsBetter: false, definition: "Of the deals that reached a decision, the share you won." },
  customers: { label: "Customers", unit: "count", format: "integer", lowerIsBetter: false, definition: "The number of paying customers you have today." },
  employees: { label: "Employees", unit: "count", format: "integer", lowerIsBetter: false, definition: "Everyone on the team today, full-time and part-time, including founders." },
  sales_reps: { label: "Sales Reps (AE)", unit: "count", format: "integer", lowerIsBetter: false, definition: "Account executives: salespeople who carry a quota and close deals." },
  sdrs: { label: "SDRs / BDRs", unit: "count", format: "integer", lowerIsBetter: false, definition: "Sales and business development reps: people who book meetings for the account executives." },
  magic_number: { label: "Magic Number", unit: "ratio", format: "multiple", lowerIsBetter: false, definition: "New ARR from a quarter divided by the previous quarter's sales and marketing spend. Shows how efficiently spend turns into growth." },
  burn_multiple: { label: "Burn Multiple", unit: "ratio", format: "multiple", lowerIsBetter: true, definition: "Cash burned divided by net new ARR over the same period. Lower means more efficient growth." },
  // Added for the use case library (HANDOFF §13)
  mom_growth: { label: "MoM Growth", unit: "percent", format: "percent", lowerIsBetter: false, definition: "How much revenue grew from one month to the next, as a percent." },
  gross_margin: { label: "Gross Margin", unit: "percent", format: "percent", lowerIsBetter: false, definition: "Revenue minus the direct cost of delivering your product (hosting, support, onboarding), as a percent of revenue." },
  recurring_share: { label: "Recurring Revenue Share", unit: "percent", format: "percent", lowerIsBetter: false, definition: "The share of your revenue that comes from subscriptions rather than one-off fees or services." },
  new_arr: { label: "New ARR", unit: "usd", format: "currency", lowerIsBetter: false, definition: "ARR added from brand-new customers over the period." },
  expansion_arr: { label: "Expansion ARR", unit: "usd", format: "currency", lowerIsBetter: false, definition: "Extra ARR from existing customers who upgraded or bought more over the period." },
  churned_arr: { label: "Churned ARR", unit: "usd", format: "currency", lowerIsBetter: true, definition: "ARR lost from customers who cancelled or downgraded over the period." },
  runway_months: { label: "Runway", unit: "months", format: "months", lowerIsBetter: false, definition: "How many months your cash lasts at your current burn rate." },
  top_customer_concentration: { label: "Top-Customer Concentration", unit: "percent", format: "percent", lowerIsBetter: true, definition: "The share of your revenue that comes from your largest customers." },
  pipeline_coverage: { label: "Pipeline Coverage", unit: "ratio", format: "multiple", lowerIsBetter: false, definition: "Open pipeline divided by the new business you need to close. 3x means three times what you need." },
  quota_attainment: { label: "Quota Attainment", unit: "percent", format: "percent", lowerIsBetter: false, definition: "New business closed by your salespeople as a share of their targets." },
  ramp_months: { label: "AE Ramp Time", unit: "months", format: "months", lowerIsBetter: true, definition: "How long a new account executive takes to reach full productivity." },
  forecast_accuracy: { label: "Forecast Accuracy", unit: "percent", format: "percent", lowerIsBetter: false, definition: "How close your sales forecast came to what actually closed." },
  founder_closed_share: { label: "Founder-Closed Share", unit: "percent", format: "percent", lowerIsBetter: true, definition: "The share of deals where a founder was needed to close." },
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
