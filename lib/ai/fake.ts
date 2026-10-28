import "server-only";
import type { AssessmentInput, AssessmentOutput } from "./assessment";
import type { DraftInput, DraftOutput } from "./draft";

/**
 * Deterministic stand-ins for model calls in end-to-end test mode (see
 * lib/e2e.ts). They only restate input figures, so the code checks pass.
 */
export function fakeDraft(input: DraftInput): DraftOutput {
  const ahead = input.comparison.filter((c) => c.status_vs_top_quartile === "ahead");
  const behind = input.comparison.filter((c) => c.status_vs_top_quartile === "behind");
  const first = behind[0] ?? input.comparison[0]!;
  const cite = (c: DraftInput["comparison"][number]) => [c.data_point_id, c.benchmark_row_id];
  return {
    headline: `${input.company.name} compared with ${input.cohort.name}.`,
    insight: {
      headline: `${first.label} is the main gap to the top quartile.`,
      body: `${first.label} is ${first.company_value} against a top quartile of ${first.cohort_top_quartile}.`,
      sources: cite(first),
    },
    strengths: (ahead.length ? ahead : input.comparison.slice(0, 1)).slice(0, 3).map((c) => ({ text: `${c.label}: ${c.company_value} vs. ${c.cohort_top_quartile}`, sources: cite(c) })),
    watch_areas: (behind.length ? behind : input.comparison.slice(-1)).slice(0, 3).map((c) => ({ text: `${c.label}: ${c.company_value} vs. ${c.cohort_top_quartile}`, sources: cite(c) })),
    priority: { text: `Focus on ${first.label.toLowerCase()} first.`, sources: cite(first) },
    missing_inputs: [],
  };
}

const pass = (note: string) => ({ result: "pass" as const, note });
export const fakeQa = () => ({
  data_consistency: pass("Test mode"),
  benchmark_methodology: pass("Test mode"),
  source_trail: pass("Test mode"),
  recommendation_logic: pass("Test mode"),
  missing_inputs: pass("Test mode"),
});

/** Decision Brief stand-in: follows the rule-based diagnosis, cites only input ids and restates input figures. */
export function fakeAssessment(input: AssessmentInput): AssessmentOutput {
  const fig = input.figures[0];
  const ref = fig ? input.reference.find((r) => r.metric === fig.metric) : undefined;
  const answer = input.founder_answers[0];
  const item = input.data_supplied[0];
  const cite = [fig?.id, ref?.id, answer?.id, item?.id].filter((x): x is string => Boolean(x));
  const top = input.diagnosis?.candidates[0];
  const figText = fig ? `${fig.label} is ${fig.value}${ref ? ` against a benchmark ${ref.benchmark_values[0]}` : ""}.` : "We worked from your answers and the data you shared.";
  const tracked = input.figures.find((f) => input.trackable_metrics?.includes(f.metric));
  return {
    executive_decision: { decision: `Test mode brief: ${input.use_case.question}`, conclusion: `${figText} ${input.reference_note}`, sources: cite },
    diagnosis: {
      primary: top
        ? { candidate_id: top.id, title: top.title, explanation: input.diagnosis!.certainty === "unresolved" ? "Not yet established." : "The leading explanation from the rules.", sources: [`candidate:${top.id}`, ...top.supporting] }
        : { candidate_id: null, title: "Not yet established", explanation: figText, sources: cite },
      alternatives: (input.diagnosis?.candidates ?? []).slice(1, 3).map((c) => ({ candidate_id: c.id, title: c.title, assessment: "Less supported by the evidence.", sources: [`candidate:${c.id}`] })),
      how_to_distinguish: top?.test ?? null,
    },
    evidence: [
      { text: fig ? `${fig.label}: ${fig.value}.` : "Few figures were available.", status: fig?.origin === "calculated" ? "calculated" : "verified", bearing: "supports", dimension: input.plan_dimensions?.[0]?.id ?? null, sources: cite },
      ...(answer ? [{ text: `You told us: ${answer.answer.slice(0, 120)}`, status: "verified" as const, bearing: "context" as const, dimension: null, sources: [answer.id] }] : []),
    ],
    alternatives: [
      { option: "Fix the main constraint first", upside: "Addresses the cause.", downside: "Slower to add capacity.", implications: "Hold new spend until it moves.", sources: cite },
      { option: "Gather more evidence", upside: "A firmer answer.", downside: "Delays action.", implications: "Share the missing data.", sources: cite },
    ],
    recommendation: { option: "Fix the main constraint first", why: "The evidence points there.", sources: cite },
    action_plan: input.plan_dimensions?.length
      ? input.plan_dimensions.map((d, i) => ({ priority: i + 1, action: `Start on ${d.title.toLowerCase()}.`, rationale: d.summary, timing: (["next_30_days", "days_31_60", "days_61_90"] as const)[Math.min(i, 2)]!, role: null, success_metric: d.title, metric_key: null, expected_signal: "A first result in this area.", dependencies_risks: "Needs the data for this area.", dimension: d.id, sources: cite }))
      : [
      { priority: 1, action: "Address the main constraint first.", rationale: "It explains most of the gap.", timing: "next_30_days", role: null, success_metric: fig?.label ?? "Main constraint", metric_key: tracked?.metric ?? null, expected_signal: "The figure moves in the right direction.", dependencies_risks: "Needs an owner.", dimension: null, sources: cite },
      { priority: 2, action: "Review progress against your target.", rationale: "Keeps the plan honest.", timing: "days_61_90", role: null, success_metric: "Progress review held", metric_key: null, expected_signal: "A clear read on progress.", dependencies_risks: "None.", dimension: null, sources: cite },
    ],
    change_triggers: [{ if_this: "New data points to a different constraint", then_this: "Revisit the recommendation." }],
    follow_up: { metrics: tracked ? [{ metric_key: tracked.metric, label: tracked.label, why: "The main figure for this decision." }] : [], revisit_in_days: 30, revisit_trigger: "A sharp move in a key figure." },
    assumptions: ["Test mode."],
    data_gaps: [],
  };
}
