import "server-only";
import type { Company } from "@/lib/db/schema";
import { foundingYear, type IntakeAnswers } from "@/lib/intake";
import { formatMetric } from "@/lib/metrics";
import { REVENUE_BANDS } from "@/lib/onboarding";
import { PEER_METRICS, peerComparisons, type PeerComparison, type PeerFigure, type PeerKey } from "@/lib/benchmark-library/peers";
import { findRange, rangeFieldId } from "@/lib/ranges";
import { loadCandidates } from "./benchmark-library";

/** Revenue bands from onboarding, as ranges. */
const BAND_RANGE: Record<string, [number, number]> = { lt_1m: [0, 1_000_000], "1m_3m": [1_000_000, 3_000_000], "3m_10m": [3_000_000, 10_000_000], "10m_20m": [10_000_000, 20_000_000], "20m_50m": [20_000_000, 50_000_000] };
const PROFILE_KEY: Record<PeerKey, string> = { growth: "company.growth", retention: "customers.nrr", revenue: "company.arr" };

/** The company's figure for a comparison: the exact profile figure, else the range it picked, else (revenue) its onboarding band. */
function figureFor(key: PeerKey, answers: IntakeAnswers, revenueBand: string | null): PeerFigure | null {
  const metric = PEER_METRICS.find((m) => m.key === key)!.metric;
  const profileKey = PROFILE_KEY[key];
  const exact = answers[profileKey];
  const n = typeof exact === "number" ? exact : typeof exact === "string" && exact.trim() ? Number(exact.replace(/[,$%\s]/g, "")) : NaN;
  if (Number.isFinite(n)) return { lo: n, hi: n, exact: n, text: formatMetric(metric, n), origin: "your company profile" };
  const [section, field] = profileKey.split(".") as [string, string];
  const label = answers[`${section}.${rangeFieldId(field)}`];
  const range = findRange(profileKey, label);
  if (range) return { lo: range.lo, hi: range.hi, exact: null, text: String(label), origin: "the range you picked" };
  const band = key === "revenue" && revenueBand ? BAND_RANGE[revenueBand] : undefined;
  if (band) return { lo: band[0], hi: band[1], exact: null, text: REVENUE_BANDS.find((b) => b.value === revenueBand)!.label, origin: "the revenue band you gave at sign-up" };
  return null;
}

/** The Snapshot's three peer comparisons, from the fixed Snapshot sources only. */
export async function snapshotPeers(company: Pick<Company, "industry" | "revenueBand" | "isSample">, answers: IntakeAnswers): Promise<PeerComparison[]> {
  const industry = typeof answers["company.industry"] === "string" ? (answers["company.industry"] as string) : company.industry;
  const candidates = company.isSample ? [] : (await loadCandidates(PEER_METRICS.map((m) => m.metric))).filter((r) => r.source.snapshotSource);
  return peerComparisons(
    {
      industry: industry ?? null,
      foundedYear: foundingYear(answers["company.founded_year"]),
      figures: Object.fromEntries(PEER_METRICS.map((m) => [m.key, figureFor(m.key, answers, company.revenueBand)])),
    },
    candidates,
  );
}
