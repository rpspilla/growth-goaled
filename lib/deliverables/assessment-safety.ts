import type { AssessmentInput, AssessmentOutput } from "@/lib/ai/assessment";
import type { ClaimForCheck, CodeCheckResult } from "./checks";

/**
 * Keeps a Decision Brief from ever "breaking". Pure functions, so they're unit-tested:
 * - systemGaps: the gaps we can see in code (missing required data, unreadable files,
 *   unconfirmed figures), always shown, whatever the model wrote;
 * - sanitizeAssessment: drops statements that failed the code checks rather than hiding
 *   the whole brief;
 * - fallbackAssessment: an honest brief built only from the inputs and the rule-based
 *   diagnosis, used when the model couldn't produce one.
 */

/**
 * Claims the model wrote, keyed as stored in the content: decision, diagnosis, diagnosis.alt.N,
 * evidence.N, option.N, recommendation, action.N, trigger.N, follow.N.
 */
export function claimsFromAssessment(out: AssessmentOutput): ClaimForCheck[] {
  const anchor = [...new Set([...out.recommendation.sources, ...out.executive_decision.sources])];
  const d = out.diagnosis;
  return [
    { key: "decision", text: `${out.executive_decision.decision} ${out.executive_decision.conclusion}`, sources: out.executive_decision.sources },
    { key: "diagnosis", text: `${d.primary.title} ${d.primary.explanation} ${d.how_to_distinguish ?? ""}`, sources: d.primary.sources },
    ...d.alternatives.map((a, i) => ({ key: `diagnosis.alt.${i}`, text: `${a.title} ${a.assessment}`, sources: a.sources })),
    ...out.evidence.map((e, i) => ({ key: `evidence.${i}`, text: e.text, sources: e.sources })),
    ...out.alternatives.map((a, i) => ({ key: `option.${i}`, text: `${a.option} ${a.upside} ${a.downside} ${a.implications}`, sources: a.sources })),
    { key: "recommendation", text: `${out.recommendation.option} ${out.recommendation.why}`, sources: out.recommendation.sources },
    ...out.action_plan.map((a, i) => ({ key: `action.${i}`, text: `${a.action} ${a.rationale} ${a.success_metric} ${a.expected_signal} ${a.dependencies_risks} ${a.role ?? ""}`, sources: a.sources })),
    // Triggers and follow-up carry no citations of their own; they're checked for numbers against the brief's anchor.
    ...out.change_triggers.map((t, i) => ({ key: `trigger.${i}`, text: `${t.if_this} ${t.then_this}`, sources: anchor })),
    ...out.follow_up.metrics.map((m, i) => ({ key: `follow.${i}`, text: `${m.label} ${m.why}`, sources: anchor })),
    { key: "follow", text: out.follow_up.revisit_trigger, sources: anchor },
  ];
}

export type Completeness = "complete" | "partial" | "minimal";

export function systemGaps(input: AssessmentInput): string[] {
  const gaps: string[] = [];
  const missingRequired = input.data_supplied.filter((d) => d.priority === "required" && d.status !== "available" && d.status !== "partial" && d.status !== "not_applicable");
  for (const d of missingRequired) gaps.push(`${d.item} hasn't been shared yet, so conclusions that depend on it are limited.`);
  const partial = input.data_supplied.filter((d) => d.priority === "required" && d.status === "partial");
  for (const d of partial) gaps.push(`${d.item} is only partly available.`);
  const supplied = input.data_supplied.filter((d) => d.status === "available" || d.status === "partial");
  if (supplied.length && !input.figures.length) gaps.push("We couldn't read figures from the files you shared, so this report rests on your answers and the data you described.");
  for (const f of input.unreadable_files) gaps.push(`We couldn't read ${f}.`);
  for (const c of input.conflicts) gaps.push(`${c.label} has different values (${c.values}). Choose the right one under "Check your figures".`);
  const unconfirmed = input.figures.filter((f) => !f.confirmed);
  if (unconfirmed.length) gaps.push(`${unconfirmed.map((f) => f.label).join(", ")} ${unconfirmed.length === 1 ? "was" : "were"} read from your files and not yet confirmed by you.`);
  return gaps;
}

/** How complete the inputs are: drives the advisor offer (review vs. monthly support). */
export function completeness(input: AssessmentInput): Completeness {
  const required = input.data_supplied.filter((d) => d.priority === "required");
  const have = required.filter((d) => d.status === "available").length;
  if (have === required.length && input.figures.length >= 3 && input.figures.every((f) => f.confirmed) && !input.unreadable_files.length && !input.conflicts.length) return "complete";
  if (have === 0 && input.figures.length === 0) return "minimal";
  return "partial";
}

/**
 * Removes what failed the code checks. Listed statements that fail are dropped; a failing
 * decision, diagnosis or recommendation is replaced by an honest sentence, so the brief always renders.
 */
export function sanitizeAssessment(out: AssessmentOutput, check: CodeCheckResult): { output: AssessmentOutput; removed: number } {
  const bad = new Set([...check.untracedNumbers.map((u) => u.claim), ...check.unsourcedClaims, ...check.unknownSources.map((u) => u.claim)]);
  if (!bad.size) return { output: out, removed: 0 };
  const unknown = new Set(check.unknownSources.map((u) => u.id));
  const anchor = [...new Set([...out.executive_decision.sources, ...out.recommendation.sources, ...out.diagnosis.primary.sources])].filter((id) => !unknown.has(id));
  const keep = <T,>(prefix: string, xs: T[]) => xs.filter((_, i) => !bad.has(`${prefix}.${i}`));
  return {
    output: {
      ...out,
      executive_decision: bad.has("decision")
        ? { decision: "Work through the checked plan below, and review the open gaps before committing spend.", conclusion: "Part of the summary couldn't be verified against your data, so we've left it out.", sources: anchor }
        : out.executive_decision,
      diagnosis: {
        primary: bad.has("diagnosis")
          ? { candidate_id: null, title: "Not yet established", explanation: "We couldn't verify a full diagnosis against your data. An advisor review can close this gap.", sources: anchor }
          : out.diagnosis.primary,
        alternatives: keep("diagnosis.alt", out.diagnosis.alternatives),
        how_to_distinguish: bad.has("diagnosis") ? null : out.diagnosis.how_to_distinguish,
      },
      evidence: keep("evidence", out.evidence),
      alternatives: keep("option", out.alternatives),
      recommendation: bad.has("recommendation") ? { option: "Close the gaps, then decide", why: "The recommendation couldn't be verified against your data, so we've left it out.", sources: anchor } : out.recommendation,
      action_plan: keep("action", out.action_plan),
      change_triggers: keep("trigger", out.change_triggers),
      follow_up: {
        ...out.follow_up,
        metrics: keep("follow", out.follow_up.metrics),
        revisit_trigger: bad.has("follow") ? "Revisit sooner if a key figure moves sharply." : out.follow_up.revisit_trigger,
      },
      data_gaps: [...out.data_gaps, "Some statements couldn't be verified against your data and were left out."],
    },
    removed: bad.size,
  };
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * A brief built only from the inputs (no model): the rule-based diagnosis and its evidence,
 * every figure quoted verbatim, every statement sourced.
 */
export function fallbackAssessment(input: AssessmentInput): AssessmentOutput {
  const answerIds = input.founder_answers.map((a) => a.id);
  const figureIds = input.figures.map((f) => f.id);
  const items = input.data_supplied.filter((d) => d.status === "available" || d.status === "partial").map((d) => d.id);
  const all = [...figureIds, ...answerIds, ...items];
  // Something to cite is always available: the data items the use case asks for are inputs too.
  const anchor = all.length ? all.slice(0, 6) : input.data_supplied.slice(0, 3).map((d) => d.id);
  const dx = input.diagnosis;
  const top = dx?.candidates[0];
  const settled = Boolean(top && dx && dx.certainty !== "unresolved");
  const evText = new Map((dx?.evidence ?? []).map((e) => [e.id, e]));
  const cite = (c: NonNullable<typeof top>) => [`candidate:${c.id}`, ...c.supporting, ...c.contradicting, ...c.context];
  const explain = (c: NonNullable<typeof top>) =>
    [...c.supporting, ...c.context].map((id) => evText.get(id)?.text).filter(Boolean).join(" ") || "The rules found no evidence for or against this yet.";

  const evidence: AssessmentOutput["evidence"] = dx?.evidence.length
    ? dx.evidence.slice(0, 8).map((e) => ({
        text: e.text,
        status: e.kind === "calculated" ? "calculated" : e.kind === "inference" ? "inference" : /not confirmed/.test(e.text) ? "hypothesis" : "verified",
        bearing: top?.supporting.includes(e.id) ? "supports" : top?.contradicting.includes(e.id) ? "contradicts" : "context",
        dimension: null,
        sources: [e.id],
      }))
    : input.figures.slice(0, 6).map((f) => ({
        text: `${f.label} is ${f.value}${f.confirmed ? "" : " (read from your file, not yet confirmed)"}.`,
        status: f.origin === "calculated" ? "calculated" : f.confirmed ? "verified" : "hypothesis",
        bearing: "context",
        dimension: null,
        sources: [f.id],
      }));

  const options = [
    { option: top ? `Act on the leading explanation: ${lowerFirst(top.title)}` : "Act on the figures you have now", upside: "Starts fixing the likely constraint straight away.", downside: "If the explanation is wrong, effort goes to the wrong place.", implications: "Needs the checks in the plan to confirm it early.", sources: top ? cite(top) : anchor },
    { option: "Close the main data gaps first, then decide", upside: "A firmer diagnosis before committing time or budget.", downside: "A few weeks' delay before acting.", implications: "Share the missing data and confirm the figures listed below.", sources: anchor },
  ];

  return {
    executive_decision: {
      decision: settled ? `Start with ${lowerFirst(top!.title)}.` : "Close the most important data gaps before committing to a course of action.",
      conclusion: `We couldn't complete the full written analysis this time, so this brief sets out the rule-based diagnosis from your data, the gaps and the next steps. ${input.reference_note}`,
      sources: top ? [...cite(top).slice(0, 4), ...anchor.slice(0, 2)] : anchor,
    },
    diagnosis: top
      ? {
          primary: { candidate_id: top.id, title: settled ? top.title : `Not yet established. Most plausible: ${lowerFirst(top.title)}`, explanation: explain(top), sources: cite(top) },
          alternatives: dx!.candidates.slice(1, 4).map((c) => ({ candidate_id: c.id, title: c.title, assessment: explain(c), sources: cite(c) })),
          how_to_distinguish: top.test,
        }
      : {
          primary: { candidate_id: null, title: "Not yet established", explanation: "There isn't enough verified data yet to identify the main constraint. The gaps below say what would make the difference.", sources: anchor },
          alternatives: [],
          how_to_distinguish: null,
        },
    evidence,
    alternatives: options,
    recommendation: settled
      ? { option: options[0]!.option, why: "The calculated evidence points to it more than to the alternatives; the first action checks it quickly.", sources: options[0]!.sources }
      : { option: options[1]!.option, why: "The data can't yet separate the possible explanations, so acting now risks fixing the wrong thing.", sources: anchor },
    action_plan: [
      ...(top ? [{ priority: 1, action: top.test, rationale: "Confirms or rules out the leading explanation quickly.", timing: "next_30_days" as const, role: null, success_metric: "A clear answer on whether this is the main constraint", metric_key: null, expected_signal: "The pattern either holds across accounts or it doesn't.", dependencies_risks: "Needs the underlying records to hand.", dimension: null, sources: cite(top) }] : []),
      { priority: top ? 2 : 1, action: "Share the missing required data and confirm the figures read from your files.", rationale: "The full analysis depends on it.", timing: "next_30_days", role: null, success_metric: "All required data marked available", metric_key: null, expected_signal: "No open gaps under Data.", dependencies_risks: "Someone needs time to export the data.", dimension: null, sources: anchor },
      { priority: top ? 3 : 2, action: "Re-run the assessment once the data is in.", rationale: "You'll get the full written brief and plan.", timing: "days_31_60", role: null, success_metric: "A complete brief", metric_key: null, expected_signal: "A firmer diagnosis.", dependencies_risks: "Depends on the step above.", dimension: null, sources: anchor },
      // One first step per plan dimension, so the plan keeps its shape even without the written analysis.
      ...(input.plan_dimensions ?? []).map((d, i) => ({
        priority: (top ? 4 : 3) + i,
        action: `Share and review the data for ${d.title.toLowerCase()}.`,
        rationale: d.summary,
        timing: (["next_30_days", "days_31_60", "days_61_90"] as const)[Math.min(i, 2)]!,
        role: null,
        success_metric: `${d.title}: data shared and reviewed`,
        metric_key: null,
        expected_signal: "A first read on this area in the next version of the plan.",
        dependencies_risks: "Needs the data listed for this area.",
        dimension: d.id,
        sources: anchor,
      })),
    ],
    change_triggers: [{ if_this: "Confirmed figures or new data point to a different constraint", then_this: "The recommendation changes to address that constraint instead." }],
    follow_up: {
      metrics: input.figures.filter((f) => input.trackable_metrics?.includes(f.metric)).slice(0, 4).map((f) => ({ metric_key: f.metric, label: f.label, why: "A key figure for this decision." })),
      revisit_in_days: 30,
      revisit_trigger: "Revisit as soon as the missing data is in.",
    },
    assumptions: ["This is a partial brief: the written analysis didn't complete, so it goes no further than the rule-based diagnosis and your figures."],
    data_gaps: [...(dx?.unknowns ?? [])],
  };
}
