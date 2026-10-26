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

/** Assessment stand-in: cites only input ids and restates input figures. */
export function fakeAssessment(input: AssessmentInput): AssessmentOutput {
  const fig = input.figures[0];
  const ref = fig ? input.reference.find((r) => r.metric === fig.metric) : undefined;
  const answer = input.founder_answers[0]!;
  const item = input.data_supplied[0];
  const cite = [fig?.id, ref?.id, answer.id, item?.id].filter((x): x is string => Boolean(x));
  const figText = fig ? `${fig.label} is ${fig.value}${ref ? ` against a peer top quartile of ${ref.top_quartile}` : ""}.` : "We worked from your answers and the data you shared.";
  return {
    summary: { headline: `Test mode assessment: ${input.use_case.question}`, body: `${figText} ${input.reference_note}`, sources: cite },
    findings: [
      { kind: "concern", text: fig ? `${fig.label}: ${fig.value}.` : "Few figures were available.", sources: cite },
      { kind: "strength", text: `You told us: ${answer.answer.slice(0, 120)}`, sources: [answer.id] },
    ],
    diagnosis: { text: figText, sources: cite },
    decision: { text: "Fix the main constraint before adding spend.", sources: cite },
    actions: [
      { action: "Address the main constraint first.", why: "It explains most of the gap.", horizon: "next_30_days", kpi: fig?.label ?? null, sources: cite },
      { action: "Review progress against your target.", why: "Keeps the plan honest.", horizon: "next_90_days", kpi: null, sources: [answer.id] },
    ],
    assumptions: ["Test mode."],
    data_gaps: [],
    next_steps: ["Add more history to sharpen the result."],
  };
}
