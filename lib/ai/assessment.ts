import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { QaResults } from "@/lib/db/schema";
import { e2eEnabled } from "@/lib/e2e";
import type { UseCaseId } from "@/lib/use-cases";
import { AI_MODEL, anthropic } from "./config";
import { fakeAssessment, fakeQa } from "./fake";

/**
 * The assessment engine's agents (HANDOFF §13.9): one Draft Agent and one QA Agent for every
 * use case, given the use case's brief, the founder's answers and their data. Every figure is
 * precomputed in code and carries an id the draft must cite.
 */

export type AssessmentInput = {
  use_case: { id: UseCaseId; question: string; founder_gets: readonly string[]; brief: string };
  company: { name: string; stage: string | null; industry: string | null; primary_segment: string | null; sales_model: string | null; revenue_band: string | null };
  /** ids "answer:<field>" */
  founder_answers: { id: string; question: string; answer: string }[];
  founder_target: { metric: string; value: string; by: string | null } | null;
  /** ids are data point ids */
  figures: { id: string; metric: string; label: string; value: string; lower_is_better: boolean; confirmed: boolean; period: string | null }[];
  /** ids "item:<key>": what data the founder has supplied for this question */
  data_supplied: { id: string; item: string; priority: "required" | "helpful" | "optional"; status: string; coverage: string | null; files: number; columns: string[] }[];
  /** ids are approved reference rows; empty when no approved reference data matches */
  reference: { id: string; metric: string; label: string; median: string | null; top_quartile: string; source: string | null }[];
  reference_note: string;
  open_questions: { type: string; title: string }[];
  /** Files the founder shared that couldn't be read. */
  unreadable_files: string[];
  /** "complete" when all required data is in and confirmed; changes what the plan should look like. */
  completeness: "complete" | "partial" | "minimal";
  /** Present on a second attempt: what the code checks rejected last time. */
  revision_notes?: string;
};

const sources = z.array(z.string());
const claim = z.object({ text: z.string(), sources });

export const assessmentOutputSchema = z.object({
  summary: z.object({ headline: z.string(), body: z.string(), sources }),
  findings: z.array(z.object({ kind: z.enum(["concern", "strength"]), text: z.string(), sources })),
  diagnosis: claim,
  decision: claim,
  actions: z.array(
    z.object({
      action: z.string(),
      why: z.string(),
      horizon: z.enum(["next_30_days", "next_90_days", "later"]),
      kpi: z.string().nullable(),
      sources,
    }),
  ),
  assumptions: z.array(z.string()),
  data_gaps: z.array(z.string()),
  next_steps: z.array(z.string()),
});

export type AssessmentOutput = z.infer<typeof assessmentOutputSchema>;

/** What each assessment must evaluate (HANDOFF §13.3 and the pricing brief). */
export const ASSESSMENT_BRIEFS: Record<UseCaseId, string> = {
  growth_leak:
    "Find where growth is being lost: new business (pipeline volume, funnel conversion, sales cycle), retention (churn, contraction) or expansion. Where the figures allow, describe the ARR bridge (new, expansion, contraction, churn). Name the single most significant constraint with its evidence, recommend the next action, and say which other assessment to run next if appropriate.",
  series_a_ready:
    "Judge readiness for a Series A raise in roughly 6–12 months, dimension by dimension: growth, retention, revenue quality and concentration, efficiency (burn, gross margin), GTM repeatability, and runway and timing. Name the investor concerns and areas of scrutiny, the material gaps with evidence, a prioritized 90-day improvement plan, and fundraising preparation and timing relative to runway. Only compare with Series A bars that appear in the reference data; otherwise judge from the company's own figures and say no reference is available.",
  series_b_ready:
    "Judge readiness for a Series B raise in roughly 6–12 months using stage-appropriate criteria: growth consistency and predictability, retention and expansion, GTM repeatability, sales and capital efficiency, team and forecastability, runway and timing. Name likely investor concerns and a prioritized improvement plan. Only compare with Series B bars that appear in the reference data; otherwise judge from the company's own figures and say no reference is available.",
  hire_or_fix:
    "Decide whether to hire more salespeople or fix existing constraints first. Assess pipeline sufficiency, sales productivity and capacity, funnel conversion and sales cycle, rep ramp time, hiring economics, and process and management gaps. The decision must be one of: hire now, fix first, or run a targeted validation test, with the suggested role, timing and rationale where the evidence supports it.",
  winning_icp:
    "Identify who the company actually wins with. Rank customer segments by commercial attractiveness using win rate, ACV, sales cycle, retention, expansion and acquisition economics where measurable; say where samples are too small. Recommend the primary ICP and secondary segments, segments to deprioritize, positioning and qualification implications, and validation experiments.",
  founder_handoff:
    "Assess whether sales is repeatable without the founder: founder dependence across the sales process, repeatability of qualification, messaging and closing, process documentation and consistency, and readiness to transfer selling. Recommend the next role (first AE or sales leader) and when, the gaps to close before or during the transition, and a prioritized transition plan.",
};

const SYSTEM = `You are Growth Goaled's Draft Agent. You write a founder's self-service assessment for one business question, from their own answers and data.

You receive JSON with the use case (the question, what the founder was promised, and a brief of what to evaluate), the company profile, the founder's answers and target, computed figures, an inventory of the data they supplied, approved peer reference rows (possibly none) and open questions.

Rules:
- Use only numbers that appear in the input, written as they appear there. You may state a simple difference between two input figures. Never invent, estimate or extrapolate figures, and never cite benchmarks or "typical" values that aren't in the reference list.
- Every summary, finding, diagnosis, decision and action must cite its evidence in sources using only ids from the input: figure ids, reference ids, "answer:..." ids for the founder's own answers, and "item:..." ids for data they supplied.
- Respect lower_is_better. Figures with confirmed false were read from files and not yet confirmed; don't rest a strong conclusion on them alone.
- If reference is empty, judge against the company's own figures, trend and the founder's target, and say plainly that no peer reference is available yet. Don't imply peer comparisons.
- Address the brief as far as the data allows. Where it doesn't, say what's missing in data_gaps and keep the conclusion proportionate; don't pad.
- summary: a one-sentence headline answering the question, then 2–4 sentences. findings: 3–6, concerns first. diagnosis: what's going on and why it matters, 2–4 sentences. decision: the recommended course of action in one or two sentences. actions: 3–6 concrete, prioritized actions with why, a horizon and the KPI to watch (a metric label from the input, or null). assumptions: what you had to assume. next_steps: 1–3 short items (data to add, what to re-check, which assessment to run next).
- Never refuse or stop because data is missing or unclear. Produce the best report the inputs allow, be explicit about what you could not determine, and list every gap in data_gaps.
- When completeness is "complete", the actions must be a clear, sequenced action plan that addresses the underlying constraint you diagnosed (for example retention, if that is what the data shows): concrete steps, each with a horizon and the KPI that will show progress toward the founder's target and date.
- When completeness is "partial" or "minimal", keep conclusions proportionate, make the first actions about closing the most important gaps, and still give the best guidance the data supports.
- If revision_notes is present, fix exactly what it lists: remove or correct those figures and use only valid ids.
- Write plainly for a founder. No hype, no consulting jargon.`;

export class AssessmentDraftError extends Error {}

export type AssessmentDraftResult = { output: AssessmentOutput; model: string; tokensIn: number; tokensOut: number };

export async function draftAssessment(input: AssessmentInput): Promise<AssessmentDraftResult> {
  if (e2eEnabled()) return { output: fakeAssessment(input), model: "e2e-fake", tokensIn: 0, tokensOut: 0 };
  let tokensIn = 0;
  let tokensOut = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "high", format: betaZodOutputFormat(assessmentOutputSchema) },
      messages: [{ role: "user", content: `Write the assessment from this input:\n\n${JSON.stringify(input, null, 2)}` }],
    });
    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;
    if (response.stop_reason === "refusal") throw new AssessmentDraftError("The draft was declined by the model.");
    if (response.stop_reason === "max_tokens") throw new AssessmentDraftError("The draft was cut off before it finished.");
    const parsed = assessmentOutputSchema.safeParse(response.parsed_output);
    if (parsed.success) return { output: parsed.data, model: response.model, tokensIn, tokensOut };
  }
  throw new AssessmentDraftError("The Draft Agent returned invalid output twice.");
}

const check = z.object({ result: z.enum(["pass", "fail"]), note: z.string() });
const qaSchema = z.object({
  data_consistency: check,
  method: check,
  source_trail: check,
  recommendation_logic: check,
  missing_inputs: check,
});

const QA_SYSTEM = `You are Growth Goaled's QA Agent. You independently check a founder's assessment before they see it. You see the exact input the Draft Agent was given and its output, nothing else.

Run five checks. Each is pass or fail with a short, specific note:
- data_consistency: every figure appears in the input (or is a simple difference between two input figures) and is described correctly.
- method: reference data is used only where given and correctly (lower-is-better respected), the founder's target is treated as their target, and no peer comparison is implied when there is no reference.
- source_trail: each statement cites ids that actually support it.
- recommendation_logic: the decision and actions follow from the evidence and answer the use case's question.
- missing_inputs: data gaps and open questions that could change the conclusion are acknowledged.

Be strict. A plausible but unsupported statement is a fail.`;

export class AssessmentQaError extends Error {}

/** Results use the stored QA keys; "method" is saved under benchmark_methodology. */
export async function qaAssessment(input: AssessmentInput, draft: AssessmentOutput): Promise<{ results: QaResults; model: string; tokensIn: number; tokensOut: number }> {
  if (e2eEnabled()) return { results: fakeQa(), model: "e2e-fake", tokensIn: 0, tokensOut: 0 };
  let tokensIn = 0;
  let tokensOut = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: QA_SYSTEM,
      output_config: { effort: "high", format: betaZodOutputFormat(qaSchema) },
      messages: [{ role: "user", content: `INPUT given to the Draft Agent:\n${JSON.stringify(input, null, 2)}\n\nDRAFT OUTPUT:\n${JSON.stringify(draft, null, 2)}\n\nRun the five checks.` }],
    });
    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;
    if (response.stop_reason === "refusal") throw new AssessmentQaError("The QA check was declined by the model.");
    if (response.stop_reason === "max_tokens") throw new AssessmentQaError("The QA check was cut off.");
    const parsed = qaSchema.safeParse(response.parsed_output);
    if (parsed.success) {
      const { method, ...rest } = parsed.data;
      return { results: { ...rest, benchmark_methodology: method }, model: response.model, tokensIn, tokensOut };
    }
  }
  throw new AssessmentQaError("The QA Agent returned invalid output twice.");
}

export { AI_MODEL as ASSESSMENT_MODEL };
