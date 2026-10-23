import "server-only";
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
