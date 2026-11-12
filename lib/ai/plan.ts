import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ChatContext } from "@/lib/chat/context";
import type { ChatTopic } from "@/lib/chat/topics";
import type { ActionPlanContent } from "@/lib/db/schema";
import { e2eEnabled } from "@/lib/e2e";
import { normalizeRequest } from "@/lib/plan-requests";
import { AI_MODEL, anthropic } from "./config";
import { FOUNDER_INPUT_RULES, requestSchema } from "./plan-rewrite";

export const planOutputSchema = z.object({
  goal: z.string(),
  summary: z.string(),
  days30: z.array(requestSchema),
  days60: z.array(requestSchema),
  days90: z.array(requestSchema),
  advisor_tasks: z.array(z.object({ action: z.string(), why: z.string() })),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
  tools: z.array(z.object({ name: z.string(), category: z.string(), why: z.string() })),
});
type PlanOutput = z.infer<typeof planOutputSchema>;

/** The model's plan as stored: founder items as data requests (owner "Founder"), Growth Goaled's work as advisor tasks. */
export function fromOutput(out: PlanOutput): ActionPlanContent {
  const items = (steps: PlanOutput["days30"]) => steps.map((s) => ({ action: s.action, owner: "Founder", measure: s.measure, request: normalizeRequest({ fields: s.fields, columns: s.columns }) }));
  return {
    goal: out.goal,
    summary: out.summary,
    days30: items(out.days30),
    days60: items(out.days60),
    days90: items(out.days90),
    advisorTasks: out.advisor_tasks.map((t) => ({ action: t.action, why: t.why })),
    risks: out.risks,
    assumptions: out.assumptions,
    tools: out.tools,
  };
}

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
- days30 / days60 / days90: the founder's inputs, in order, 2 to 5 per period. Early inputs settle what later ones depend on.
${FOUNDER_INPUT_RULES}
- advisor_tasks: what Growth Goaled does with those inputs to deliver the plan, in order, 3 to 8, each with why. Advisors see these; the founder doesn't.
- risks and assumptions: what could derail it, and what the plan takes as given that isn't confirmed. Label estimates as estimates.
- tools: 3 to 6 tools worth evaluating to improve outcomes or save time on this plan. Each has its name (a real, widely used product, or a short list of alternatives like "Gong or Chorus"), its category (e.g. CRM, sales engagement, conversation intelligence, revenue analytics, CPQ, enablement, comp management, recruiting), and why: which milestone it helps and what it improves or saves. Say what to evaluate, not what to buy; never state prices or claim results. If the company already uses a tool for something, suggest getting more from it rather than replacing it.
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
  return { plan: keepDone(fromOutput(parsed.data), input.current), model: response.model, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
}

/** Steps already marked done (and inputs already answered) stay that way when the plan is rewritten with the same action. */
export function keepDone(plan: ActionPlanContent, current: ActionPlanContent | null): ActionPlanContent {
  if (!current) return plan;
  const before = new Map([...current.days30, ...current.days60, ...current.days90].map((s) => [s.action.trim().toLowerCase(), s]));
  const mark = (steps: ActionPlanContent["days30"]) =>
    steps.map((s) => {
      const was = before.get(s.action.trim().toLowerCase());
      if (!was) return s;
      const answer = was.request?.answer;
      return { ...s, ...(was.done ? { done: true, status: "done" as const } : {}), ...(answer && s.request ? { request: { ...s.request, answer } } : {}) };
    });
  return { ...plan, days30: mark(plan.days30), days60: mark(plan.days60), days90: mark(plan.days90) };
}

export function fakePlan(input: PlanInput): ActionPlanContent {
  return {
    goal: `Test mode goal for ${input.topic.starter}`,
    summary: `Test mode plan for ${input.context.company.name}.`,
    days30: [{ action: "Test 30-day milestone", owner: "Founder", measure: "Done or not", request: { fields: [{ key: "deal_cycle_founder", label: "Average deal cycle, founder-closed", kind: "days" }, { key: "deal_cycle_ae", label: "Average deal cycle, AE-closed", kind: "days" }], columns: ["Deal name", "Owner", "Created date", "Close date"] } }],
    days60: [{ action: "Test 60-day milestone", owner: "Founder", measure: "Pipeline coverage", request: { fields: [{ key: "pipeline", label: "Open pipeline", kind: "currency" }], columns: ["Deal name", "Amount", "Stage"] } }],
    days90: [{ action: "Test 90-day milestone", owner: "Founder", measure: "Win rate", request: { fields: [{ key: "win_rate", label: "Win rate", kind: "percent" }], columns: ["Deal name", "Outcome"] } }],
    advisorTasks: [{ action: "Test mode: model the hiring plan from the founder's inputs", why: "Sets quota and pipeline needs" }],
    risks: ["Test risk"],
    assumptions: ["Test assumption"],
    tools: [{ name: "Test CRM", category: "CRM", why: "Test mode: keeps the 30-day milestone's pipeline in one place." }],
  };
}
