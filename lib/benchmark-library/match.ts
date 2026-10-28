import { METRICS, type MetricKey } from "@/lib/metrics";
import { cohortKey, compatibleBases, describeCohort, expectedUnit, PERIOD_BASIS_LABEL, type RecordInput } from "./records";

/**
 * Benchmark retrieval: which published record set (if any) a company's figure may be compared
 * with. Pure and deterministic, separate from the UI and the model prompts.
 *
 * A record is only eligible when it measures the same thing: the same Growth Goaled metric, the
 * same unit, and a reporting basis that matches our definition. Then the cohort must not
 * contradict what we know about the company (stage, ARR, ACV, segment). Among eligible cohorts,
 * specific, well-documented ones beat broad ones; a metric name alone is never enough.
 */

export type SourceInfo = {
  id: string;
  name: string;
  publisher: string | null;
  url: string | null;
  documentRef: string | null;
  publishedOn: string | null;
  attribution: string | null;
  kind: "published_report" | "licensed_dataset" | "internal_research" | "aggregated_customer";
  reliability: "unverified" | "reliable" | "use_with_caution" | "unreliable";
  allowCustomerDisplay: boolean;
  allowDerived: boolean;
  reviewIntervalDays: number | null;
};

export type CandidateRecord = RecordInput & {
  id: string;
  versionId: string;
  version: number;
  datasetId: string;
  datasetName: string;
  /** When the version was published, or last marked reviewed (whichever is later). */
  reviewedAt: Date | null;
  source: SourceInfo;
};

export type CompanyProfile = {
  stage: string | null;
  arr: number | null;
  revenueBand: string | null;
  industry: string | null;
  segment: string | null;
  acv: number | null;
};

export type Override = { recordId: string | null; reason: string } | undefined;

export type BenchmarkMatch =
  | {
      status: "matched";
      metric: MetricKey;
      quality: "strong" | "directional";
      selection: "auto" | "override";
      /** Every statistic the source gives for the chosen cohort and period (median, percentiles…). */
      records: CandidateRecord[];
      matchedOn: string[];
      caveats: string[];
      /** Other sources with eligible values for this metric: kept separate, never averaged. */
      alternatives: { datasetName: string; sourceName: string; cohort: string; period: string }[];
    }
  | { status: "none"; metric: MetricKey; reason: string; excluded: { recordId: string; reason: string }[] };

/** Default review interval for a dataset when its source doesn't set one. */
export const DEFAULT_REVIEW_DAYS = 365;

export function isStale(r: Pick<CandidateRecord, "reviewedAt" | "source">, now = new Date()): boolean {
  if (!r.reviewedAt) return true;
  const days = r.source.reviewIntervalDays ?? DEFAULT_REVIEW_DAYS;
  return now.getTime() - r.reviewedAt.getTime() > days * 86_400_000;
}

const BAND: Record<string, [number, number]> = {
  lt_1m: [0, 1_000_000],
  "1m_3m": [1_000_000, 3_000_000],
  "3m_10m": [3_000_000, 10_000_000],
  "10m_20m": [10_000_000, 20_000_000],
  "20m_50m": [20_000_000, 50_000_000],
};

/** Record stages the company's stage counts as (the profile's "Series B+" covers Series B and later). */
const stagesFor = (stage: string): string[] => (stage === "Series B+" ? ["Series B", "Series C+"] : [stage]);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const usd = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`);

type Fit = { excluded: string | null; score: number; matched: string[]; caveats: string[]; explicit: boolean };

/** How one record's cohort fits the company. `excluded` is set when it contradicts the profile. */
export function cohortFit(r: CandidateRecord, c: CompanyProfile): Fit {
  const matched: string[] = [];
  const caveats: string[] = [];
  let score = 0;
  let explicit = false;

  if (r.stages.length) {
    if (!c.stage) caveats.push(`the cohort is ${r.stages.join(" / ")} and the company's stage isn't known`);
    else if (r.stages.some((s) => stagesFor(c.stage!).includes(s))) {
      score += 3;
      explicit = true;
      matched.push(`stage (${c.stage})`);
    } else return { excluded: `different stage (cohort ${r.stages.join(" / ")}, company ${c.stage})`, score, matched, caveats, explicit };
  }

  if (r.arrMin !== null || r.arrMax !== null) {
    const lo = r.arrMin ?? 0;
    const hi = r.arrMax ?? Number.POSITIVE_INFINITY;
    const range = `${r.arrMin !== null ? usd(r.arrMin) : "any"}–${r.arrMax !== null ? usd(r.arrMax) : "any"}`;
    if (c.arr !== null) {
      if (c.arr < lo || c.arr > hi) return { excluded: `ARR outside the cohort (cohort ${range}, company ${usd(c.arr)})`, score, matched, caveats, explicit };
      score += 3;
      explicit = true;
      matched.push(`ARR (${range})`);
    } else if (c.revenueBand && BAND[c.revenueBand]) {
      const [blo, bhi] = BAND[c.revenueBand]!;
      if (bhi <= lo || blo >= hi) return { excluded: `revenue band outside the cohort's ARR (${range})`, score, matched, caveats, explicit };
      score += 1;
      caveats.push(`the company's ARR is only known as a band that overlaps the cohort's ${range}`);
    } else caveats.push(`the cohort is ARR ${range} and the company's ARR isn't known`);
  }

  if (r.acvMin !== null || r.acvMax !== null) {
    const lo = r.acvMin ?? 0;
    const hi = r.acvMax ?? Number.POSITIVE_INFINITY;
    if (c.acv !== null) {
      if (c.acv < lo || c.acv > hi) return { excluded: `ACV outside the cohort (company ${usd(c.acv)})`, score, matched, caveats, explicit };
      score += 1;
      matched.push("ACV range");
    } else caveats.push("the cohort is defined by ACV and the company's ACV isn't known");
  }

  if (r.customerSegment) {
    if (!c.segment) caveats.push(`the cohort is ${r.customerSegment} customers and the company's segment isn't known`);
    else if (norm(c.segment).includes(norm(r.customerSegment)) || norm(r.customerSegment).includes(norm(c.segment))) {
      score += 1;
      matched.push(`segment (${r.customerSegment})`);
    } else return { excluded: `different customer segment (cohort ${r.customerSegment}, company ${c.segment})`, score, matched, caveats, explicit };
  }

  // Industry and business model aren't captured reliably in the profile, so a miss is a caveat, not an exclusion.
  for (const [label, v] of [["business model", r.businessModel], ["industry", r.industry]] as const) {
    if (!v) continue;
    const words = norm(v).split(" ").filter((w) => w.length > 2);
    const company = norm([c.industry, c.segment].filter(Boolean).join(" "));
    if (company && words.some((w) => company.includes(w))) {
      score += 1;
      matched.push(`${label} (${v})`);
    } else caveats.push(`the cohort is ${v} and the company's ${label} isn't confirmed`);
  }
  if (r.geography) caveats.push(`the cohort covers ${r.geography}; the company's geography isn't checked`);
  return { excluded: null, score, matched, caveats, explicit };
}

/** Why a record can't be compared with this figure at all, whoever selects it. */
function incompatible(r: CandidateRecord, metric: MetricKey, purpose: "customer_report" | "internal"): string | null {
  if (r.unit !== expectedUnit(metric)) return `different unit (${r.unit}, expected ${expectedUnit(metric)})`;
  if (!compatibleBases(metric).includes(r.periodBasis)) return `${PERIOD_BASIS_LABEL[r.periodBasis].toLowerCase()} basis doesn't match how ${METRICS[metric].label} is measured`;
  if (r.source.reliability === "unreliable") return "the source is marked unreliable";
  if (purpose === "customer_report" && !r.source.allowCustomerDisplay) return "the source's licence doesn't allow showing it to customers";
  if (r.statistic === "min" || r.statistic === "max") return "minimum or maximum only: no central value to compare with";
  return null;
}

const withoutFit = (r: CandidateRecord & { fit: Fit }): CandidateRecord => {
  const copy: Partial<CandidateRecord & { fit: Fit }> = { ...r };
  delete copy.fit;
  return copy as CandidateRecord;
};
const groupKey = (r: CandidateRecord) => [r.versionId, cohortKey(r), r.period.toLowerCase(), r.periodBasis].join("#");
const hasCentre = (rs: CandidateRecord[]) => rs.some((r) => r.statistic === "median" || r.statistic === "mean" || r.statistic === "range" || (r.statistic === "percentile" && r.percentile === 50)) || rs.filter((r) => r.statistic === "percentile").length >= 2;

/** The best benchmark for one figure, or why there's none. */
export function matchBenchmark(
  metric: MetricKey,
  company: CompanyProfile,
  candidates: CandidateRecord[],
  override: Override,
  { purpose = "customer_report", now = new Date() }: { purpose?: "customer_report" | "internal"; now?: Date } = {},
): BenchmarkMatch {
  const own = candidates.filter((r) => r.metric === metric);
  if (override && override.recordId === null) return { status: "none", metric, reason: `An advisor chose not to benchmark this metric: ${override.reason}`, excluded: [] };

  const excluded: { recordId: string; reason: string }[] = [];
  const eligible: (CandidateRecord & { fit: Fit })[] = [];
  for (const r of own) {
    const why = incompatible(r, metric, purpose);
    if (why) {
      excluded.push({ recordId: r.id, reason: why });
      continue;
    }
    const fit = cohortFit(r, company);
    if (fit.excluded && override?.recordId !== r.id) excluded.push({ recordId: r.id, reason: fit.excluded });
    else eligible.push({ ...r, fit });
  }

  const groups = new Map<string, (CandidateRecord & { fit: Fit })[]>();
  for (const r of eligible) groups.set(groupKey(r), [...(groups.get(groupKey(r)) ?? []), r]);
  const usable = [...groups.values()].filter(hasCentre);

  let chosen: (CandidateRecord & { fit: Fit })[] | undefined;
  let selection: "auto" | "override" = "auto";
  if (override?.recordId) {
    chosen = usable.find((g) => g.some((r) => r.id === override.recordId));
    if (!chosen) {
      const why = excluded.find((e) => e.recordId === override.recordId)?.reason ?? "it isn't published, or it has no central value";
      return { status: "none", metric, reason: `The advisor's chosen benchmark can't be used: ${why}.`, excluded };
    }
    selection = "override";
  } else {
    const score = (g: (CandidateRecord & { fit: Fit })[]) => {
      const r = g[0]!;
      const documented = (r.definitionMatches ? 2 : 0) + (r.sampleSize !== null ? 1 : 0) + (r.cohortDefinition ? 1 : 0) + (r.methodology ? 0.5 : 0);
      const trust = r.source.reliability === "reliable" ? 1 : r.source.reliability === "use_with_caution" ? -1 : 0;
      return r.fit.score * 2 + documented + trust - (isStale(r, now) ? 1 : 0);
    };
    chosen = usable.sort((a, b) => score(b) - score(a) || (b[0]!.reviewedAt?.getTime() ?? 0) - (a[0]!.reviewedAt?.getTime() ?? 0))[0];
  }
  if (!chosen) {
    const reason = !own.length
      ? "No published benchmark exists for this metric yet."
      : eligible.length
        ? "The eligible benchmarks don't include a median, mean, range or enough percentiles to compare with."
        : "No published benchmark is comparable: " + [...new Set(excluded.map((e) => e.reason))].slice(0, 3).join("; ") + ".";
    return { status: "none", metric, reason, excluded };
  }

  const head = chosen[0]!;
  const caveats = [...head.fit.caveats];
  if (head.fit.excluded) caveats.unshift(`selected by an advisor although ${head.fit.excluded}`);
  if (!chosen.every((r) => r.definitionMatches)) caveats.push("the source's definition hasn't been confirmed to match Growth Goaled's");
  if (head.source.reliability === "use_with_caution") caveats.push("the source is marked use with caution");
  if (isStale(head, now)) caveats.push("the dataset is due for review");
  if (!head.fit.explicit) caveats.push("the cohort isn't matched on stage or ARR, so it's a broad comparison");
  const strong = chosen.every((r) => r.definitionMatches) && head.fit.explicit && !head.fit.excluded && head.source.reliability !== "use_with_caution" && !isStale(head, now) && head.fit.caveats.length === 0;

  const alternatives = usable
    .filter((g) => g !== chosen && g[0]!.datasetId !== head.datasetId)
    .map((g) => ({ datasetName: g[0]!.datasetName, sourceName: g[0]!.source.name, cohort: describeCohort(g[0]!), period: g[0]!.period }));
  return {
    status: "matched",
    metric,
    quality: strong ? "strong" : "directional",
    selection,
    records: chosen.map(withoutFit),
    matchedOn: head.fit.matched,
    caveats,
    alternatives,
  };
}
