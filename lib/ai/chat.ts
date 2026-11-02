import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ChatContext } from "@/lib/chat/context";
import type { ChatTopic } from "@/lib/chat/topics";
import { e2eEnabled } from "@/lib/e2e";
import { AI_MODEL, anthropic } from "./config";

const cardSchema = z.object({
  takeaway: z.string(),
  diagnosis: z.string(),
  evidence: z.array(z.object({ text: z.string(), kind: z.enum(["fact", "figure", "assumption", "hypothesis"]) })),
  confidence: z.object({ level: z.enum(["high", "medium", "low"]), why: z.string() }),
  priority: z.string(),
  recommendation: z.string(),
  next_steps: z.array(z.string()),
  success_measures: z.array(z.string()),
  plan_30: z.array(z.string()),
  plan_60: z.array(z.string()),
  plan_90: z.array(z.string()),
  missing: z.array(z.string()),
});

export const chatOutputSchema = z.object({
  reply: z.string(),
  questions: z.array(z.string()),
  facts: z.array(z.object({ key: z.string(), label: z.string(), value: z.string(), status: z.enum(["stated", "assumption"]) })),
  recommendation: cardSchema.nullable(),
});

export type ChatOutput = z.infer<typeof chatOutputSchema>;
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatInput = { topic: ChatTopic; context: ChatContext; history: ChatTurn[] };

const SYSTEM = `You are Growth Goaled: an experienced CRO advising founders of Seed and Series A B2B SaaS companies on commercial decisions. Talk like a strong CRO in a one-to-one conversation: direct, plain English, short paragraphs. Not a survey, not a report.

How to run the conversation:
- First understand the actual decision the founder faces. Then gather only the minimum context you need, give an initial useful view early, say what extra information would sharpen it, and update your view as you learn more.
- Ask at most two questions per turn, and say briefly why each one matters. Never ask for anything already in COMPANY CONTEXT (profile answers, figures, saved facts, earlier recommendations).
- Keep facts, assumptions and hypotheses apart, and say which is which. Say plainly when there isn't enough information for a reliable recommendation, and what it would take.
- Challenge the founder's assumptions when the evidence points elsewhere.
- Use the topic's framework (what to evaluate, what a good answer produces) as your checklist, not as a script. For "Something else", find the closest framework and adapt it; never force the problem into an irrelevant category.

Numbers:
- Only use figures that appear in COMPANY CONTEXT or that the founder states in this conversation. Never invent company figures.
- Pay and equity: cite only COMPENSATION DATA records, naming the source, cohort, period and sample size. When none fits, say there's no sourced figure for their situation and give a reasoned estimate clearly labelled as an estimate with its assumptions. Never present an estimate as a market fact.
- Never invent benchmarks or present a small sample as representative.

Output fields:
- reply: what you say this turn (plain text, no markdown headings; short lists are fine). Don't repeat the recommendation card's content in it.
- questions: the one or two questions you're asking now (also woven into the reply), or [] when you aren't asking.
- facts: anything new the founder stated about their company this turn that's worth remembering (team size, ACV, sales cycle, target, plans…). key: short snake_case id, reusing an existing fact key when updating one. status: "stated" when they said it as fact, "assumption" when they said they're guessing. [] when nothing new.
- recommendation: give one when you have enough to recommend something useful, even with caveats (often by the second or third turn; at once when the context already covers it). Otherwise null. When you give one, it's the founder's decision card: takeaway (one sentence), diagnosis, evidence (each item marked fact/figure/assumption/hypothesis), confidence (high/medium/low and why), priority, recommendation, next_steps, success_measures, a 30/60/90-day plan, and missing (what would raise confidence). Keep every field short and scannable. Give an updated card when new information changes your view.`;

function contextBlock(input: ChatInput): string {
  const { topic, context } = input;
  return [
    `TOPIC: ${topic.starter}`,
    `Evaluate: ${topic.evaluate.join("; ")}.`,
    `A complete answer gives: ${topic.output}.`,
    topic.deepAssessment ? "A paid deep assessment exists for this question; the app offers it separately, so don't sell it." : "",
    "",
    `COMPANY CONTEXT (JSON):\n${JSON.stringify({ company: context.company, profile_answers: context.answers, figures: context.figures, saved_facts: context.facts, open_plan_actions: context.plan, earlier_recommendations: context.pastRecommendations })}`,
    topic.usesCompensationData ? `\nCOMPENSATION DATA (JSON; empty means none on file yet):\n${JSON.stringify(context.compensationData)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export class ChatError extends Error {}

export type ChatResult = { output: ChatOutput; model: string; tokensIn: number; tokensOut: number };

/** One conversation turn: the founder's latest message is the last entry of history. */
export async function chatTurn(input: ChatInput): Promise<ChatResult> {
  if (e2eEnabled()) return { output: fakeChat(input), model: "e2e-fake", tokensIn: 0, tokensOut: 0 };
  // Company context leads the first user turn, so the cached prefix stays stable as the conversation grows.
  const messages: Anthropic.Beta.BetaMessageParam[] = input.history.map((t, i) => ({
    role: t.role,
    content: i === 0 ? `${contextBlock(input)}\n\nFOUNDER:\n${t.content}` : t.content,
  }));
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    cache_control: { type: "ephemeral" },
    // Owner decision, Nov 2026: fast replies over depth.
    output_config: { effort: "low", format: betaZodOutputFormat(chatOutputSchema) },
    messages,
  });
  if (response.stop_reason === "refusal") throw new ChatError("That message couldn't be answered. Try rephrasing it.");
  if (response.stop_reason === "max_tokens") throw new ChatError("The answer was cut off. Try asking a narrower question.");
  const parsed = chatOutputSchema.safeParse(response.parsed_output);
  if (!parsed.success) throw new ChatError("Something went wrong preparing the answer. Try again.");
  return { output: parsed.data, model: response.model, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
}

/**
 * End-to-end test stand-in: asks two questions on the first turn, then gives a card. Remembers a
 * team size when the founder states one ("3 reps", "2 AEs").
 */
export function fakeChat(input: ChatInput): ChatOutput {
  const last = input.history.at(-1)?.content ?? "";
  const turn = input.history.filter((t) => t.role === "user").length;
  const reps = last.match(/(\d+)\s+(?:sales\s*people|salespeople|reps|AEs)/i);
  const facts = reps ? [{ key: "sales_team_size", label: "Sales team size", value: reps[1]!, status: "stated" as const }] : [];
  if (turn === 1) {
    return {
      reply: `Test mode: let's work through "${input.topic.starter}" for ${input.context.company.name}. Two questions first.`,
      questions: ["How many people sell today, including you?", "What's your average deal size?"],
      facts,
      recommendation: null,
    };
  }
  return {
    reply: "Test mode: here's an initial view, based on what you've told me.",
    questions: [],
    facts,
    recommendation: {
      takeaway: `Test mode takeaway for ${input.topic.starter}`,
      diagnosis: "Test mode diagnosis.",
      evidence: [{ text: "Stated by the founder in this conversation.", kind: "fact" }, { text: "Deal size is assumed.", kind: "assumption" }],
      confidence: { level: "low", why: "Test mode: few inputs." },
      priority: "Test mode priority.",
      recommendation: "Test mode recommendation.",
      next_steps: ["First test step"],
      success_measures: ["Test measure"],
      plan_30: ["Test 30-day step"],
      plan_60: ["Test 60-day step"],
      plan_90: ["Test 90-day step"],
      missing: ["Pipeline export"],
    },
  };
}
