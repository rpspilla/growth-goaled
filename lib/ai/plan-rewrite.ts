import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { e2eEnabled } from "@/lib/e2e";
import { FIELD_KINDS } from "@/lib/plan-requests";
import { AI_MODEL, anthropic } from "./config";

/**
 * Rewrites an existing plan's open items as founder inputs (Nov 12, 2026): each founder item asks
 * for specific data with named fields and file columns; the work Growth Goaled does becomes advisor
 * tasks. Used to propose a rewrite that an advisor reviews (before → after) before it's applied.
 */
export const requestSchema = z.object({
  action: z.string(),
  measure: z.string(),
  fields: z.array(z.object({ label: z.string(), kind: z.enum(FIELD_KINDS), hint: z.string().nullable() })),
  columns: z.array(z.string()),
});
export const rewriteOutputSchema = z.object({
  items: z.array(z.object({ index: z.number().int(), founder_input: requestSchema.nullable() })),
  advisor_tasks: z.array(z.object({ action: z.string(), why: z.string() })),
});
export type RewriteOutput = z.infer<typeof rewriteOutputSchema>;

export const FOUNDER_INPUT_RULES = `Every founder item asks the founder for specific data the plan needs, never for work to do:
- action: the request in plain words, naming the exact data and how it's split (e.g. "Enter your average deal cycle time in days, founder-closed and AE-closed").
- fields: each value the founder types, labelled as they'd see it (e.g. "Average deal cycle, founder-closed"), with kind: currency (US dollars), percent, days, number, text or date, and an optional short hint. 1 to 6 fields.
- columns: the exact columns a file must contain to answer it instead (e.g. a CRM export: "Deal name", "Owner", "Created date", "Close date", "Amount", "Stage"). 2 to 8 columns.
- measure: what the answer settles in the plan.
Work Growth Goaled does with the data (analysis, models, recommendations, reviews, building documents) is an advisor task, not a founder item.`;

const SYSTEM = `You are Growth Goaled, a CRO for Seed and Series A B2B SaaS founders. An action plan's items read as tasks; rewrite them as founder inputs.

For each OPEN item (by its index), return founder_input: the data the founder must provide for that step of the plan. If the item is purely work Growth Goaled or the founder does that needs no data from the founder, return null and cover it in advisor_tasks.

${FOUNDER_INPUT_RULES}

advisor_tasks: what Growth Goaled does with the founder's inputs to deliver the plan, in order, 3 to 8, each with why. Never invent company figures.`;

export class RewriteError extends Error {}

export async function rewriteAsInputs(input: { goal: string; summary: string; items: { index: number; action: string; measure: string }[] }): Promise<RewriteOutput> {
  if (e2eEnabled())
    return {
      items: input.items.map((i) => ({ index: i.index, founder_input: { action: `Test mode: enter the figures for "${i.action}"`, measure: i.measure, fields: [{ label: "Test figure", kind: "number", hint: null }], columns: ["Date", "Value"] } })),
      advisor_tasks: [{ action: "Test mode: review the founder's inputs", why: "To check the plan" }],
    };
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: betaZodOutputFormat(rewriteOutputSchema) },
    messages: [{ role: "user", content: `PLAN GOAL: ${input.goal}\nSUMMARY: ${input.summary}\nOPEN ITEMS (JSON): ${JSON.stringify(input.items)}\n\nRewrite them.` }],
  });
  if (response.stop_reason === "refusal") throw new RewriteError("The rewrite was declined.");
  const parsed = rewriteOutputSchema.safeParse(response.parsed_output);
  if (!parsed.success) throw new RewriteError("The rewrite came back incomplete.");
  return parsed.data;
}
