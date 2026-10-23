import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { QaResults } from "@/lib/db/schema";
import type { DraftInput, DraftOutput } from "./draft";
import { AI_MODEL, anthropic } from "./config";
import { e2eEnabled } from "@/lib/e2e";
import { fakeQa } from "./fake";

const check = z.object({ result: z.enum(["pass", "fail"]), note: z.string() });

export const qaOutputSchema = z.object({
  data_consistency: check,
  benchmark_methodology: check,
  source_trail: check,
  recommendation_logic: check,
  missing_inputs: check,
});

export const QA_CHECKS = [
  { key: "data_consistency", label: "Data consistency" },
  { key: "benchmark_methodology", label: "Benchmark methodology" },
  { key: "source_trail", label: "Source trail" },
  { key: "recommendation_logic", label: "Recommendation logic" },
  { key: "missing_inputs", label: "Missing inputs" },
] as const;

const SYSTEM = `You are Growth Goaled's QA Agent. You independently check a Benchmark draft before an advisor reviews it. You see the exact input the Draft Agent was given and its output, nothing else.

Run five checks. Each is pass or fail with a short, specific note (say what is wrong and where; for a pass, say what you verified):
- data_consistency: every figure in the draft appears in the input (or is a simple gap between two input figures) and is described correctly (right metric, right direction, ahead/behind matches the comparison table).
- benchmark_methodology: comparisons use the matched cohort's figures as given, respect lower-is-better metrics, and don't overstate what a cohort comparison shows.
- source_trail: each statement cites the data point and benchmark row it relies on, and the cited IDs are the right ones for what's claimed.
- recommendation_logic: the insight and priority follow from the comparison, not from outside assumptions.
- missing_inputs: gaps and open questions that could change the conclusion are acknowledged rather than glossed over.

Be strict. A plausible but unsupported statement is a fail.`;

export class QaError extends Error {}

export type QaResult = { results: QaResults; model: string; tokensIn: number; tokensOut: number };

export async function qaBenchmark(input: DraftInput, draft: DraftOutput): Promise<QaResult> {
  if (e2eEnabled()) return { results: fakeQa(), model: "e2e-fake", tokensIn: 0, tokensOut: 0 };
  let tokensIn = 0;
  let tokensOut = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "high", format: betaZodOutputFormat(qaOutputSchema) },
      messages: [
        {
          role: "user",
          content: `INPUT given to the Draft Agent:\n${JSON.stringify(input, null, 2)}\n\nDRAFT OUTPUT:\n${JSON.stringify(draft, null, 2)}\n\nRun the five checks.`,
        },
      ],
    });
    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;
    if (response.stop_reason === "refusal") throw new QaError("The QA check was declined by the model.");
    if (response.stop_reason === "max_tokens") throw new QaError("The QA check was cut off.");
    const parsed = qaOutputSchema.safeParse(response.parsed_output);
    if (parsed.success) return { results: parsed.data, model: response.model, tokensIn, tokensOut };
  }
  throw new QaError("The QA Agent returned invalid output twice.");
}
