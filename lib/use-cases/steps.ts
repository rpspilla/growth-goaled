import type { UseCaseId } from "./types";

/** The five founder steps (HANDOFF §13.2). Steps 3–5 follow the active use case. */
export const STEPS = [
  { key: "overview", label: "Overview", path: "/overview" },
  { key: "library", label: "Use Case Library", path: "/library" },
  { key: "data", label: "Data", path: "/data" },
  { key: "baseline", label: "Baseline", path: "/baseline" },
  { key: "progress", label: "Progress & Tracking", path: "/progress" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];
export type UseCaseStatus = "objective" | "active" | "baseline_in_review" | "tracking" | "closed";
export type ActiveUseCase = { useCase: UseCaseId; status: UseCaseStatus } | null;

export type StepState = {
  key: StepKey;
  number: number;
  label: string;
  path: string;
  locked: boolean;
  /** One line saying what unlocks a locked step. */
  lockedReason: string | null;
  done: boolean;
  current: boolean;
};

const STAGE: Record<UseCaseStatus, number> = { objective: 0, active: 1, baseline_in_review: 2, tracking: 3, closed: 3 };

/** Where the company is on the four-stage journey shown on Overview (0 = pick a use case … 3 = track progress). */
export const journeyStage = (active: ActiveUseCase) => (active ? Math.max(1, STAGE[active.status]) : 0);

export function stepStates(active: ActiveUseCase): StepState[] {
  const stage = journeyStage(active);
  const currentKey: StepKey = ["library", "data", "baseline", "progress"][stage] as StepKey;
  return STEPS.map((s, i) => {
    let lockedReason: string | null = null;
    if ((s.key === "data" || s.key === "baseline") && !active) lockedReason = "Unlocks when you activate a use case";
    if (s.key === "progress" && stage < 3) lockedReason = active ? "Unlocks when your baseline is approved" : "Unlocks after your baseline is approved";
    const doneAt: Partial<Record<StepKey, number>> = { library: 1, data: 2, baseline: 3 };
    return {
      key: s.key,
      number: i + 1,
      label: s.label,
      path: s.path,
      locked: lockedReason !== null,
      lockedReason,
      done: doneAt[s.key] !== undefined && stage >= doneAt[s.key]!,
      current: s.key === currentKey,
    };
  });
}

/** The founder's next action, for the Overview's primary button. */
export function nextAction(active: ActiveUseCase, startedUseCase: UseCaseId | null): { label: string; path: string } {
  if (!active) return startedUseCase ? { label: "Finish your objective", path: `/library/${startedUseCase}` } : { label: "Pick a use case", path: "/library" };
  switch (journeyStage(active)) {
    case 1:
      return { label: "Connect your data", path: "/data" };
    case 2:
      return { label: "See your baseline", path: "/baseline" };
    default:
      return { label: "Track your progress", path: "/progress" };
  }
}
