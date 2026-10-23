import { describe, expect, it } from "vitest";
import { allowedNumbers, checkDraft, matchesAllowed, numbersIn } from "@/lib/deliverables/checks";
import { matchCohort, methodologyText, scoreCohort, type MatchCompany } from "@/lib/cohort-match";

describe("numbersIn", () => {
  it("normalises money, percents, days and multiples", () => {
    const t = numbersIn("ARR $4.2M (72% growth), AE productivity $840K, cycle 94d, 1.4x magic number, n=14");
    expect(t.map((x) => x.value)).toEqual([4_200_000, 72, 840_000, 94, 1.4, 14]);
  });
  it("ignores years, quarters and small counts", () => {
    expect(numbersIn("In Q3 2026 we saw 3 areas improve")).toEqual([]);
  });
  it("reads comma-separated thousands", () => {
    expect(numbersIn("$1,200,000 ARR")[0]!.value).toBe(1_200_000);
  });
});

describe("matchesAllowed", () => {
  it("accepts rounded displays of input values and simple gaps", () => {
    const allowed = allowedNumbers([{ company: 94, median: 78, topQuartile: 61, p25: null }, { company: 840_000, median: 920_000, topQuartile: 1_200_000, p25: null }], []);
    for (const n of [94, 61, 33, 16, 840_000, 1_200_000, 360_000, 1_150_000]) expect(matchesAllowed(n, allowed), String(n)).toBe(true);
    expect(matchesAllowed(45, allowed)).toBe(false);
    expect(matchesAllowed(2_000_000, allowed)).toBe(false);
  });
});

describe("checkDraft", () => {
  it("flags invented figures and claims without valid sources", () => {
    const allowed = allowedNumbers([{ company: 72, median: 58, topQuartile: 89, p25: null }], []);
    const r = checkDraft(
      [
        { key: "strength.1", text: "Growth above median (72% vs. 58%)", sources: ["dp1", "bm1"] },
        { key: "watch.1", text: "CAC payback is 31 months", sources: ["made-up"] },
      ],
      allowed,
      new Set(["dp1", "bm1"]),
    );
    expect(r.untracedNumbers).toEqual([{ claim: "watch.1", raw: "31 months" }]);
    expect(r.unsourcedClaims).toEqual(["watch.1"]);
    expect(r.unknownSources).toEqual([{ claim: "watch.1", id: "made-up" }]);
  });
});

describe("cohort matching", () => {
  const company: MatchCompany = { stage: "Series A", arr: 4_200_000, revenueBand: "3m_10m", salesModel: "Founder-led", industry: "B2B SaaS", primarySegment: null };
  const a = { id: "a", name: "Series A founder-led", criteria: { stage: ["Series A"], arr_min: 2_000_000, arr_max: 10_000_000, gtm_motion: "Founder-led → scaled GTM", model: "B2B SaaS" }, approvedMetrics: ["nrr", "win_rate"] };
  const b = { id: "b", name: "Seed", criteria: { stage: ["Seed"], arr_max: 2_000_000 }, approvedMetrics: ["nrr", "win_rate", "arr_growth"] };
  const c = { id: "c", name: "No overlap", criteria: { stage: ["Series A"] }, approvedMetrics: ["burn_multiple"] };

  it("scores stage, ARR, GTM motion and model", () => {
    const m = scoreCohort(company, a, ["nrr", "win_rate"]);
    expect(m.score).toBe(9);
    expect(m.unmatched).toEqual([]);
    expect(scoreCohort(company, b, ["nrr"]).unmatched.length).toBe(2);
  });

  it("picks the best cohort that has comparable metrics", () => {
    expect(matchCohort(company, [b, c, a], ["nrr", "win_rate"])?.cohortId).toBe("a");
    expect(matchCohort(company, [c], ["nrr"])).toBeNull();
  });

  it("falls back to the revenue band when ARR is unknown", () => {
    expect(scoreCohort({ ...company, arr: null }, a, ["nrr"]).matched).toContain("revenue band overlaps $2M–$10M");
  });

  it("explains the match in the methodology", () => {
    const text = methodologyText({ name: "Series A founder-led", companyCount: 14 }, scoreCohort(company, a, ["nrr"]));
    expect(text).toMatch(/Matched on stage \(Series A\), ARR band/);
    expect(text).toMatch(/n=14/);
  });
});
