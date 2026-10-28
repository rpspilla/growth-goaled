import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import { incompatible, stagesFor, type CandidateRecord } from "./match";
import { cohortKey, describeCohort, foundedLabel } from "./records";

/**
 * The free Snapshot's peer comparisons: growth, retention and revenue against companies in the
 * same industry founded around the same time. Pure and deterministic.
 *
 * Only the fixed Snapshot sources are passed in (an admin flags them in the Benchmark Library), so
 * every founder is compared on the same basis. A cohort is used only when its source names the
 * company's industry and its founding years include the company's: no nearest-match guessing.
 * When nothing fits, the result says why, and that an advisor can confirm the comparison later.
 */

export const PEER_METRICS = [
  { key: "growth", title: "Growth", metric: "arr_growth" },
  { key: "retention", title: "Retention", metric: "nrr" },
  { key: "revenue", title: "Revenue", metric: "arr" },
] as const satisfies readonly { key: string; title: string; metric: MetricKey }[];

export type PeerKey = (typeof PEER_METRICS)[number]["key"];

/** The company's own figure: exact (lo = hi) or a range it picked. */
export type PeerFigure = { lo: number | null; hi: number | null; exact: number | null; text: string; origin: string };

export type PeerPoint = { label: string; value: number; formatted: string; recordId: string };

export type PeerComparison =
  | {
      status: "compared";
      key: PeerKey;
      title: string;
      metric: MetricKey;
      bottom: PeerPoint;
      median: PeerPoint | null;
      top: PeerPoint;
      company: PeerFigure | null;
      /** Where the company sits, in words; null when its figure is missing. */
      position: string | null;
      cohort: string;
      period: string;
      sampleSize: number | null;
      source: { name: string; publisher: string | null; year: string | null; attribution: string | null };
      dataset: { name: string; version: number; versionId: string };
    }
  | { status: "unavailable"; key: PeerKey; title: string; metric: MetricKey; company: PeerFigure | null; reason: string; target: TopQuartileTarget | null };

/**
 * The fallback when no industry-and-founding-year cohort exists: the top-quartile figure the fixed
 * Snapshot sources publish for companies at the same stage. Null when they publish none.
 */
export type TopQuartileTarget = {
  statement: string;
  value: number;
  formatted: string;
  /** Whether the company's figure already reaches it; null when unknown or its range straddles it. */
  met: boolean | null;
  cohort: string;
  period: string;
  sampleSize: number | null;
  source: { name: string; publisher: string | null; year: string | null; attribution: string | null };
  dataset: { name: string; version: number; versionId: string };
  recordId: string;
};

export const ADVISOR_CONFIRMS = "An advisor can confirm this comparison for you later.";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** "Fintech" matches "Fintech" or "B2B fintech"; "Other" never matches a named industry. */
export function sameIndustry(company: string, record: string): boolean {
  const a = norm(company);
  const b = norm(record);
  if (!a || !b || a === "other") return false;
  return a === b || ` ${b} `.includes(` ${a} `) || ` ${a} `.includes(` ${b} `);
}

const inFounded = (r: CandidateRecord, year: number) =>
  (r.foundedFrom != null || r.foundedTo != null) && (r.foundedFrom == null || year >= r.foundedFrom) && (r.foundedTo == null || year <= r.foundedTo);

const pct = (r: CandidateRecord) => (r.statistic === "median" ? 50 : r.statistic === "percentile" ? r.percentile : null);

/** Bottom, median and top of one cohort's published statistics, if it has a bottom and a top. */
function spread(rows: CandidateRecord[], metric: MetricKey): { bottom: PeerPoint; median: PeerPoint | null; top: PeerPoint } | null {
  const ranked = rows.map((r) => ({ r, p: pct(r) })).filter((x): x is { r: CandidateRecord; p: number } => x.p !== null && x.r.value !== null).sort((a, b) => a.p - b.p);
  const low = ranked[0];
  const high = ranked.at(-1);
  if (!low || !high || low.p > 30 || high.p < 70) return null;
  const point = (x: { r: CandidateRecord; p: number }, edge: "bottom" | "top" | "median"): PeerPoint => ({
    label: edge === "median" ? "Median" : x.p === 25 ? "Bottom quartile" : x.p === 75 ? "Top quartile" : `${x.p}th percentile`,
    value: x.r.value!,
    formatted: formatMetric(metric, x.r.value!),
    recordId: x.r.id,
  });
  const mid = ranked.find((x) => x.p === 50);
  return { bottom: point(low, "bottom"), median: mid ? point(mid, "median") : null, top: point(high, "top") };
}

/** Where a value or range sits against the cohort, in words. */
export function position(f: PeerFigure, s: { bottom: PeerPoint; median: PeerPoint | null; top: PeerPoint }): string {
  const cuts = [s.bottom.value, ...(s.median ? [s.median.value] : []), s.top.value];
  // Bands: 0 below the bottom, then one per gap between cuts, then above the top. A range's upper
  // edge counts as inside the band it ends in (80–90% ends at a bottom quartile of 90%: below it).
  const band = (v: number, edge: "lower" | "upper") => cuts.filter((c) => (edge === "lower" ? v >= c : v > c)).length;
  const words = [
    `Below the ${s.bottom.label.toLowerCase()}`,
    ...(s.median
      ? [`Between the ${s.bottom.label.toLowerCase()} and the median`, `Between the median and the ${s.top.label.toLowerCase()}`]
      : [`Between the ${s.bottom.label.toLowerCase()} and the ${s.top.label.toLowerCase()}`]),
    `Above the ${s.top.label.toLowerCase()}`,
  ];
  const last = words.length - 1;
  if (f.exact !== null) {
    const v = f.exact;
    return v < s.bottom.value ? words[0]! : v > s.top.value ? words[last]! : words[Math.min(last - 1, Math.max(1, band(v, "upper")))]!;
  }
  if (f.lo !== null && f.hi !== null) {
    const a = band(f.lo, "lower");
    const b = band(f.hi, "upper");
    if (a === b) return words[a]!;
    return `Your range spans ${words[a]!.toLowerCase()} to ${words[b]!.toLowerCase()}; an exact figure would place you precisely`;
  }
  if (f.lo !== null && band(f.lo, "lower") === last) return words[last]!;
  if (f.hi !== null && band(f.hi, "upper") === 0) return words[0]!;
  return "Your range is open-ended, so we can't place you precisely; an exact figure would";
}

const TARGET_WORDS: Partial<Record<MetricKey, string>> = { arr_growth: "year-over-year ARR growth", nrr: "net revenue retention", arr: "ARR" };
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

/**
 * The top-quartile (or nearest published upper-percentile) figure for the company's stage from the
 * Snapshot sources. Industry-specific cohorts come first; a cohort naming another industry, or
 * founding years that exclude the company's, is never used. The choice order is fixed.
 */
export function topQuartileTarget(
  metric: MetricKey,
  company: { stage: string | null; industry: string | null; foundedYear: number | null },
  figure: PeerFigure | null,
  candidates: readonly CandidateRecord[],
): TopQuartileTarget | null {
  if (!company.stage) return null;
  const stages = stagesFor(company.stage);
  const industryFits = (r: CandidateRecord) => !r.industry || (company.industry ? sameIndustry(company.industry, r.industry) : false);
  const yearFits = (r: CandidateRecord) => (r.foundedFrom == null && r.foundedTo == null) || company.foundedYear === null || inFounded(r, company.foundedYear);
  const rows = candidates
    .filter((r) => r.metric === metric && r.source.snapshotSource && !incompatible(r, metric, "customer_report"))
    .filter((r) => r.statistic === "percentile" && r.percentile !== null && r.percentile >= 75 && r.value !== null)
    .filter((r) => r.stages.some((st) => stages.includes(st)) && industryFits(r) && yearFits(r))
    .sort(
      (a, b) =>
        Number(Boolean(b.industry)) - Number(Boolean(a.industry)) ||
        a.percentile! - b.percentile! ||
        a.source.name.localeCompare(b.source.name) ||
        a.datasetName.localeCompare(b.datasetName) ||
        b.version - a.version ||
        b.period.localeCompare(a.period),
    );
  const r = rows[0];
  if (!r) return null;
  const formatted = formatMetric(metric, r.value!);
  const quartile = r.percentile === 75 ? "top quartile" : `top ${100 - r.percentile!}%`;
  const basis = r.source.kind === "published_report" ? "publicly available data" : "benchmark data";
  const year = r.source.publishedOn?.slice(0, 4);
  const peers = r.industry ? `${company.stage} ${r.industry}` : company.stage;
  const lo = figure?.exact ?? figure?.lo ?? null;
  const hi = figure?.exact ?? figure?.hi ?? null;
  const met = lo !== null && lo >= r.value! ? true : hi !== null && hi < r.value! ? false : null;
  return {
    statement: `Based on ${basis} from ${r.source.name}${year ? ` (${year})` : ""}, ${article(peers)} ${peers} company should be targeting ${formatted} ${TARGET_WORDS[metric] ?? METRICS[metric].label} or more to be in the ${quartile}.`,
    value: r.value!,
    formatted,
    met,
    cohort: describeCohort(r),
    period: r.period,
    sampleSize: r.sampleSize,
    source: { name: r.source.name, publisher: r.source.publisher, year: year ?? null, attribution: r.source.attribution },
    dataset: { name: r.datasetName, version: r.version, versionId: r.versionId },
    recordId: r.id,
  };
}

/**
 * One comparison per metric. Among cohorts that fit, the choice is fixed: source name, then
 * dataset, the newest published version, the latest period, and the narrowest founding-year span.
 */
export function peerComparisons(
  company: { industry: string | null; foundedYear: number | null; stage?: string | null; figures: Partial<Record<PeerKey, PeerFigure | null>> },
  candidates: readonly CandidateRecord[],
): PeerComparison[] {
  return PEER_METRICS.map(({ key, title, metric }) => {
    const figure = company.figures[key] ?? null;
    const none = (reason: string): PeerComparison => ({
      status: "unavailable",
      key,
      title,
      metric,
      company: figure,
      reason: `${reason} ${ADVISOR_CONFIRMS}`,
      target: topQuartileTarget(metric, { stage: company.stage ?? null, industry: company.industry, foundedYear: company.foundedYear }, figure, candidates),
    });
    if (!company.industry || norm(company.industry) === "other") return none("We don't have an industry to compare you within yet.");
    if (company.foundedYear === null) return none("We don't have your founding year yet.");

    const fits = candidates.filter((r) => r.metric === metric && r.source.snapshotSource && !incompatible(r, metric, "customer_report") && r.industry && sameIndustry(company.industry!, r.industry) && inFounded(r, company.foundedYear!));
    const groups = new Map<string, CandidateRecord[]>();
    for (const r of fits) {
      const k = [r.versionId, cohortKey(r), r.period.toLowerCase(), r.periodBasis].join("#");
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const span = (r: CandidateRecord) => (r.foundedTo ?? 9999) - (r.foundedFrom ?? 0);
    const ordered = [...groups.values()]
      .map((rows) => ({ rows, s: spread(rows, metric) }))
      .filter((g): g is { rows: CandidateRecord[]; s: NonNullable<ReturnType<typeof spread>> } => g.s !== null)
      .sort((a, b) => {
        const x = a.rows[0]!;
        const y = b.rows[0]!;
        return x.source.name.localeCompare(y.source.name) || x.datasetName.localeCompare(y.datasetName) || y.version - x.version || y.period.localeCompare(x.period) || span(x) - span(y);
      });
    const chosen = ordered[0];
    if (!chosen) {
      const founded = foundedLabel(company.foundedYear, company.foundedYear)!.replace("founded", "founded in");
      return none(`Our comparison sources don't publish ${title.toLowerCase()} figures for ${company.industry} companies ${founded} yet.`);
    }
    const head = chosen.rows[0]!;
    return {
      status: "compared",
      key,
      title,
      metric,
      ...chosen.s,
      company: figure,
      position: figure ? position(figure, chosen.s) : null,
      cohort: describeCohort(head),
      period: head.period,
      sampleSize: head.sampleSize,
      source: { name: head.source.name, publisher: head.source.publisher, year: head.source.publishedOn?.slice(0, 4) ?? null, attribution: head.source.attribution },
      dataset: { name: head.datasetName, version: head.version, versionId: head.versionId },
    };
  });
}
