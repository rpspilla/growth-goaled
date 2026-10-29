import type { UseCaseId } from "./types";

/**
 * Visual-first copy for each growth question (docs/briefs/2026-10-29-visual-founder-flow.md):
 * a one-line "use it when" and three outcome chips. The long copy (forWho, decision, youGet)
 * stays on the use case definitions and is shown behind disclosures.
 *
 * Icon names are keys of OUTCOME_ICONS in components/visual/icons.tsx, so this file stays
 * free of React.
 */
export type OutcomeIcon = "drop" | "alert" | "flag" | "users" | "gauge" | "funnel" | "target" | "layers" | "compass" | "file" | "chart" | "check";

export type UseCaseVisual = {
  /** One line, ~10 words: when to ask this question. */
  oneLine: string;
  /** Exactly three things the assessment gives you, 1–3 words each. */
  outcomes: readonly { label: string; icon: OutcomeIcon }[];
  /** What the Results page shows first, for the preview callouts on the question page. */
  preview: { verdict: string; chart: string; plan: string };
};

export const USE_CASE_VISUALS: Record<UseCaseId, UseCaseVisual> = {
  growth_leak: {
    oneLine: "Growth slowed; customers cancel or shrink.",
    outcomes: [
      { label: "Churn drivers", icon: "drop" },
      { label: "At-risk accounts", icon: "alert" },
      { label: "First fix", icon: "flag" },
    ],
    preview: { verdict: "Where growth leaks", chart: "ARR bridge", plan: "Now / Next / Later" },
  },
  hire_or_fix: {
    oneLine: "About to add sales headcount.",
    outcomes: [
      { label: "Rep capacity", icon: "gauge" },
      { label: "Pipeline coverage", icon: "funnel" },
      { label: "Hire or fix", icon: "users" },
    ],
    preview: { verdict: "Hire now or fix first", chart: "Capacity vs target", plan: "Now / Next / Later" },
  },
  winning_icp: {
    oneLine: "Many customer types; you need focus.",
    outcomes: [
      { label: "Best segments", icon: "target" },
      { label: "Best channels", icon: "compass" },
      { label: "Who to drop", icon: "layers" },
    ],
    preview: { verdict: "Your primary ICP", chart: "Segments by win rate", plan: "Now / Next / Later" },
  },
  series_a_ready: {
    oneLine: "Planning a Series A raise.",
    outcomes: [
      { label: "Readiness score", icon: "gauge" },
      { label: "Gaps to close", icon: "alert" },
      { label: "Raise timing", icon: "flag" },
    ],
    preview: { verdict: "Ready or not yet", chart: "Readiness by area", plan: "Now / Next / Later" },
  },
  series_b_ready: {
    oneLine: "Planning a Series B raise.",
    outcomes: [
      { label: "Readiness score", icon: "gauge" },
      { label: "Gaps to close", icon: "alert" },
      { label: "Raise timing", icon: "flag" },
    ],
    preview: { verdict: "Ready or not yet", chart: "Readiness by area", plan: "Now / Next / Later" },
  },
  founder_handoff: {
    oneLine: "Investors expect regular updates.",
    outcomes: [
      { label: "Key metrics", icon: "chart" },
      { label: "Wins and risks", icon: "check" },
      { label: "Ready to send", icon: "file" },
    ],
    preview: { verdict: "Your update", chart: "Metrics vs last period", plan: "Asks" },
  },
};

export const visualFor = (id: UseCaseId): UseCaseVisual => USE_CASE_VISUALS[id];
