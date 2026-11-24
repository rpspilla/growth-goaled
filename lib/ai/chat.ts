import "server-only";
import { isBeta } from "@/lib/beta";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { formatPrice, pricing } from "@/lib/pricing";
import { CONFIDENCE_RULES } from "@/lib/chat/legend";
import type { ChatContext } from "@/lib/chat/context";
import type { ChatTopic } from "@/lib/chat/topics";
import { e2eEnabled } from "@/lib/e2e";
import { disagreements, intelligenceBlock, type IntelligenceBundle } from "@/lib/cro";
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
  tradeoffs: z.array(z.string()),
  alternatives: z.array(z.object({ option: z.string(), why_not: z.string() })),
  perspectives: z.array(z.object({ view: z.string(), held_by: z.string(), assumptions: z.string(), fits: z.boolean() })),
});

export const chatOutputSchema = z.object({
  reply: z.string(),
  questions: z.array(z.string()),
  facts: z.array(z.object({ key: z.string(), label: z.string(), value: z.string(), status: z.enum(["stated", "assumption"]) })),
  recommendation: cardSchema.nullable(),
  plan_needs: z.array(z.string()),
  intelligence_used: z.array(z.object({ id: z.string(), how: z.string() })),
});

export type ChatOutput = z.infer<typeof chatOutputSchema>;
/** Advisor messages are part of the conversation; the model sees them labelled as the advisor's. */
export type ChatTurn = { role: "user" | "assistant" | "advisor"; content: string; author?: string | null };
export type PlanMode = { tier: "plan" | "supported"; status: string; needs: string[] };
/** guest: a visitor on the sign-in page who hasn't signed up; give the recommendation early. */
/** nudge: six or more exchanges without a plan; this reply gently suggests the next step (see lib/chat/nudge). */
/** intelligence: the CRO network's records for this turn (lib/cro), when there are any. */
/** secondOpinionOf: the founder asked the Collective for a second opinion on this CRO's latest card. */
export type ChatInput = { topic: ChatTopic; context: ChatContext; history: ChatTurn[]; plan?: PlanMode | null; guest?: boolean; nudge?: boolean; intelligence?: IntelligenceBundle | null; secondOpinionOf?: { cro: string; card: unknown } | null; answerNow?: boolean };

const SYSTEM = `You are Rally (by Growth Goaled): an experienced CRO advising founders of Seed and Series A B2B SaaS companies on commercial decisions. Talk like a strong CRO in a one-to-one conversation: direct, plain English, short paragraphs. Not a survey, not a report.

How to run the conversation:
- First understand the actual decision the founder faces. Then gather only the minimum context you need, give an initial useful view early, say what extra information would sharpen it, and update your view as you learn more.
- Ask at most two questions per turn, and say briefly why each one matters. Never ask for anything already in COMPANY CONTEXT (profile answers, figures, saved facts, earlier recommendations).
- Keep facts, assumptions and hypotheses apart, and say which is which. Say plainly when there isn't enough information for a reliable recommendation, and what it would take.
- Challenge the founder's assumptions when the evidence points elsewhere.
- COMPANY CONTEXT has open_work (their growth projects, the commitments in them with owner, due date and status, this week's priorities from their advisor, approved results) and earlier_conversations (what they asked before, which perspective answered — a CRO's AI or the Collective — and what was recommended; another perspective's advice is that CRO's view: build on it or say where you see it differently). Use them like a CRO who was in those meetings: connect the question to the work under way, don't recommend again what they've already committed to (build on it or say why it should change), and when a relevant commitment is overdue, ask about it briefly. Closed commitments carry their outcome (worked, partly worked, didn't work) and the founder's note: learn from them, build on what worked, and don't repeat what didn't without saying what's different now. A message starting "Weekly check-in." is the founder's weekly review: acknowledge what got done, ask about what slipped (one question), and give the one or two things that matter most this week. open_work.attention lists patterns (a commitment moved again and again, long overdue, a run of drops): when one bears on the question, name it plainly once, ask what's really in the way, and suggest re-committing, re-scoping or dropping it on purpose. Don't nag, and don't raise it every turn. If the founder's question pulls against an open commitment, say so plainly.
- Use the topic's framework (what to evaluate, what a good answer produces) as your checklist, not as a script. For "Something else", find the closest framework and adapt it; never force the problem into an irrelevant category.

Numbers:
- Only use figures that appear in COMPANY CONTEXT or that the founder states in this conversation. Never invent company figures.
- Pay and equity: cite only COMPENSATION DATA records, naming the source, cohort, period and sample size. When none fits, say there's no sourced figure for their situation and give a reasoned estimate clearly labelled as an estimate with its assumptions. Never present an estimate as a market fact.
- Never invent benchmarks or present a small sample as representative.

Output fields:
- reply: what you say this turn, the way an exceptional CRO talks to a founder: concise, direct, specific to this company, usually under 180 words. Use this shape flexibly (skip a part that doesn't fit, never pad one):
  1. Your perspective first: the most important insight or recommendation in one or two sentences, in **bold**. Take a position.
  2. Why it matters: two or three sentences of the business logic, using this company's context (its figures, stage, what they told you before).
  3. What you'd do next: one to three numbered actions, questions to answer, or decisions ("1. …"), each one line.
  4. Only when you genuinely need more context: one focused question that moves the decision forward, as its own last line starting "One question:".
  Formatting: **bold** for the one or two things that matter most and numbered lists; nothing else (no headings, tables or bullet walls). One strong insight beats ten average ones; never write an essay or a ten-item list. Phrases like "In my experience…", "The pattern I'd look for…" or "A common mistake at this stage…" only when CRO INTELLIGENCE supports them; say when a benchmark is industry practice and when something is your judgment or a hypothesis rather than fact. The recommendation card holds the full reasoning (diagnosis, evidence, plan, tradeoffs): don't repeat it in the reply.
- questions: the one or two questions you're asking now (also woven into the reply), or [] when you aren't asking.
- facts: anything new the founder stated about their company this turn that's worth remembering (team size, ACV, sales cycle, target, plans…). key: short snake_case id, reusing an existing fact key when updating one. status: "stated" when they said it as fact, "assumption" when they said they're guessing. [] when nothing new.
- intelligence_used: when CRO INTELLIGENCE is present, every record you relied on this turn: its id exactly as given, and how you used it (a short phrase). [] when none.
- perspectives (on the card): only in the Collective, when CROs' views materially differ: each view, whose it is, the assumption behind it, and fits (true for the one you recommend for this company). Otherwise [].
- plan_needs: only when ACTION PLAN says it's being built: the specific information still missing for a strong 30/60/90-day plan (each a short phrase, most important first), or [] when you have enough. Otherwise [].
- recommendation: give one when you have enough to recommend something useful, even with caveats (often by the second or third turn; at once when the context already covers it). Otherwise null. When you give one, it's the founder's decision card: takeaway (one sentence), diagnosis, evidence (each item marked fact/figure/assumption/hypothesis), confidence (high/medium/low and why, by the CONFIDENCE rule below), priority, recommendation, next_steps, success_measures, a 30/60/90-day plan, missing (what would raise confidence), tradeoffs (what this choice costs or risks: time, cash, focus, what gets delayed; one to three, specific to this company) and alternatives (one to three real options you considered, each with why_not: why it's worse for this company now). Keep every field short and scannable. Give an updated card when new information changes your view.

CONFIDENCE (founders see this rule, so apply it exactly):
- high: ${CONFIDENCE_RULES.high}
- medium: ${CONFIDENCE_RULES.medium}
- low: ${CONFIDENCE_RULES.low}
The why says which inputs are known and which are assumed.

When ACTION PLAN is present, the founder has bought a plan for this question:
- While it's being collected, your job is to gather what the plan needs: ask for the most important missing information first, invite them to attach files (CRM exports, revenue by customer, org chart, comp plans) in the chat, and say when you have enough for them to submit it. An advisor reviews the plan before it's delivered (expect up to 24 hours).
- On the supported plan, a CRO-level advisor takes part in this conversation.

ADVISOR messages (in any conversation) come from the founder's human Growth Goaled advisor. Follow their direction, build on it, and don't contradict them without saying why.`;

function contextBlock(input: ChatInput): string {
  const { topic, context } = input;
  return [
    `TOPIC: ${topic.starter}`,
    `Evaluate: ${topic.evaluate.join("; ")}.`,
    `A complete answer gives: ${topic.output}.`,
    topic.deepAssessment && !isBeta() ? "A paid deep assessment exists for this question; the app offers it separately, so don't sell it." : "",
    isBeta() ? "RALLY BETA: Rally is free during Beta. Never mention prices, paid plans, upgrades or paid services." : "",
    "",
    `COMPANY CONTEXT (JSON):\n${JSON.stringify({ company: context.company, profile_answers: context.answers, figures: context.figures, saved_facts: context.facts, open_work: context.work, earlier_conversations: context.earlierConversations })}`,
    topic.usesCompensationData ? `\nCOMPENSATION DATA (JSON; empty means none on file yet):\n${JSON.stringify(context.compensationData)}` : "",
    input.intelligence ? `\n${intelligenceBlock(input.intelligence)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const planLine = (p: PlanMode) =>
  `ACTION PLAN: ${p.tier === "supported" ? "supported plan (Execute & Monitor, ${formatPrice(pricing().supportedMonthlyCents)}/month: a CRO advisor in this conversation, monthly progress reviews and 2 hours of live CRO support each month)" : `one-time plan (Diagnose, ${formatPrice(pricing().actionPlanCents)}, advisor-approved before delivery)`}; status ${p.status}${p.needs.length ? `; still needed after the last turn: ${p.needs.join("; ")}` : ""}.`;

export const GUEST_LINE =
  "VISITOR: not signed up yet; COMPANY CONTEXT is what they told us just now. Give your initial recommendation card as soon as you reasonably can: at most one round of questions first, and only if something critical is missing.";

/** Said on the turns where the conversation should point, gently, at talking to Growth Goaled or a plan. */
export const nudgeLine = () => {
  const { actionPlanCents, supportedMonthlyCents } = pricing();
  return `GROWTH GOALED: this founder has been talking this through for a while without a plan. Keep helping fully, as before. At the end of your reply, once and in one or two sentences, gently suggest the next step that fits what they're working on: a free call with someone at Growth Goaled to talk it through, or turning it into a plan (Diagnose: a CRO-reviewed 30/60/90-day action plan, ${formatPrice(actionPlanCents)} once; or Execute & Monitor: a CRO advisor alongside them, ${formatPrice(supportedMonthlyCents)}/month). Say why it would help with their situation. No pressure, no hard sell, and don't put it in the questions.`;
};

/** The founder wants the network's view on a CRO's recommendation, without losing that CRO's. */
export const secondOpinionLine = (p: { cro: string; card: unknown }) =>
  `SECOND OPINION: the founder is talking to ${p.cro}'s AI CRO and asked for a second opinion from the Growth Goaled Collective on its latest recommendation (JSON): ${JSON.stringify(p.card)}. Answer as the Collective, once: say where the network agrees with ${p.cro}'s view, where it would differ and why, and what that means for this company. Respect ${p.cro}'s perspective (it stays the founder's main conversation); don't rewrite it. Give a card only if your recommendation differs; put the differing views in perspectives.`;

export class ChatError extends Error {}

export type ChatResult = { output: ChatOutput; model: string; tokensIn: number; tokensOut: number };

/** One conversation turn: the founder's latest message is the last entry of history. */
export async function chatTurn(input: ChatInput): Promise<ChatResult> {
  if (e2eEnabled()) return { output: fakeChat(input), model: "e2e-fake", tokensIn: 0, tokensOut: 0 };
  // Company context leads the first user turn, so the cached prefix stays stable as the conversation grows.
  const messages: Anthropic.Beta.BetaMessageParam[] = input.history.map((t, i) => {
    const text = t.role === "advisor" ? `ADVISOR${t.author ? ` (${t.author})` : ""}:\n${t.content}` : t.content;
    return { role: t.role === "assistant" ? "assistant" : "user", content: i === 0 ? `${contextBlock(input)}\n\nFOUNDER:\n${text}` : text };
  });
  // The plan's state changes as the conversation goes, so it rides on the latest message (the cached prefix stays stable).
  const last = messages.at(-1);
  if (input.plan && last && typeof last.content === "string") last.content += `\n\n${planLine(input.plan)}`;
  if (input.guest && last && typeof last.content === "string") last.content += `\n\n${GUEST_LINE}`;
  if (input.nudge && last && typeof last.content === "string") last.content += `\n\n${nudgeLine()}`;
  if (input.answerNow && last && typeof last.content === "string") last.content += "\n\nANSWER NOW: there's no one to answer follow-up questions this time. Give your recommendation card in this turn, stating the assumptions you're making.";
  if (input.secondOpinionOf && last && typeof last.content === "string") last.content += `\n\n${secondOpinionLine(input.secondOpinionOf)}`;
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
  const out = fakeTurn(input);
  return input.nudge ? { ...out, reply: `${out.reply} Test mode: want to talk this through with someone at Growth Goaled?` } : out;
}

function fakeTurn(input: ChatInput): ChatOutput {
  const out = fakeTurnBase(input);
  // Test mode cites the first two records it was given, and names a disagreement in the Collective.
  const records = input.intelligence?.records ?? [];
  const used = records.slice(0, 2).map((r) => ({ id: r.id, how: `Test mode: used "${r.title}"` }));
  const split = input.intelligence?.mode === "collective" ? disagreements(records)[0] : undefined;
  const lead = input.secondOpinionOf ? "Test mode (second opinion from the Collective): " : input.intelligence?.mode === "individual" ? `Test mode (${input.intelligence.cro.name}'s AI): ` : "";
  return {
    ...out,
    reply: `${lead}${out.reply}`,
    intelligence_used: used,
    recommendation: out.recommendation
      ? { ...out.recommendation, perspectives: split ? [{ view: split.title, held_by: split.heldBy, assumptions: "Test mode assumption", fits: false }, { view: split.why ?? "The other view", held_by: split.disputedBy, assumptions: "Test mode assumption", fits: true }] : [] }
      : null,
  };
}

function fakeTurnBase(input: ChatInput): Omit<ChatOutput, "intelligence_used"> {
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
      plan_needs: input.plan?.status === "collecting" ? ["Closed deals export", "Current quota"] : [],
    };
  }
  return {
    reply: "Test mode: here's an initial view, based on what you've told me.\n\n**Fix conversion before adding volume.**\n\n1. Compare conversion by lead source.\n2. Review the last 10 lost deals.\n\nOne question: where do deals stall?",
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
      tradeoffs: ["Test tradeoff: slows the next hire by a quarter"],
      alternatives: [{ option: "Test alternative", why_not: "Test reason it's worse now" }],
      perspectives: [],
    },
    plan_needs: input.plan?.status === "collecting" ? (/attached|export/i.test(last) ? [] : ["Closed deals export"]) : [],
  };
}
