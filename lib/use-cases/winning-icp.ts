import type { UseCaseDef } from "./types";

export const winningIcp: UseCaseDef = {
  id: "winning_icp",
  title: "Who are we actually winning with?",
  shortTitle: "Winning ICP",
  question: "Who are we actually winning with?",
  whenUseful: "You sell to several kinds of customer and want to focus sales and marketing on the segments that win, stay and grow.",
  youGet: ["Segments compared on win rate, ACV, cycle, retention and expansion", "Your primary ICP, defined", "What to deprioritise", "A plan with KPIs to track"],
  objectiveQuestions: [
    { id: "believed_segments", label: "Which segments do you believe are your best?", kind: "textarea", placeholder: "e.g. mid-market fintech, 200–1,000 employees" },
  ],
  requiredItems: ["customer_list", "revenue_by_customer", "industry", "company_size"],
  helpfulItems: ["contract_metrics", "use_case", "start_term", "status_renewal", "win_loss"],
  optionalItems: ["opp_value_dates"],
  figures: ["customers", "win_rate", "acv", "sales_cycle_days", "grr", "nrr"],
  trackableMetrics: ["win_rate", "acv", "sales_cycle_days", "nrr"],
};
