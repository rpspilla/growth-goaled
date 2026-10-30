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

/**
 * "Ready to run": the use case's key file is in (every item it supplies), or, for a use case without
 * one, every required item. Other items sharpen the answer but never hold it up.
 */
export function baselineReadiness(useCase: Pick<UseCaseDef, "requiredItems" | "keyFile">, status: Readonly<Record<string, Status>>): BaselineReadiness {
  const needed = useCase.keyFile?.items ?? useCase.requiredItems;
  const outstanding = needed.filter((k) => !resolved(status[k]));
  const total = needed.length;
  const done = total - outstanding.length;
  // At least one item must actually be supplied; "not applicable" everywhere isn't a baseline.
  const supplied = needed.some((k) => status[k] === "available" || status[k] === "partial");
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, ready: outstanding.length === 0 && supplied, outstanding };
}
