import type { UseCaseDef } from "./types";

type Status = "not_reviewed" | "available" | "partial" | "missing" | "not_applicable";

export type BaselineReadiness = {
  /** Required items supplied (available or partial) or marked not applicable. */
  done: number;
  total: number;
  percent: number;
  ready: boolean;
  /** Required items still to supply, in priority order. */
  outstanding: string[];
};

const resolved = (s: Status | undefined) => s === "available" || s === "partial" || s === "not_applicable";

/** "Baseline readiness": ready when every required item for the use case is in (HANDOFF §13.2, step 3). */
export function baselineReadiness(useCase: Pick<UseCaseDef, "requiredItems">, status: Readonly<Record<string, Status>>): BaselineReadiness {
  const outstanding = useCase.requiredItems.filter((k) => !resolved(status[k]));
  const total = useCase.requiredItems.length;
  const done = total - outstanding.length;
  // At least one required item must actually be supplied; "not applicable" everywhere isn't a baseline.
  const supplied = useCase.requiredItems.some((k) => status[k] === "available" || status[k] === "partial");
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, ready: outstanding.length === 0 && supplied, outstanding };
}
