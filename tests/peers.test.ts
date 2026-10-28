import { describe, expect, it } from "vitest";
import { cohortFit, type CandidateRecord, type CompanyProfile } from "@/lib/benchmark-library/match";
import { ADVISOR_CONFIRMS, peerComparisons, position, sameIndustry, topQuartileTarget, type PeerFigure } from "@/lib/benchmark-library/peers";
import { describeCohort, validateRecord } from "@/lib/benchmark-library/records";

const source = (over: Partial<CandidateRecord["source"]> = {}): CandidateRecord["source"] => ({
  id: "s1", name: "Survey A", publisher: "Pub", url: null, documentRef: null, publishedOn: "2026-01-15", attribution: null,
  kind: "published_report", reliability: "reliable", allowCustomerDisplay: true, allowDerived: true, reviewIntervalDays: null, snapshotSource: true, ...over,
});

let n = 0;
function rec(metric: string, stat: { statistic: "median" | "percentile"; percentile?: number }, value: number, over: Partial<CandidateRecord> = {}): CandidateRecord {
  const unit = metric === "arr" ? "usd" : "percent";
  return {
    id: `r${++n}`, versionId: "v1", version: 2, datasetId: "d1", datasetName: "SaaS by vintage", reviewedAt: new Date(),
    metric, displayName: metric, definition: "d", definitionMatches: true, unit, valueType: unit === "usd" ? "currency" : "percentage",
    statistic: stat.statistic, percentile: stat.percentile ?? null, value, valueLow: null, valueHigh: null,
    stages: [], arrMin: null, arrMax: null, industry: "Fintech", businessModel: null, pricingModel: null, customerSegment: null, acvMin: null, acvMax: null, geography: null,
    foundedFrom: 2018, foundedTo: 2021, period: "FY2025", periodBasis: metric === "arr" ? "point_in_time" : "annual", cohortDefinition: null, sampleSize: 60, methodology: null, limitations: null,
    source: source(), ...over,
  } as CandidateRecord;
}
const cohort = (metric: string, [p25, med, p75]: [number, number, number], over: Partial<CandidateRecord> = {}) => [
  rec(metric, { statistic: "percentile", percentile: 25 }, p25, over),
  rec(metric, { statistic: "median" }, med, over),
  rec(metric, { statistic: "percentile", percentile: 75 }, p75, over),
];
const exact = (v: number, text: string): PeerFigure => ({ lo: v, hi: v, exact: v, text, origin: "your company profile" });

describe("founding-year cohorts in the Benchmark Library", () => {
  it("validates founding years and describes them", () => {
    const base = { metric: "nrr", definition: "x", unit: "percent", statistic: "median", value: "100", period: "FY2025", periodBasis: "annual" };
    expect(validateRecord({ ...base, foundedFrom: "2018", foundedTo: "2021" }).record).toMatchObject({ foundedFrom: 2018, foundedTo: 2021 });
    expect(validateRecord({ ...base, foundedFrom: "2022", foundedTo: "2018" }).issues.some((i) => i.field === "foundedFrom" && i.severity === "error")).toBe(true);
    expect(validateRecord({ ...base, foundedFrom: "18" }).issues.some((i) => i.field === "foundedFrom")).toBe(true);
    expect(describeCohort({ ...rec("nrr", { statistic: "median" }, 100) })).toBe("Fintech · founded 2018–2021");
  });

  it("excludes a cohort founded in other years, and only notes it when the year is unknown", () => {
    const profile: CompanyProfile = { stage: null, arr: null, revenueBand: null, industry: "Fintech", segment: null, acv: null };
    const r = rec("nrr", { statistic: "median" }, 100);
    expect(cohortFit(r, { ...profile, foundedYear: 2016 }).excluded).toMatch(/different founding years/);
    expect(cohortFit(r, { ...profile, foundedYear: 2019 }).matched).toContain("founding year (founded 2018–2021)");
    expect(cohortFit(r, profile).caveats.join(" ")).toMatch(/founding year isn't known/);
  });
});

describe("Snapshot peer comparisons", () => {
  const records = [...cohort("arr_growth", [20, 45, 90]), ...cohort("nrr", [90, 102, 115]), ...cohort("arr", [800_000, 2_000_000, 5_000_000])];
  const company = (over = {}) => ({ industry: "Fintech", foundedYear: 2019, figures: { growth: exact(60, "60%"), retention: { lo: 90, hi: 100, exact: null, text: "90–100%", origin: "the range you picked" }, revenue: exact(3_000_000, "$3M") }, ...over });

  it("compares growth, retention and revenue with the bottom, median and top of the same industry and founding years", () => {
    const out = peerComparisons(company(), records);
    expect(out.map((c) => c.key)).toEqual(["growth", "retention", "revenue"]);
    for (const c of out) expect(c.status).toBe("compared");
    const [growth, retention] = out as Extract<(typeof out)[number], { status: "compared" }>[];
    expect(growth).toMatchObject({ bottom: { label: "Bottom quartile", formatted: "20%" }, median: { formatted: "45%" }, top: { label: "Top quartile", formatted: "90%" }, position: "Between the median and the top quartile" });
    expect(growth!.cohort).toBe("Fintech · founded 2018–2021");
    expect(growth!.source).toMatchObject({ name: "Survey A", year: "2026" });
    expect(retention!.position).toBe("Between the bottom quartile and the median");
  });

  it("is transparent when there's no industry, founding year or published cohort, and never borrows another industry or vintage", () => {
    for (const c of peerComparisons(company({ industry: null }), records)) expect(c).toMatchObject({ status: "unavailable", reason: expect.stringContaining(ADVISOR_CONFIRMS) });
    for (const c of peerComparisons(company({ foundedYear: null }), records)) expect(c.status).toBe("unavailable");
    for (const c of peerComparisons(company({ industry: "Other" }), records)) expect(c.status).toBe("unavailable");
    const other = peerComparisons(company({ industry: "HealthTech" }), records)[0]!;
    expect(other).toMatchObject({ status: "unavailable", reason: `Our comparison sources don't publish growth figures for HealthTech companies founded in 2019 yet. ${ADVISOR_CONFIRMS}` });
    expect(peerComparisons(company({ foundedYear: 2012 }), records)[0]!.status).toBe("unavailable");
    // A cohort without founding years isn't a founding-year comparison.
    expect(peerComparisons(company(), cohort("nrr", [90, 100, 110], { foundedFrom: null, foundedTo: null }))[1]!.status).toBe("unavailable");
  });

  it("uses only the fixed Snapshot sources whose licence allows customer display", () => {
    expect(peerComparisons(company(), cohort("nrr", [90, 100, 110], { source: source({ snapshotSource: false }) }))[1]!.status).toBe("unavailable");
    expect(peerComparisons(company(), cohort("nrr", [90, 100, 110], { source: source({ allowCustomerDisplay: false }) }))[1]!.status).toBe("unavailable");
  });

  it("picks the same cohort every time, whatever order the records arrive in", () => {
    const a = cohort("nrr", [80, 95, 105], { versionId: "va", datasetName: "Alpha", source: source({ id: "s2", name: "Survey B" }) });
    const b = cohort("nrr", [90, 100, 110], { versionId: "vb", datasetName: "Beta" });
    const pick = (rs: CandidateRecord[]) => (peerComparisons(company(), rs)[1] as { dataset: { name: string } }).dataset.name;
    expect(pick([...a, ...b])).toBe("Beta"); // Survey A sorts before Survey B
    expect(pick([...b, ...a])).toBe("Beta");
  });

  it("still shows the peers when the company's figure is missing, and needs both a bottom and a top", () => {
    const c = peerComparisons(company({ figures: {} }), records)[0]!;
    expect(c).toMatchObject({ status: "compared", company: null, position: null });
    expect(peerComparisons(company(), [rec("nrr", { statistic: "median" }, 100)])[1]!.status).toBe("unavailable");
  });

  it("places a range only when it falls in one band", () => {
    const s = { bottom: { label: "Bottom quartile", value: 90, formatted: "90%", recordId: "a" }, median: { label: "Median", value: 100, formatted: "100%", recordId: "b" }, top: { label: "Top quartile", value: 110, formatted: "110%", recordId: "c" } };
    expect(position(exact(120, "120%"), s)).toBe("Above the top quartile");
    expect(position({ lo: 80, hi: 90, exact: null, text: "80–90%", origin: "" }, s)).toBe("Below the bottom quartile");
    expect(position({ lo: 95, hi: 105, exact: null, text: "", origin: "" }, s)).toMatch(/spans .*exact figure/);
    expect(position({ lo: 120, hi: null, exact: null, text: "120%+", origin: "" }, s)).toBe("Above the top quartile");
  });

  it("matches industries by name, not by guesswork", () => {
    expect(sameIndustry("Fintech", "B2B fintech")).toBe(true);
    expect(sameIndustry("B2B SaaS", "SaaS")).toBe(true);
    expect(sameIndustry("HealthTech", "Fintech")).toBe(false);
    expect(sameIndustry("Other", "Other")).toBe(false);
  });

  describe("top-quartile target when no peer cohort fits", () => {
    const stageRow = (value: number, over: Partial<CandidateRecord> = {}) =>
      rec("arr_growth", { statistic: "percentile", percentile: 75 }, value, { stages: ["Series A"], industry: null, foundedFrom: null, foundedTo: null, datasetName: "Stage benchmarks", versionId: "vs", ...over });
    const co = { stage: "Series A", industry: "HealthTech", foundedYear: 2024 };

    it("states the published top quartile for the company's stage, with its source, and stays transparent", () => {
      const out = peerComparisons({ ...co, figures: { growth: { lo: 50, hi: 100, exact: null, text: "50–100%", origin: "the range you picked" } } }, [stageRow(150)])[0]!;
      expect(out).toMatchObject({ status: "unavailable", reason: expect.stringContaining(ADVISOR_CONFIRMS) });
      if (out.status !== "unavailable") throw new Error();
      expect(out.target).toMatchObject({
        statement: "Based on publicly available data from Survey A (2026), a Series A company should be targeting 150% year-over-year ARR growth or more to be in the top quartile.",
        met: false,
        cohort: "Series A",
      });
    });

    it("prefers the company's industry, never another industry, stage or vintage, and says nothing without a published figure", () => {
      const own = stageRow(180, { industry: "HealthTech", datasetName: "Z" });
      expect(topQuartileTarget("arr_growth", co, null, [stageRow(150), own])!.statement).toContain("a Series A HealthTech company should be targeting 180%");
      expect(topQuartileTarget("arr_growth", co, null, [stageRow(150, { industry: "Fintech" })])).toBeNull();
      expect(topQuartileTarget("arr_growth", co, null, [stageRow(150, { stages: ["Seed"] })])).toBeNull();
      expect(topQuartileTarget("arr_growth", co, null, [stageRow(150, { foundedFrom: 2010, foundedTo: 2015 })])).toBeNull();
      expect(topQuartileTarget("arr_growth", co, null, [rec("arr_growth", { statistic: "median" }, 100, { stages: ["Series A"], industry: null })])).toBeNull();
      expect(topQuartileTarget("arr_growth", { ...co, stage: null }, null, [stageRow(150)])).toBeNull();
      expect(topQuartileTarget("arr_growth", co, null, [stageRow(150, { source: source({ snapshotSource: false }) })])).toBeNull();
      expect(topQuartileTarget("arr_growth", co, null, [stageRow(150, { source: source({ kind: "licensed_dataset" }) })])!.statement).toMatch(/^Based on benchmark data from/);
      expect(topQuartileTarget("arr_growth", co, exact(200, "200%"), [stageRow(150)])!.met).toBe(true);
      expect(topQuartileTarget("arr_growth", { ...co, stage: "Series B+" }, null, [stageRow(150, { stages: ["Series B"] })])!.statement).toContain("a Series B+ company");
    });
  });
});
