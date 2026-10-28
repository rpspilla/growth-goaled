import type { MetricKey } from "@/lib/metrics";

export const USE_CASE_IDS = ["growth_leak", "series_a_ready", "series_b_ready", "hire_or_fix", "winning_icp", "founder_handoff"] as const;
export type UseCaseId = (typeof USE_CASE_IDS)[number];

export const isUseCaseId = (id: string): id is UseCaseId => (USE_CASE_IDS as readonly string[]).includes(id);

/** One field on the objective form. Values are stored as strings (numbers as their digits). */
export type ObjectiveField = {
  id: string;
  label: string;
  kind: "text" | "textarea" | "number" | "currency" | "date" | "select";
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
  /** Where it appears on the questionnaire. */
  group?: "challenge" | "company" | "goal" | "context";
};

/**
 * One area the plan works across (e.g. ICP, sales call reviews). The results present the problem,
 * then a staged plan per dimension with what was found and the data behind it, linked for updating.
 */
export type PlanDimension = { id: string; title: string; summary: string; items: readonly string[] };

/** A company-profile question reused from the intake (lib/intake.ts); answers save to the profile. */
export type ProfileQuestion = { section: string; field: string };

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
  /** The problem it solves, in a sentence. */
  description: string;
  /** Who it's designed for. */
  forWho: string;
  /** The decision it helps the founder make, in one line (shown on the library card). */
  decision: string;
  whenUseful: string;
  /** Key outputs of the full assessment. */
  youGet: readonly string[];
  /** Profile figures that make the free Snapshot more useful (only asked when missing). */
  snapshotProfile: readonly ProfileQuestion[];
  /** Suggested next assessment once this one is done. */
  nextUseCase?: UseCaseId;
  objectiveQuestions: readonly ObjectiveField[];
  /** Questions this use case used to ask: no longer asked or saved, but earlier answers are still read. */
  retiredQuestions?: readonly ObjectiveField[];
  requiredItems: readonly string[];
  helpfulItems: readonly string[];
  optionalItems: readonly string[];
  /** Why each item matters for this objective (shown on the Data step). */
  itemWhy: Readonly<Record<string, string>>;
  figures: readonly MetricKey[];
  trackableMetrics: readonly MetricKey[];
  /**
   * Recorded sales calls needed for the report to publish straight to the founder. With fewer,
   * it's held until an advisor reviews it. Unset: always published once it passes the checks.
   */
  salesCallsToPublish?: number;
  /** The dimensions the plan is organised around, in order. Without them, results use the general layout. */
  dimensions?: readonly PlanDimension[];
  /** Shown in the library as "Coming soon": no questionnaire, Snapshot, purchase or grant yet. */
  comingSoon?: boolean;
};
