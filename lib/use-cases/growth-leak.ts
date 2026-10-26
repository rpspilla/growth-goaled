import type { UseCaseDef } from "./types";

export const growthLeak: UseCaseDef = {
  id: "growth_leak",
  title: "Where is our growth leaking?",
  shortTitle: "Growth Leak",
  question: "Where is our growth leaking?",
  whenUseful: "Growth has slowed or stalled and you're not sure whether the problem is pipeline, conversion, retention or expansion.",
  youGet: ["Your ARR bridge: new, expansion and churned ARR", "Funnel conversion by stage", "The main constraint, with evidence", "A plan with KPIs to track"],
  objectiveQuestions: [
    { id: "suspected_leak", label: "Where do you think the leak is?", kind: "textarea", help: "Your hunch is useful; we'll test it against the data.", placeholder: "e.g. deals stall after the demo, or customers don't expand" },
  ],
  requiredItems: ["monthly_revenue", "revenue_by_customer", "churned_revenue"],
  helpfulItems: ["renewals_expansions", "grr_nrr", "opportunities", "stage_conversion", "win_loss"],
  optionalItems: ["leads_by_source"],
  itemWhy: {
    monthly_revenue: "Builds your ARR and growth trend, the line we're explaining.",
    revenue_by_customer: "Splits growth into new, expansion and churned revenue (the ARR bridge).",
    churned_revenue: "Shows how much growth leaks out through lost and shrinking customers.",
    renewals_expansions: "Shows whether existing customers grow, the other side of the bridge.",
    grr_nrr: "Gives retention directly if you already track it.",
    opportunities: "Tests whether the leak is in pipeline volume.",
    stage_conversion: "Shows which funnel stage deals stall in.",
    win_loss: "Shows whether you're losing deals you should win, and why.",
    leads_by_source: "Shows which channels feed the pipeline.",
  },
  figures: ["arr", "arr_growth", "new_arr", "expansion_arr", "churned_arr", "nrr", "grr", "win_rate", "sales_cycle_days"],
  trackableMetrics: ["arr", "arr_growth", "nrr", "grr", "win_rate", "sales_cycle_days"],
};
