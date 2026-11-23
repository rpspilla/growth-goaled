/**
 * The multi-CRO evaluation rubric (Nov 24, 2026), from the brief's section 10. Every criterion is
 * scored 1–5 (5 best) by a judge, or null when it doesn't apply to a single-turn scenario.
 */

export const SHARED_CRITERIA = {
  context_awareness: "Context awareness: uses the company's situation and stage",
  diagnosis: "Diagnosis: finds the underlying problem, not just the symptom",
  commercial_judgment: "Commercial judgment: a CRO-grade call on the tradeoffs",
  prioritization: "Prioritization: says what matters most, and what not to do",
  actionability: "Actionability: clear next steps the founder can take this week",
  accuracy: "Accuracy: no invented facts, figures or benchmarks",
  continuity: "Continuity: builds on what's known (n/a for a single question)",
  appropriate_challenge: "Appropriate challenge: pushes back where the evidence says so",
  founder_experience: "Founder experience: clear, direct, respectful of their time",
} as const;

export const INDIVIDUAL_CRITERIA = {
  reflects_expertise: "Reflects the selected CRO's expertise",
  follows_philosophy: "Follows their philosophy",
  uses_frameworks: "Uses their relevant frameworks",
  communication_style: "Communicates in their style",
  no_invented_experience: "Doesn't invent personal experiences, clients or credentials",
  separates_knowledge: "Keeps the CRO's documented knowledge apart from generated reasoning",
} as const;

export const COLLECTIVE_CRITERIA = {
  retrieves_multiple: "Draws on relevant expertise from several CROs",
  avoids_over_reliance: "Doesn't over-rely on a single contributor",
  synthesizes: "Synthesizes the perspectives appropriately",
  recognizes_disagreement: "Recognizes disagreement where it exists",
  preserves_attribution: "Preserves attribution",
  coherent_recommendation: "Produces one coherent recommendation",
  avoids_averaging: "Avoids simply averaging opinions",
} as const;

export type Criterion = keyof typeof SHARED_CRITERIA | keyof typeof INDIVIDUAL_CRITERIA | keyof typeof COLLECTIVE_CRITERIA;
export const criteriaFor = (mode: "individual" | "collective") => ({ ...SHARED_CRITERIA, ...(mode === "individual" ? INDIVIDUAL_CRITERIA : COLLECTIVE_CRITERIA) }) as Record<Criterion, string>;

/** The brief's founder experience scenarios, always in the test set. */
export const BUILT_IN_SCENARIOS = [
  { key: "BRIEF-1", category: "Hiring & Organization", stage: "Seed", situation: "$500k in runway, growing 8% month over month.", question: "Should we hire two salespeople?" },
  { key: "BRIEF-2", category: "Hiring & Organization", stage: "Seed", situation: "$1.5M ARR; the founder still leads sales.", question: "Should we hire our first VP of Sales or keep the founder leading sales?" },
] as const;

/** Mean per criterion over the results that scored it (rounded to one decimal). */
export function averages(results: { scores: Record<string, number | null> | null }[]): Record<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const r of results)
    for (const [k, v] of Object.entries(r.scores ?? {})) {
      if (typeof v !== "number") continue;
      const s = sums.get(k) ?? { total: 0, n: 0 };
      sums.set(k, { total: s.total + v, n: s.n + 1 });
    }
  return Object.fromEntries([...sums].map(([k, s]) => [k, Math.round((s.total / s.n) * 10) / 10]));
}
