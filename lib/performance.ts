import type { MetricKey } from "@/lib/metrics";

/**
 * How company metrics are grouped and explained on Overview and Performance. Plain content, no
 * data: every value shown comes from the company's own confirmed or calculated figures.
 */
export const METRIC_GROUPS: { id: string; title: string; lead: string; metrics: MetricKey[] }[] = [
  { id: "revenue", title: "Revenue and growth", lead: "How big the business is and how fast it's growing.", metrics: ["arr", "arr_growth", "mom_growth", "new_arr", "recurring_share"] },
  { id: "sales", title: "Pipeline and sales", lead: "Whether the sales engine converts, and how quickly.", metrics: ["win_rate", "sales_cycle_days", "acv", "pipeline_coverage", "quota_attainment", "ae_productivity", "forecast_accuracy", "founder_closed_share"] },
  { id: "acquisition", title: "Customer acquisition", lead: "What it costs to win customers and how fast that pays back.", metrics: ["customers", "cac_payback_months", "magic_number"] },
  { id: "retention", title: "Retention and expansion", lead: "Whether customers stay and grow.", metrics: ["nrr", "grr", "expansion_arr", "churned_arr", "top_customer_concentration"] },
  { id: "cash", title: "Cash and capital efficiency", lead: "How long the money lasts and how much growth it buys.", metrics: ["runway_months", "burn_multiple", "gross_margin"] },
  { id: "team", title: "Team and execution", lead: "Who's selling, and how long new sellers take to ramp.", metrics: ["employees", "sales_reps", "sdrs", "ramp_months"] },
];

/** One line on why each metric matters to a Seed or Series A founder. */
export const WHY: Record<MetricKey, string> = {
  arr: "The size of the recurring business; most other metrics are judged relative to it.",
  arr_growth: "The headline investors look at first: how fast recurring revenue grew in a year.",
  mom_growth: "Shows whether growth is speeding up or slowing down, month to month.",
  new_arr: "Revenue added from new customers: the output of your sales and marketing.",
  recurring_share: "Recurring revenue is valued far higher than one-off revenue.",
  win_rate: "Of the deals you close out, how many you win. Low win rates make every lead more expensive.",
  sales_cycle_days: "How long a deal takes. Longer cycles slow growth and tie up sellers.",
  acv: "Average annual revenue per customer; sets what you can afford to spend to win one.",
  pipeline_coverage: "Pipeline compared with target: too little means missed quarters ahead.",
  quota_attainment: "Whether sellers hit their numbers; a direct read on sales capacity.",
  ae_productivity: "Revenue each account executive brings in; tells you what a new hire should add.",
  forecast_accuracy: "How well you predict revenue; boards and investors weigh it heavily.",
  founder_closed_share: "How much revenue depends on the founder closing deals personally.",
  customers: "How many paying customers you have.",
  cac_payback_months: "Months of gross profit it takes to earn back what you spent to win a customer.",
  magic_number: "New revenue generated per dollar of sales and marketing spend.",
  nrr: "Revenue kept and grown from existing customers. Above 100% means the base grows on its own.",
  grr: "Revenue kept from existing customers before any expansion: your floor.",
  expansion_arr: "Growth from customers you already have.",
  churned_arr: "Revenue lost from customers who left.",
  top_customer_concentration: "How much depends on your largest customer: a risk if they leave.",
  runway_months: "How long the cash lasts at the current burn.",
  burn_multiple: "Cash burned for each dollar of new revenue. Lower is more efficient.",
  gross_margin: "What's left of revenue after delivery costs; drives what growth is worth.",
  employees: "Team size.",
  sales_reps: "Account executives carrying a quota.",
  sdrs: "People generating pipeline for the sellers.",
  ramp_months: "How long a new seller takes to reach full productivity.",
};

/** The few metrics shown on Overview, in priority order, when the company has them. */
export const HEADLINE_METRICS: MetricKey[] = ["arr", "arr_growth", "nrr", "runway_months", "win_rate", "gross_margin", "burn_multiple", "sales_cycle_days"];
