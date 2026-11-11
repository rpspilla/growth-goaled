import type { ActionPlanContent, PlanStep } from "@/lib/db/schema";

export type StepStatus = "todo" | "doing" | "done";
export type Period = "days30" | "days60" | "days90";
export const BOARD: readonly { id: StepStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "In progress" },
  { id: "done", label: "Complete" },
];
export const PERIOD_LABEL: Record<Period, string> = { days30: "Days 1–30", days60: "Days 31–60", days90: "Days 61–90" };
const PERIODS: Period[] = ["days30", "days60", "days90"];

/** Where a milestone sits on the board (older plans only have `done`). */
export const stepStatus = (s: Pick<PlanStep, "status" | "done">): StepStatus => s.status ?? (s.done ? "done" : "todo");

/** Every milestone with where it lives in the plan. */
export const allSteps = (content: Pick<ActionPlanContent, Period>) => PERIODS.flatMap((period) => content[period].map((step, index) => ({ period, index, step })));

/** The milestones the founder handed to Growth Goaled. */
export const growthGoaledSteps = (content: Pick<ActionPlanContent, Period>) => allSteps(content).filter((s) => s.step.assignee === "gg");

/** A plan's milestones moved to a column (`done` kept in step for older readers). */
export function withStatus(content: ActionPlanContent, period: Period, index: number, status: StepStatus): ActionPlanContent | null {
  const step = content[period][index];
  if (!step) return null;
  return { ...content, [period]: content[period].map((s, i) => (i === index ? { ...s, status, done: status === "done" } : s)) };
}

export function withAssignee(content: ActionPlanContent, period: Period, index: number, assignee: "us" | "gg"): ActionPlanContent | null {
  const step = content[period][index];
  if (!step) return null;
  return { ...content, [period]: content[period].map((s, i) => (i === index ? { ...s, assignee } : s)) };
}
