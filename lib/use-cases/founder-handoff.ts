import type { UseCaseDef } from "./types";

export const founderHandoff: UseCaseDef = {
  id: "founder_handoff",
  title: "Is our sales repeatable without the founder?",
  shortTitle: "Founder Handoff",
  question: "Is our sales repeatable without the founder?",
  whenUseful: "You still close many of the deals yourself and want to know what it takes for the team to win without you.",
  youGet: ["A handoff readiness score", "Win rate and cycle: your deals vs your reps'", "The gaps to close (process, stages only you can run)", "Your first sales hire and when"],
  objectiveQuestions: [
    { id: "founder_deal_share", label: "Roughly what share of deals are you personally involved in?", kind: "text", placeholder: "e.g. 80%" },
    { id: "step_back_date", label: "When do you want to step back from day-to-day selling?", kind: "date" },
  ],
  requiredItems: ["opportunities", "win_loss", "founder_dependencies"],
  helpfulItems: ["stage_history", "sales_activity", "roster"],
  optionalItems: ["org_chart", "deal_terms"],
  figures: ["founder_closed_share", "win_rate", "sales_cycle_days"],
  trackableMetrics: ["founder_closed_share", "win_rate", "sales_cycle_days"],
};
