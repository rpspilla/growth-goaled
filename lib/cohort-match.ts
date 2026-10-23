import type { CohortCriteria } from "@/lib/db/schema";

/**
 * Rule-based cohort matching (no AI). Scores each candidate cohort on stage,
 * ARR range, GTM motion and business model, and explains the result so the
 * methodology shown to founders is computed, not written by a model.
 */

export type MatchCompany = {
  stage: string | null;
  /** Best-known ARR: an accepted data point if present, else the company row. */
  arr: number | null;
  revenueBand: string | null;
  salesModel: string | null;
  industry: string | null;
  primarySegment: string | null;
};

export type MatchCandidate = { id: string; name: string; criteria: CohortCriteria; approvedMetrics: string[] };

export type CohortMatch = {
  cohortId: string;
  score: number;
  matched: string[];
  unmatched: string[];
  /** Metrics the company has a value for and the cohort has an approved row for. */
  overlap: string[];
};

const BAND_RANGE: Record<string, [number, number]> = {
  lt_1m: [0, 1_000_000],
  "1m_3m": [1_000_000, 3_000_000],
  "3m_10m": [3_000_000, 10_000_000],
  "10m_20m": [10_000_000, 20_000_000],
  "20m_50m": [20_000_000, 50_000_000],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const firstWord = (s: string) => norm(s).split(" ")[0] ?? "";
const usd = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`);

export function scoreCohort(company: MatchCompany, cohort: MatchCandidate, companyMetrics: string[]): CohortMatch {
  const c = cohort.criteria;
  const matched: string[] = [];
  const unmatched: string[] = [];
  let score = 0;

  if (c.stage?.length) {
    if (company.stage && c.stage.some((s) => norm(s) === norm(company.stage!))) {
      score += 3;
      matched.push(`stage (${company.stage})`);
    } else unmatched.push(`stage (cohort: ${c.stage.join(" / ")}${company.stage ? `; company: ${company.stage}` : ""})`);
  }

  if (c.arr_min !== undefined || c.arr_max !== undefined) {
    const min = c.arr_min ?? 0;
    const max = c.arr_max ?? Number.POSITIVE_INFINITY;
    const range = `${c.arr_min !== undefined ? usd(c.arr_min) : "any"}–${c.arr_max !== undefined ? usd(c.arr_max) : "any"}`;
    if (company.arr !== null) {
      if (company.arr >= min && company.arr <= max) {
        score += 3;
        matched.push(`ARR band (${range})`);
      } else unmatched.push(`ARR band (cohort ${range}; company ${usd(company.arr)})`);
    } else if (company.revenueBand && BAND_RANGE[company.revenueBand]) {
      const [lo, hi] = BAND_RANGE[company.revenueBand]!;
      if (lo < max && hi > min) {
        score += 2;
        matched.push(`revenue band overlaps ${range}`);
      } else unmatched.push(`ARR band (cohort ${range})`);
    } else unmatched.push(`ARR band (company ARR unknown)`);
  }

  if (c.gtm_motion) {
    if (company.salesModel && norm(c.gtm_motion).includes(firstWord(company.salesModel))) {
      score += 2;
      matched.push(`GTM motion (${c.gtm_motion})`);
    } else unmatched.push(`GTM motion (cohort: ${c.gtm_motion}${company.salesModel ? `; company: ${company.salesModel}` : ""})`);
  }

  if (c.model) {
    const text = norm([company.industry, company.primarySegment].filter(Boolean).join(" "));
    if (text && norm(c.model).split(" ").some((w) => w.length > 2 && text.includes(w))) {
      score += 1;
      matched.push(`business model (${c.model})`);
    }
    // Business model isn't captured reliably yet, so a miss isn't held against the cohort.
  }

  const overlap = cohort.approvedMetrics.filter((m) => companyMetrics.includes(m));
  return { cohortId: cohort.id, score, matched, unmatched, overlap };
}

/** The best cohort with at least one comparable metric, or null. Ties go to the cohort with more overlapping metrics. */
export function matchCohort(company: MatchCompany, cohorts: MatchCandidate[], companyMetrics: string[]): CohortMatch | null {
  const scored = cohorts.map((c) => scoreCohort(company, c, companyMetrics)).filter((m) => m.overlap.length > 0);
  scored.sort((a, b) => b.score - a.score || b.overlap.length - a.overlap.length);
  return scored[0] ?? null;
}

/** Methodology text computed from the match, shown on the Benchmark page. */
export function methodologyText(cohort: { name: string; companyCount: number | null }, match: CohortMatch): string {
  const parts = [
    `Cohort "${cohort.name}" was selected by rule from the approved benchmark library.`,
    match.matched.length ? `Matched on ${match.matched.join(", ")}.` : "No criteria matched exactly; it was the closest cohort with comparable metrics.",
    match.unmatched.length ? `Not matched: ${match.unmatched.join("; ")}.` : null,
    cohort.companyCount ? `Cohort size n=${cohort.companyCount}.` : null,
    "Status compares each metric with the cohort's top quartile. Only advisor-approved benchmark rows are used.",
  ];
  return parts.filter(Boolean).join(" ");
}
