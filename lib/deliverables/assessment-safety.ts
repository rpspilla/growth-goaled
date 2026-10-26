import type { AssessmentInput, AssessmentOutput } from "@/lib/ai/assessment";
import type { ClaimForCheck, CodeCheckResult } from "./checks";

/**
 * Keeps an assessment from ever "breaking". Pure functions, so they're unit-tested:
 * - systemGaps: the gaps we can see in code (missing required data, unreadable files,
 *   unconfirmed figures), always shown, whatever the model wrote;
 * - sanitizeAssessment: drops statements that failed the code checks rather than hiding
 *   the whole report;
 * - fallbackAssessment: a plain, honest report built only from the inputs, used when the
 *   model couldn't produce one.
 */

/** Claims the model wrote, keyed as stored in the content (summary, finding.N, diagnosis, decision, action.N). */
export function claimsFromAssessment(out: AssessmentOutput): ClaimForCheck[] {
  return [
    { key: "summary", text: `${out.summary.headline} ${out.summary.body}`, sources: out.summary.sources },
    ...out.findings.map((f, i) => ({ key: `finding.${i}`, text: f.text, sources: f.sources })),
    { key: "diagnosis", text: out.diagnosis.text, sources: out.diagnosis.sources },
    { key: "decision", text: out.decision.text, sources: out.decision.sources },
    ...out.actions.map((a, i) => ({ key: `action.${i}`, text: `${a.action} ${a.why}`, sources: a.sources })),
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
  if (!input.founder_answers.length) gaps.push("The questionnaire wasn't answered, so the report can't reflect your goal or context.");
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
 * Removes what failed the code checks. Findings and actions that fail are dropped; a failing
 * summary, diagnosis or decision is replaced by an honest sentence, so the report always renders.
 */
export function sanitizeAssessment(out: AssessmentOutput, check: CodeCheckResult): { output: AssessmentOutput; removed: number } {
  const bad = new Set([...check.untracedNumbers.map((u) => u.claim), ...check.unsourcedClaims, ...check.unknownSources.map((u) => u.claim)]);
  if (!bad.size) return { output: out, removed: 0 };
  const findings = out.findings.filter((_, i) => !bad.has(`finding.${i}`));
  const actions = out.actions.filter((_, i) => !bad.has(`action.${i}`));
  const anchor = [...new Set([...out.summary.sources, ...out.decision.sources, ...out.diagnosis.sources])].filter((id) => !check.unknownSources.some((u) => u.id === id));
  const safe = (text: string) => ({ text, sources: anchor });
  return {
    output: {
      ...out,
      summary: bad.has("summary")
        ? { headline: "Here's what we can say from the data you shared.", body: "Part of the summary couldn't be verified against your data, so we've left it out. The findings and actions below were checked.", sources: anchor }
        : out.summary,
      diagnosis: bad.has("diagnosis") ? safe("We couldn't verify a full diagnosis against your data. An advisor review can close this gap.") : out.diagnosis,
      decision: bad.has("decision") ? safe("Work through the checked actions below, and review the open gaps with an advisor before committing spend.") : out.decision,
      findings,
      actions,
      data_gaps: [...out.data_gaps, "Some statements couldn't be verified against your data and were left out."],
    },
    removed: bad.size,
  };
}

/** A report built only from the inputs (no model): every figure quoted verbatim, every statement sourced. */
export function fallbackAssessment(input: AssessmentInput): AssessmentOutput {
  const answerIds = input.founder_answers.map((a) => a.id);
  const goal = input.founder_answers.find((a) => a.id === "answer:goal");
  const figureIds = input.figures.map((f) => f.id);
  const items = input.data_supplied.filter((d) => d.status === "available" || d.status === "partial").map((d) => d.id);
  const all = [...figureIds, ...answerIds, ...items];
  // Something to cite is always available: the data items the use case asks for are inputs too.
  const anchor = all.length ? all.slice(0, 6) : input.data_supplied.slice(0, 3).map((d) => d.id);
  const watch = input.figures.filter((f) => {
    const r = input.reference.find((x) => x.metric === f.metric);
    return Boolean(r);
  });
  return {
    summary: {
      headline: `A first view of ${input.use_case.question.replace(/\?$/, "").toLowerCase()}, from what you've shared.`,
      body: `${goal ? `You told us: “${goal.answer.slice(0, 200)}”. ` : ""}We couldn't complete the full automated analysis this time, so this report sets out the figures and data we have, what's missing, and the next steps. ${input.reference_note}`,
      sources: anchor,
    },
    findings: [
      ...input.figures.slice(0, 5).map((f) => ({
        kind: "concern" as const,
        text: `${f.label} is ${f.value}${f.confirmed ? "" : " (read from your file, not yet confirmed)"}${input.reference.find((r) => r.metric === f.metric) ? `; peer top quartile ${input.reference.find((r) => r.metric === f.metric)!.top_quartile}` : ""}.`,
        sources: [f.id, ...(input.reference.find((r) => r.metric === f.metric) ? [input.reference.find((r) => r.metric === f.metric)!.id] : [])],
      })),
      ...(input.figures.length ? [] : items.slice(0, 3).map((id) => ({ kind: "strength" as const, text: `You've shared ${input.data_supplied.find((d) => d.id === id)!.item.toLowerCase()}.`, sources: [id] }))),
    ],
    diagnosis: {
      text: watch.length
        ? "The figures above are compared with approved peer reference data where it exists. A full diagnosis needs the gaps below closed."
        : "There isn't enough verified data yet for a full diagnosis. The gaps below say what would make the difference.",
      sources: anchor,
    },
    decision: { text: "Close the most important data gaps, then re-run the assessment; review the open questions with an advisor in the meantime.", sources: anchor },
    actions: [
      { action: "Share the missing required data listed below.", why: "It's what the full analysis depends on.", horizon: "next_30_days", kpi: null, sources: anchor },
      { action: "Confirm the figures read from your files.", why: "Confirmed figures make the conclusions firmer.", horizon: "next_30_days", kpi: null, sources: anchor },
      { action: "Re-run the assessment once the data is in.", why: "You'll get the full findings and action plan.", horizon: "next_30_days", kpi: null, sources: anchor },
    ],
    assumptions: ["This is a partial report: the automated analysis didn't complete, so no conclusions beyond the figures above are drawn."],
    data_gaps: [],
    next_steps: ["Add the missing data and re-run.", "Book a review with an advisor to go through the gaps."],
  };
}
