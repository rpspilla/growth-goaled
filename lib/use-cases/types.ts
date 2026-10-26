import type { MetricKey } from "@/lib/metrics";

export const USE_CASE_IDS = ["growth_leak", "series_a_ready", "series_b_ready", "hire_or_fix", "winning_icp", "founder_handoff"] as const;
export type UseCaseId = (typeof USE_CASE_IDS)[number];

/** One field on the objective form. Values are stored as strings (numbers as their digits). */
export type ObjectiveField = {
  id: string;
  label: string;
  kind: "text" | "textarea" | "number" | "currency" | "date" | "select";
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
};

/**
 * A use case in the library (HANDOFF §13.3). Items are readiness keys from
 * lib/readiness.ts in priority order; figures are the metrics the baseline
 * computes in code, and the choices for the founder's main metric.
 */
export type UseCaseDef = {
  id: UseCaseId;
  title: string;
  shortTitle: string;
  /** The founder's question, as shown on the library card. */
  question: string;
  whenUseful: string;
  youGet: readonly string[];
  objectiveQuestions: readonly ObjectiveField[];
  requiredItems: readonly string[];
  helpfulItems: readonly string[];
  optionalItems: readonly string[];
  /** Why each item matters for this objective (shown on the Data step). */
  itemWhy: Readonly<Record<string, string>>;
  figures: readonly MetricKey[];
  trackableMetrics: readonly MetricKey[];
};
