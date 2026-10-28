import type { UseCaseDef } from "./types";

export const founderHandoff: UseCaseDef = {
  id: "founder_handoff",
  title: "Build me an investor update",
  shortTitle: "Investor Update",
  question: "Build me an investor update",
  description: "Turns your figures, plan and progress into an investor update you can send.",
  forWho: "Founders who report to investors and want each update to be clear, consistent and quick to write.",
  decision: "What to tell investors this period: progress, the numbers that matter, and where you need help.",
  whenUseful: "You owe investors a monthly or quarterly update.",
  youGet: [
    "Your key metrics for the period, with what changed",
    "Progress against the plan you committed to",
    "Highlights, lowlights and asks, drafted for you to edit",
  ],
  comingSoon: true,
  snapshotProfile: [{ section: "gtm", field: "sales_reps" }, { section: "customers", field: "sales_cycle" }, { section: "customers", field: "count" }],
  nextUseCase: "hire_or_fix",
  objectiveQuestions: [
    { id: "founder_deal_share", label: "Roughly what share of deals are you personally involved in?", kind: "text", placeholder: "e.g. 80%", help: "Of the deals you closed recently, how many needed you on a call or in the negotiation." },
    { id: "step_back_date", label: "When do you want to step back from day-to-day selling?", kind: "date" },
  ],
  requiredItems: ["opportunities", "win_loss", "founder_dependencies"],
  helpfulItems: ["stage_history", "sales_activity", "roster"],
  optionalItems: ["org_chart", "deal_terms"],
  itemWhy: {
    opportunities: "Deals with their owner, so we can compare your deals with your reps'.",
    win_loss: "Win rate for your deals vs. the team's.",
    founder_dependencies: "Which stages and relationships still rely on you.",
    stage_history: "Where deals stall when you're not in them.",
    sales_activity: "How much selling the team does without you.",
    roster: "Who could take over, and what's missing.",
    org_chart: "Reporting lines for a first sales leader.",
    deal_terms: "Whether reps discount more than you do.",
  },
  figures: ["founder_closed_share", "win_rate", "sales_cycle_days"],
  trackableMetrics: ["founder_closed_share", "win_rate", "sales_cycle_days"],
};
