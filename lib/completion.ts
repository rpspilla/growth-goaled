import { INTAKE_SECTIONS } from "@/lib/intake";
import { isMetricKey, METRICS } from "@/lib/metrics";
import { getItem } from "@/lib/readiness";
import type { Assessment } from "@/lib/readiness-assessment";

/**
 * "What's needed to complete a fully calculated report": concrete, ordered
 * steps computed from the cohort, the founder's figures and the readiness
 * checks. Nothing here is estimated; every step points at where to fix it.
 */

export type CompletionStep = { title: string; detail: string; href: string; label: string };

export type CompletionInput = {
  /** Metrics the matched cohort has approved benchmarks for. */
  cohortMetrics: string[];
  /** Metrics in the report (company value + benchmark). */
  comparedMetrics: string[];
  /** Report metrics whose company figure came from a file and isn't confirmed yet. */
  unconfirmedMetrics: string[];
  openConflicts: number;
  assessment: Assessment;
  /** True when no approved cohort fits the company yet. */
  noCohort: boolean;
};

const intakeSectionFor = (metric: string) => INTAKE_SECTIONS.find((s) => s.fields.some((f) => f.metric === metric))?.id ?? null;
const label = (m: string) => (isMetricKey(m) ? METRICS[m].label : m);

export function completionSteps(input: CompletionInput): CompletionStep[] {
  const steps: CompletionStep[] = [];

  const missing = input.cohortMetrics.filter((m) => !input.comparedMetrics.includes(m));
  for (const m of missing) {
    const section = intakeSectionFor(m);
    steps.push({
      title: `Add your ${label(m)}`,
      detail: `Peer reference data exists for ${label(m)}, but we don't have your figure yet, so it isn't compared.`,
      href: section ? `/profile/${section}` : "/data",
      label: section ? "Add it in Company Profile" : "Upload a file with it",
    });
  }

  if (input.unconfirmedMetrics.length) {
    steps.push({
      title: `Confirm ${input.unconfirmedMetrics.length} ${input.unconfirmedMetrics.length === 1 ? "figure" : "figures"} read from your files`,
      detail: `${input.unconfirmedMetrics.map(label).join(", ")} ${input.unconfirmedMetrics.length === 1 ? "was" : "were"} read automatically. Accept or correct ${input.unconfirmedMetrics.length === 1 ? "it" : "them"} so the report uses confirmed numbers.`,
      href: "/data/files",
      label: "Review figures",
    });
  }

  if (input.openConflicts) {
    steps.push({
      title: `Resolve ${input.openConflicts} conflicting ${input.openConflicts === 1 ? "value" : "values"}`,
      detail: "Two of your sources disagree on a figure. Pick the right one so the comparison is accurate.",
      href: "/data/questions",
      label: "Answer questions",
    });
  }

  for (const metric of input.assessment.analytical.filter((m) => m.state === "blocked" && m.benchmarkCritical)) {
    const first = metric.blockedBy[0];
    const item = first ? getItem(first) : undefined;
    steps.push({
      title: `Unlock ${metric.label.toLowerCase()}`,
      detail: `${metric.message ?? ""} Needed: ${metric.blockedBy.map((k) => getItem(k)?.name ?? k).join(", ")}.`.trim(),
      href: item ? `/data/${item.category}` : "/data",
      label: "Add this data",
    });
  }

  const notReviewed = input.assessment.gaps.notReviewed.filter((k) => getItem(k)?.required).length;
  if (notReviewed) {
    steps.push({
      title: `Go through ${notReviewed} remaining checklist ${notReviewed === 1 ? "item" : "items"}`,
      detail: "Mark each required item as available, partial, missing or not applicable so we know what the full report can rely on.",
      href: "/data",
      label: "Open Data Readiness",
    });
  }

  if (input.noCohort) {
    steps.unshift({
      title: "No matching peer reference data yet",
      detail: "We don't have approved peer reference data for companies like yours yet. This version of the assessment needs it, so an analyst will prepare your results instead; nothing for you to do here.",
      href: "/baseline",
      label: "Check back soon",
    });
  }
  return steps;
}
