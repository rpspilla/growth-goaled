import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { QaResults } from "@/lib/db/schema";
import { e2eEnabled } from "@/lib/e2e";
import type { UseCaseId } from "@/lib/use-cases";
import { AI_MODEL, anthropic } from "./config";
import { fakeAssessment, fakeQa } from "./fake";

/**
 * The Decision Brief agents (HANDOFF §13.9): one Draft Agent and one QA Agent for every use
 * case. Everything factual is prepared in code first: figures (with origin, method and period),
 * tables computed from the founder's files, and a rule-based diagnosis with ranked candidates
 * and evidence. The model interprets and explains; it never calculates, and it cites the ids
 * it was given.
 */

export type AssessmentInput = {
  use_case: { id: UseCaseId; question: string; founder_gets: readonly string[]; brief: string };
  company: { name: string; stage: string | null; industry: string | null; primary_segment: string | null; sales_model: string | null; revenue_band: string | null };
  /** ids "answer:<field>" */
  founder_answers: { id: string; question: string; answer: string }[];
  founder_target: { metric: string; value: string; by: string | null } | null;
  /** ids are data point ids. origin: calculated (in code from their rows), manual (they entered it), extracted (read from a document). */
  figures: { id: string; metric: string; label: string; value: string; lower_is_better: boolean; confirmed: boolean; period: string | null; origin?: string; method?: string | null; sample_size?: number | null }[];
  /** ids "item:<key>": what data the founder has supplied for this question */
  data_supplied: { id: string; item: string; priority: "required" | "helpful" | "optional"; status: string; coverage: string | null; files: number; columns: string[] }[];
  /**
   * Benchmark comparisons computed in code from published Benchmark Library records (ids are
   * record ids). Empty when no sufficiently relevant benchmark exists. `quality` "directional"
   * means the cohort or definition match is weak; say so whenever you use it.
   */
  reference: {
    id: string;
    metric: string;
    label: string;
    quality: "strong" | "directional";
    company_value: string;
    benchmark_values: string[];
    difference: string | null;
    position: string | null;
    cohort: string;
    period: string;
    source: string;
    limitations: string[];
  }[];
  reference_note: string;
  /** Rule-based diagnosis from code. Candidate ids "candidate:<id>", evidence ids "ev:<n>". */
  diagnosis?: {
    certainty: "established" | "leading" | "unresolved";
    candidates: { id: string; title: string; arr_at_stake: string | null; context: string[]; supporting: string[]; contradicting: string[]; test: string }[];
    evidence: { id: string; text: string; kind: "calculated" | "reported" | "inference" }[];
    unknowns: string[];
  };
  /** ids "analysis:<n>": tables computed in code (ARR bridge, segment breakdowns, pipeline). */
  analyses?: { id: string; title: string; rows: string[] }[];
  open_questions: { type: string; title: string }[];
  /** Files the founder shared that couldn't be read. */
  unreadable_files: string[];
  /** Metrics where the profile and files disagree and the founder hasn't chosen yet. */
  conflicts: { metric: string; label: string; values: string }[];
  /** "complete" when all required data is in and confirmed; changes what the plan should look like. */
  completeness: "complete" | "partial" | "minimal";
  /** Metric keys the plan can name as success metrics (tracked on Progress). */
  trackable_metrics?: string[];
  /** Present on a second attempt: what the code checks rejected last time. */
  revision_notes?: string;
};

const sources = z.array(z.string());

export const assessmentOutputSchema = z.object({
  executive_decision: z.object({ decision: z.string(), conclusion: z.string(), sources }),
  diagnosis: z.object({
    primary: z.object({ candidate_id: z.string().nullable(), title: z.string(), explanation: z.string(), sources }),
    alternatives: z.array(z.object({ candidate_id: z.string().nullable(), title: z.string(), assessment: z.string(), sources })),
    how_to_distinguish: z.string().nullable(),
  }),
  evidence: z.array(z.object({ text: z.string(), status: z.enum(["verified", "calculated", "inference", "hypothesis"]), bearing: z.enum(["supports", "contradicts", "context"]), sources })),
  alternatives: z.array(z.object({ option: z.string(), upside: z.string(), downside: z.string(), implications: z.string(), sources })),
  recommendation: z.object({ option: z.string(), why: z.string(), sources }),
  action_plan: z.array(
    z.object({
      priority: z.number().int(),
      action: z.string(),
      rationale: z.string(),
      timing: z.enum(["next_30_days", "days_31_60", "days_61_90"]),
      role: z.string().nullable(),
      success_metric: z.string(),
      metric_key: z.string().nullable(),
      expected_signal: z.string(),
      dependencies_risks: z.string(),
      sources,
    }),
  ),
  change_triggers: z.array(z.object({ if_this: z.string(), then_this: z.string() })),
  follow_up: z.object({
    metrics: z.array(z.object({ metric_key: z.string().nullable(), label: z.string(), why: z.string() })),
    revisit_in_days: z.number().int(),
    revisit_trigger: z.string(),
  }),
  assumptions: z.array(z.string()),
  data_gaps: z.array(z.string()),
});

export type AssessmentOutput = z.infer<typeof assessmentOutputSchema>;

/** The decision each framework must support (HANDOFF §13.3 and the pricing brief). */
export const ASSESSMENT_BRIEFS: Record<UseCaseId, string> = {
  growth_leak:
    "Decide where growth is leaking and what to do first. Use the ARR bridge (new, expansion, contraction, churn), pipeline generation and conversion, sales-cycle changes, channels, segments and retention. Name the most consequential constraint with its evidence and competing explanations, the next investigation or intervention, and which assessment to run next if appropriate.",
  series_a_ready:
    "Decide whether to start a Series A process now, and what to fix first. Judge readiness area by area: revenue traction and growth consistency, retention and expansion, GTM repeatability, sales efficiency and customer concentration, team and operating discipline, runway and timing. Give likely investor questions, material evidence gaps and a 90-day preparation plan. Never present a universal threshold as a requirement; compare only with the benchmark comparisons given, otherwise with the company's own trend.",
  series_b_ready:
    "Decide whether the business can support a Series B narrative now. Judge sustained growth and retention, repeatable acquisition and expansion, revenue quality and efficiency, sales and organisational scalability, forecasting reliability, capital needs and operating leverage. These are Series B questions: emphasise durability, efficiency and predictability over early traction. Give risks to the narrative, the evidence needed, and a preparation plan.",
  hire_or_fix:
    "Decide between hiring more salespeople now, fixing the process first, or gathering more evidence. Use pipeline volume and quality, conversion by stage and source, cycle and win/loss, team capacity and productivity, founder involvement, ramp time and hiring cost, runway. Name the likely bottleneck, the hiring sequence and role if hiring is right, and the conditions that would change the answer. A large pipeline or a recent raise is not by itself a reason to hire.",
  winning_icp:
    "Decide which customers to focus on. Rank segments using win rate, contract value, cycle, retention, expansion, channel and service cost where measurable, flagging sample-size limits. Recommend the primary ICP and segments to deprioritise, with implications for positioning, qualification and channels, and the data that would validate it.",
  founder_handoff:
    "Decide the next step toward sales that work without the founder: better documentation, a first account executive, a sales leader, or more validation. Use founder participation in deals, stages and qualification, documented process, sources of won deals, win/loss by owner, and capacity. Several founder-closed wins do not show repeatability. Give the process gaps, hiring sequence and readiness criteria, and metrics to watch after the transition.",
};

const SYSTEM = `You are Growth Goaled's Draft Agent. You write a Decision Brief that helps a founder make one growth decision, from evidence prepared in code.

The input has the company's figures (each with origin, method and period), tables computed from their files (analyses), benchmark comparisons computed in code from the published Benchmark Library (possibly none), the founder's answers and target, and a rule-based diagnosis: ranked candidate constraints with supporting, contradicting and context evidence, and a certainty set by rule.

Rules:
- Never calculate or estimate figures. Use only numbers in the input, written as they appear there. You may state a simple difference between two input figures. Never invent benchmarks, "typical" values, owners, deadlines or results.
- Cite sources on every statement using only input ids: figure ids, reference ids, "answer:", "item:", "ev:", "candidate:" and "analysis:" ids.
- Respect lower_is_better. Figures with confirmed false were read from files and not yet confirmed; don't rest a strong conclusion on them alone.
- Respect diagnosis.certainty. "established": lead with that candidate. "leading": present it as the most likely explanation and say what would confirm it. "unresolved": do not pick a root cause; make primary the most plausible explanation, framed as not yet established, put the others in alternatives, and fill how_to_distinguish with the fastest way to tell them apart. If you rank candidates differently from the input, say why.
- evidence: 3–8 key facts, each with a status (verified = a confirmed figure or the founder's answer; calculated = computed in code; inference = your reasoning from evidence; hypothesis = plausible but untested) and whether it supports or contradicts the primary explanation, or is context. Include contradicting evidence when it exists.
- alternatives: 2–4 realistic options for the decision (including doing nothing or gathering more evidence when relevant), each with upside, downside and implications. Quantify only with input numbers.
- recommendation: the option you recommend and why it beats the others.
- action_plan: 3–6 actions over 30–90 days, priority 1 first. role only when the input makes it clear, else null. success_metric names what to measure; metric_key is one of trackable_metrics when it fits, else null. expected_signal says what progress would look like, framed as a recommendation, not a fact. Include dependencies and risks.
- change_triggers: 2–4 pieces of new evidence or circumstances that would change the recommendation.
- follow_up: the metrics to monitor, when to revisit (days), and what should trigger an earlier revisit.
- Benchmarks (reference) were matched and calculated in code: quote their values, differences and positions exactly as written, with the cohort, period and source. Call a "directional" comparison directional. A gap to a benchmark is not by itself a root cause: tie any recommendation to the company's own evidence. If reference is empty, say plainly that no relevant benchmark is available; don't imply peer comparisons.
- Never refuse or stop because data is missing: be explicit about what you couldn't determine and list every gap in data_gaps. For metrics in conflicts, don't conclude on either value.
- When completeness is "complete", the plan must be a clear, sequenced plan against the diagnosed constraint (for example retention, if that is what the evidence shows). When "partial" or "minimal", keep conclusions proportionate and make the first actions about closing the most important gaps.
- If revision_notes is present, fix exactly what it lists.
- Write plainly and concisely for a founder. Lead with the conclusion. No hype or consulting jargon.`;

export class AssessmentDraftError extends Error {}

export type AssessmentDraftResult = { output: AssessmentOutput; model: string; tokensIn: number; tokensOut: number };

export async function draftAssessment(input: AssessmentInput): Promise<AssessmentDraftResult> {
  if (e2eEnabled()) return { output: fakeAssessment(input), model: "e2e-fake", tokensIn: 0, tokensOut: 0 };
  let tokensIn = 0;
  let tokensOut = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 20000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "high", format: betaZodOutputFormat(assessmentOutputSchema) },
      messages: [{ role: "user", content: `Write the Decision Brief from this input:\n\n${JSON.stringify(input, null, 2)}` }],
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

const QA_SYSTEM = `You are Growth Goaled's QA Agent. You independently check a founder's Decision Brief before they see it. You see the exact input the Draft Agent was given and its output, nothing else.

Run five checks. Each is pass or fail with a short, specific note:
- data_consistency: every figure appears in the input (or is a simple difference between two input figures) and is described correctly, with the right period.
- method: the brief respects the rule-based certainty, uses benchmark comparisons only where given, quotes them exactly, labels directional ones and doesn't treat a benchmark gap as proof of cause, treats the founder's target as theirs, and labels inferences and hypotheses as such.
- source_trail: each statement cites ids that actually support it, and contradicting evidence isn't hidden.
- recommendation_logic: the recommendation follows from the evidence, is compared fairly with the alternatives, and the plan addresses the diagnosed constraint.
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
