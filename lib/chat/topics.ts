import type { UseCaseId } from "@/lib/use-cases/types";

/**
 * The founder's conversation starters (wording fixed by the owner, Nov 2026). They're entry points
 * into one engine: each names what to evaluate and what a good answer produces, and the paid
 * assessment that goes deeper when there is one.
 */
export type ChatTopic = {
  id: string;
  starter: string;
  /** What to look at before recommending (methodology, in brief). */
  evaluate: readonly string[];
  /** What a complete answer gives the founder. */
  output: string;
  /** The $149 assessment that goes deeper on this question, if any. */
  deepAssessment?: UseCaseId;
  /** Answers rest on pay or equity data: only cite the Benchmark Library's sourced records. */
  usesCompensationData?: boolean;
};

export const CHAT_TOPICS: readonly ChatTopic[] = [
  {
    id: "revenue_engine",
    starter: "How do I build a repeatable revenue engine?",
    evaluate: ["ICP and customer segmentation", "positioning and messaging", "demand generation and pipeline sources", "founder-led sales effectiveness", "sales process and conversion", "sales cycle and deal size", "customer acquisition economics", "sales capacity", "retention and expansion", "revenue predictability"],
    output: "a prioritized roadmap for building repeatable revenue",
    deepAssessment: "winning_icp",
  },
  {
    id: "first_gtm_hire",
    starter: "Who should my first GTM hire be?",
    evaluate: ["current founder-led sales motion", "product-market fit signals", "sales repeatability", "existing pipeline", "customer profile", "ACV and sales complexity", "available cash and runway", "expected responsibilities"],
    output: "the recommended role, seniority, timing and hiring profile",
    deepAssessment: "hire_or_fix",
  },
  {
    id: "hiring_profiles",
    starter: "What hiring profiles should I be looking for?",
    evaluate: ["business stage", "sales motion", "ACV", "sales cycle", "customer complexity", "existing team capabilities", "leadership requirements", "budget"],
    output: "the recommended role profile, experience, capabilities, compensation expectations and interview criteria",
    deepAssessment: "hire_or_fix",
    usesCompensationData: true,
  },
  {
    id: "sales_pay",
    starter: "How much should I pay a salesperson?",
    evaluate: ["geography", "seniority", "role type", "company stage", "ACV", "sales cycle", "quota", "base-to-variable mix", "available budget"],
    output: "a recommended compensation range, pay mix and rationale, with sourced data kept apart from estimates",
    usesCompensationData: true,
  },
  {
    id: "sales_equity",
    starter: "How much equity should I give my first sales hire?",
    evaluate: ["company stage", "role seniority", "cash compensation", "scope of responsibility", "existing equity structure", "expected contribution", "hiring market"],
    output: "a reasoned equity range and the tradeoffs behind it, never presented as a universal market fact",
    usesCompensationData: true,
  },
  {
    id: "quota",
    starter: "How do I set a quota for my sales team?",
    evaluate: ["ACV", "sales cycle", "win rate", "pipeline coverage", "ramp time", "lead generation capacity", "historical performance", "rep capacity", "compensation structure"],
    output: "a recommended quota with its assumptions, ramp schedule and how to measure it",
  },
  {
    id: "commission",
    starter: "What should my salesperson's commission plan look like?",
    evaluate: ["ACV", "gross margin", "sales cycle", "new versus expansion revenue", "quota", "base compensation", "commission rates", "accelerators", "payment timing", "clawbacks and exceptions"],
    output: "a practical commission plan with worked examples and its economic implications",
    usesCompensationData: true,
  },
  {
    id: "fundraising",
    starter: "Are we ready to raise our next round?",
    evaluate: ["revenue growth", "ARR quality", "growth efficiency", "retention", "customer concentration", "sales repeatability", "pipeline", "burn and runway", "team capabilities", "market opportunity"],
    output: "a Ready / Close / Not yet assessment with key strengths and weaknesses, the questions investors are likely to ask, priority gaps and a 90-day plan (no checklist guarantees a raise)",
    deepAssessment: "series_a_ready",
  },
  {
    id: "more_salespeople",
    starter: "Should we hire more salespeople?",
    evaluate: ["current rep productivity", "pipeline coverage", "conversion rates", "sales cycle", "ramp time", "lead generation", "manager capacity", "process consistency", "unit economics"],
    output: "a hire, fix or wait recommendation with its rationale",
    deepAssessment: "hire_or_fix",
  },
  {
    id: "pipeline_conversion",
    starter: "Why isn't our pipeline converting?",
    evaluate: ["lead quality", "ICP fit", "qualification", "discovery", "positioning", "competitive differentiation", "objections", "sales process", "follow-up", "pricing", "win/loss patterns"],
    output: "the likely conversion bottlenecks and specific interventions",
    deepAssessment: "winning_icp",
  },
  {
    id: "retention_efficiency",
    starter: "How can we improve retention and revenue efficiency?",
    evaluate: ["gross and net revenue retention", "churn", "expansion", "customer segmentation", "activation", "onboarding", "customer acquisition cost", "payback", "gross margin", "customer success capacity"],
    output: "prioritized opportunities to improve retention, expansion and capital efficiency",
    deepAssessment: "growth_leak",
  },
  {
    id: "other",
    starter: "Something else.",
    evaluate: ["what decision the founder is actually facing", "the closest applicable framework above, adapted rather than forced"],
    output: "a useful answer to the problem as the founder describes it",
  },
];

const BY_ID = new Map(CHAT_TOPICS.map((t) => [t.id, t]));
export const getChatTopic = (id: string): ChatTopic | undefined => BY_ID.get(id);

/** Bumped whenever the chat's instructions, topics or output shape change; stored on every recommendation. */
export const CHAT_METHODOLOGY_VERSION = "chat-2026-11-02.1";

/** The conversation a Library question leads into (its action plan is bought there). */
export const TOPIC_FOR_USE_CASE: Partial<Record<UseCaseId, string>> = {
  winning_icp: "revenue_engine",
  hire_or_fix: "more_salespeople",
  growth_leak: "retention_efficiency",
  series_a_ready: "fundraising",
};
