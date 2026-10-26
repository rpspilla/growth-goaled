import type { UseCaseDef } from "./types";

export const hireOrFix: UseCaseDef = {
  id: "hire_or_fix",
  title: "Should we hire more salespeople, or fix what we have first?",
  shortTitle: "Hire or Fix",
  question: "Should we hire more salespeople, or fix what we have first?",
  whenUseful: "You're about to add sales headcount and want to be sure the current team, pipeline and process can carry it.",
  youGet: ["A verdict: hire now, fix first, or hire after fixes", "Diagnosis of rep productivity, ramp and pipeline coverage", "Which roles to hire and when", "A plan with KPIs to track"],
  objectiveQuestions: [
    { id: "hiring_budget", label: "Hiring budget for the next 12 months", kind: "currency", placeholder: "e.g. 600000" },
    { id: "roles_considering", label: "Which roles are you considering?", kind: "textarea", placeholder: "e.g. 2 AEs and an SDR, or a VP Sales" },
  ],
  requiredItems: ["roster", "sales_capacity", "opportunities", "win_loss"],
  helpfulItems: ["targets", "opp_value_dates", "sales_cycle", "compensation"],
  optionalItems: ["hiring_dates_comp", "open_roles"],
  itemWhy: {
    roster: "Who sells today, so we can measure each rep's output and ramp.",
    sales_capacity: "Quota and attainment: is the current team at capacity?",
    opportunities: "Pipeline coverage: is there enough pipeline for more reps?",
    win_loss: "Win rate: would new reps win, or is the process the bottleneck?",
    targets: "Next year's targets set how many reps the plan needs.",
    opp_value_dates: "Deal size and timing for productivity and cycle.",
    sales_cycle: "Longer cycles mean longer ramp for new hires.",
    compensation: "Cost per rep, for CAC payback on new hires.",
    hiring_dates_comp: "Actual ramp time from past hires.",
    open_roles: "What you're already hiring for.",
  },
  figures: ["ae_productivity", "quota_attainment", "ramp_months", "pipeline_coverage", "win_rate", "sales_cycle_days", "sales_reps", "sdrs", "cac_payback_months"],
  trackableMetrics: ["ae_productivity", "quota_attainment", "ramp_months", "pipeline_coverage", "win_rate", "sales_cycle_days"],
};
