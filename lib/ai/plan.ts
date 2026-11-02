import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ChatContext } from "@/lib/chat/context";
import type { ChatTopic } from "@/lib/chat/topics";
import type { ActionPlanContent } from "@/lib/db/schema";
import { e2eEnabled } from "@/lib/e2e";
import { AI_MODEL, anthropic } from "./config";

const step = z.object({ action: z.string(), owner: z.string(), measure: z.string() });
export const planOutputSchema = z.object({
  goal: z.string(),
  summary: z.string(),
  days30: z.array(step),
  days60: z.array(step),
  days90: z.array(step),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
});

export type PlanInput = {
  topic: ChatTopic;
  context: ChatContext;
  /** The conversation so far, oldest first; advisor messages are labelled. */
  transcript: string;
  /** The current plan, when updating one. */
  current: ActionPlanContent | null;
};

const SYSTEM = `You are Growth Goaled, a CRO for Seed and Series A B2B SaaS founders. Write the founder's action plan for the question they bought it for, from their conversation and company context.

- goal: the outcome the plan delivers, measurable where the conversation supports it.
- summary: two or three sentences: the problem, and the approach.
- days30 / days60 / days90: milestones in order, 2 to 5 per period. Each has a concrete action, an owner (a role, or "Founder"), and how to measure it's done. Early steps settle what later ones depend on.
- risks and assumptions: what could derail it, and what the plan takes as given that isn't confirmed. Label estimates as estimates.
- Only use figures from the context or the conversation; never invent company figures or benchmarks. Where the advisor has said something in the conversation, follow it.
- When updating an existing plan, keep what still holds (and steps marked done), and change only what new information changes.`;

export class PlanError extends Error {}

export async function draftPlan(input: PlanInput): Promise<{ plan: ActionPlanContent; model: string; tokensIn: number; tokensOut: number }> {
  if (e2eEnabled()) return { plan: fakePlan(input), model: "e2e-fake", tokensIn: 0, tokensOut: 0 };
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: betaZodOutputFormat(planOutputSchema) },
    messages: [
      {
        role: "user",
        content: [
          `QUESTION: ${input.topic.starter}`,
          `A complete answer gives: ${input.topic.output}.`,
          `COMPANY CONTEXT (JSON): ${JSON.stringify({ company: input.context.company, profile_answers: input.context.answers, figures: input.context.figures, saved_facts: input.context.facts })}`,
          input.current ? `CURRENT PLAN (JSON): ${JSON.stringify(input.current)}` : "",
          `CONVERSATION:\n${input.transcript}`,
          input.current ? "Update the plan." : "Write the plan.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new PlanError("The plan couldn't be written.");
  if (response.stop_reason === "max_tokens") throw new PlanError("The plan was cut off.");
  const parsed = planOutputSchema.safeParse(response.parsed_output);
  if (!parsed.success) throw new PlanError("The plan came back incomplete.");
  return { plan: keepDone(parsed.data, input.current), model: response.model, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
}

/** Steps already marked done stay done when the plan is rewritten with the same action. */
export function keepDone(plan: ActionPlanContent, current: ActionPlanContent | null): ActionPlanContent {
  if (!current) return plan;
  const done = new Set([...current.days30, ...current.days60, ...current.days90].filter((s) => s.done).map((s) => s.action.trim().toLowerCase()));
  const mark = (steps: ActionPlanContent["days30"]) => steps.map((s) => (done.has(s.action.trim().toLowerCase()) ? { ...s, done: true } : s));
  return { ...plan, days30: mark(plan.days30), days60: mark(plan.days60), days90: mark(plan.days90) };
}

export function fakePlan(input: PlanInput): ActionPlanContent {
  return {
    goal: `Test mode goal for ${input.topic.starter}`,
    summary: `Test mode plan for ${input.context.company.name}.`,
    days30: [{ action: "Test 30-day milestone", owner: "Founder", measure: "Done or not" }],
    days60: [{ action: "Test 60-day milestone", owner: "Head of Sales", measure: "Pipeline coverage" }],
    days90: [{ action: "Test 90-day milestone", owner: "Founder", measure: "Win rate" }],
    risks: ["Test risk"],
    assumptions: ["Test assumption"],
  };
}
