import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_MODEL, anthropic } from "./config";
import { e2eEnabled } from "@/lib/e2e";
import { fakeDraft } from "./fake";

/** What the Draft Agent is given. Every figure is precomputed in code. */
export type DraftInput = {
  company: { name: string; stage: string | null; sales_model: string | null; industry: string | null; primary_segment: string | null };
  cohort: { name: string; criteria: string; company_count: number | null; methodology: string };
  comparison: {
    metric: string;
    label: string;
    lower_is_better: boolean;
    company_value: string;
    cohort_median: string | null;
    cohort_top_quartile: string;
    status_vs_top_quartile: "ahead" | "behind";
    data_point_id: string;
    benchmark_row_id: string;
    benchmark_source: string | null;
  }[];
  other_company_data: { metric: string; label: string; value: string; data_point_id: string }[];
  open_questions: { type: string; title: string }[];
  advisor_feedback: string | null;
};

const claim = z.object({ text: z.string(), sources: z.array(z.string()) });

export const draftOutputSchema = z.object({
  headline: z.string(),
  insight: z.object({ headline: z.string(), body: z.string(), sources: z.array(z.string()) }),
  strengths: z.array(claim),
  watch_areas: z.array(claim),
  priority: claim,
  missing_inputs: z.array(z.string()),
});

export type DraftOutput = z.infer<typeof draftOutputSchema>;

const SYSTEM = `You are Growth Goaled's Draft Agent. You write the narrative of a founder's Benchmark: how their company compares with a matched cohort of peers.

You receive JSON with the company profile, the matched cohort, a comparison table (company value, cohort median and top quartile, and whether the company is ahead of or behind the top quartile), other accepted company data, open questions, and sometimes feedback from the advisor on a previous draft.

Rules:
- Use only the numbers in the input, written exactly as they appear there (e.g. "$840K", "94d", "72%"). You may state a simple gap between a company value and its benchmark. Never invent, estimate or round to new figures, and never introduce benchmarks that aren't in the input.
- Every statement must cite its evidence in sources, using only data_point_id and benchmark_row_id values from the input. Cite the company data point and the benchmark row you compare it with.
- Respect lower_is_better: for those metrics a smaller number is better.
- headline: one sentence on the company's position. insight: the single most important diagnosis (headline + 2–4 sentence body).
- strengths and watch_areas: 2–4 each, short and specific. priority: the one thing to focus on first, grounded in the comparison.
- If important inputs are missing or open questions could change the conclusion, list them in missing_inputs instead of guessing. Don't present a conclusion more confidently than the data allows.
- If advisor_feedback is present, address it.
- Write plainly for a founder. No hype.`;

export class DraftError extends Error {}

export type DraftResult = { output: DraftOutput; model: string; tokensIn: number; tokensOut: number };

/** One Draft Agent run; the reply is validated and retried once if invalid. */
export async function draftBenchmark(input: DraftInput): Promise<DraftResult> {
  if (e2eEnabled()) return { output: fakeDraft(input), model: "e2e-fake", tokensIn: 0, tokensOut: 0 };
  let tokensIn = 0;
  let tokensOut = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "high", format: betaZodOutputFormat(draftOutputSchema) },
      messages: [{ role: "user", content: `Draft the Benchmark narrative from this input:\n\n${JSON.stringify(input, null, 2)}` }],
    });
    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;
    if (response.stop_reason === "refusal") throw new DraftError("The draft was declined by the model.");
    if (response.stop_reason === "max_tokens") throw new DraftError("The draft was cut off before it finished.");
    const parsed = draftOutputSchema.safeParse(response.parsed_output);
    if (parsed.success) return { output: parsed.data, model: response.model, tokensIn, tokensOut };
  }
  throw new DraftError("The Draft Agent returned invalid output twice.");
}
