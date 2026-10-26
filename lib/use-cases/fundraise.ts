import type { ObjectiveField, UseCaseDef } from "./types";

const raiseQuestions = (round: string): ObjectiveField[] => [
  { id: "raise_amount", label: `How much are you looking to raise in your ${round}?`, kind: "currency", placeholder: "e.g. 12000000" },
  { id: "raise_close_date", label: "When do you want the round closed?", kind: "date" },
  { id: "investor_conversations", label: "Investor conversations so far", kind: "textarea", placeholder: "Who you've spoken to and what they said" },
];

export const seriesAReady: UseCaseDef = {
  id: "series_a_ready",
  title: "Are we ready to raise a Series A?",
  shortTitle: "Series A Readiness",
  question: "Are we ready to raise a Series A?",
  whenUseful: "You're planning a Series A in the next 6–18 months and want to know which bars you meet and which gaps to close first.",
  youGet: ["Readiness by area: growth, retention, revenue quality, efficiency, GTM repeatability, runway", "The questions investors will ask", "A plan to close the gaps", "Raise timing against your runway"],
  objectiveQuestions: raiseQuestions("Series A"),
  requiredItems: ["monthly_revenue", "monthly_burn", "cash_balances", "customer_list", "revenue_by_customer"],
  helpfulItems: ["gross_margin", "runway", "grr_nrr", "churn", "active_usage"],
  optionalItems: ["opportunities", "win_loss"],
  itemWhy: {
    monthly_revenue: "ARR, MoM and YoY growth: the first things a Series A investor checks.",
    monthly_burn: "Burn multiple: how efficiently you turn spend into growth.",
    cash_balances: "Runway, and so how much time you have to raise.",
    customer_list: "Customer count and the base for concentration and retention.",
    revenue_by_customer: "Top-customer concentration and revenue quality.",
    gross_margin: "Investors discount low-margin revenue.",
    runway: "Your own runway plan, checked against raise timing.",
    grr_nrr: "Retention is a core Series A bar.",
    churn: "Explains retention and flags risk investors will ask about.",
    active_usage: "Evidence the product sticks beyond the contract.",
    opportunities: "Shows pipeline behind next year's growth.",
    win_loss: "Evidence of a repeatable sales motion.",
  },
  figures: ["arr", "mom_growth", "arr_growth", "recurring_share", "gross_margin", "burn_multiple", "runway_months", "nrr", "grr", "top_customer_concentration", "customers"],
  trackableMetrics: ["arr", "mom_growth", "gross_margin", "burn_multiple", "runway_months", "nrr", "grr"],
};

export const seriesBReady: UseCaseDef = {
  id: "series_b_ready",
  title: "Are we ready to raise a Series B?",
  shortTitle: "Series B Readiness",
  question: "Are we ready to raise a Series B?",
  whenUseful: "You've raised a Series A, are scaling go-to-market, and want to know how investors will read your efficiency and forecastability.",
  youGet: ["Readiness by area: growth, net retention, efficiency, GTM repeatability, team & forecastability, runway", "The questions investors will ask", "A plan to close the gaps", "Raise timing against your runway"],
  objectiveQuestions: raiseQuestions("Series B"),
  requiredItems: ["monthly_revenue", "monthly_burn", "cash_balances", "grr_nrr"],
  helpfulItems: ["gross_margin", "runway", "marketing_spend", "cpl_cac", "roster", "sales_capacity"],
  optionalItems: ["forecast_vs_actual"],
  itemWhy: {
    monthly_revenue: "ARR and YoY growth at Series B scale.",
    monthly_burn: "Burn multiple: the efficiency bar for Series B.",
    cash_balances: "Runway, and so how much time you have to raise.",
    grr_nrr: "Net retention is a core Series B bar.",
    gross_margin: "Investors discount low-margin revenue.",
    runway: "Your own runway plan, checked against raise timing.",
    marketing_spend: "CAC payback and magic number.",
    cpl_cac: "CAC payback and channel efficiency.",
    roster: "AE productivity and team shape.",
    sales_capacity: "Whether quota capacity supports the plan.",
    forecast_vs_actual: "Forecast accuracy: how predictable the business is.",
  },
  figures: ["arr", "arr_growth", "nrr", "grr", "gross_margin", "burn_multiple", "cac_payback_months", "magic_number", "ae_productivity", "forecast_accuracy", "runway_months"],
  trackableMetrics: ["arr", "arr_growth", "nrr", "gross_margin", "burn_multiple", "cac_payback_months", "magic_number", "runway_months"],
};
