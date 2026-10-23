import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AI_MODEL, anthropic } from "./config";

export const gapSummarySchema = z.object({
  headline: z.string(),
  priorities: z.array(z.object({ title: z.string(), why: z.string(), request: z.string() })),
  cannot_calculate_yet: z.array(z.string()),
});

export type GapSummary = z.infer<typeof gapSummarySchema>;

const SYSTEM = `You help a startup founder understand gaps in the growth data they've shared with Growth Goaled.

You receive JSON facts produced by Growth Goaled's own checks: which data items are available, partial, missing or not reviewed, data quality issues, open conflicts between sources, and which growth metrics can or can't be calculated yet.

Write for the founder: plain, direct, specific. Rules:
- Use only the facts provided. Do not add numbers, metrics, benchmarks or assumptions that aren't in the facts.
- Don't describe the company's performance; this is about data readiness only.
- "Available" means the founder said they have it, not that it's been verified. Don't call data validated unless the facts say so.
- priorities: at most 4, most useful first. Each says what to provide (request), and what it unlocks (why).
- cannot_calculate_yet: restate the blocked metrics in plain language (max 5).
- headline: one sentence on where their data stands.`;

/** Claude's prioritised, founder-friendly rewording of the rule-based gap facts. */
export async function summarizeGaps(facts: unknown) {
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(gapSummarySchema) },
    messages: [{ role: "user", content: `Facts:\n${JSON.stringify(facts)}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("The summary couldn't be generated.");
  const parsed = gapSummarySchema.safeParse(response.parsed_output);
  if (!parsed.success) throw new Error("The summary came back in an unexpected format.");
  return { summary: parsed.data, model: response.model, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
}
