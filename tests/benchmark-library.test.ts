import { describe, expect, it } from "vitest";
import { compare, difference, position } from "@/lib/benchmark-library/compare";
import { autoMap, csvTemplate, previewCsv } from "@/lib/benchmark-library/csv";
import { matchBenchmark, type CandidateRecord, type CompanyProfile } from "@/lib/benchmark-library/match";
import { crossRecordIssues, dedupeKey, validateRecord, type RawRecord } from "@/lib/benchmark-library/records";

/** Test fixtures only: made-up values, not benchmarks. */
const base: RawRecord = {
  metric: "nrr",
  definition: "Test definition",
  definitionMatches: "yes",
  unit: "percent",
  statistic: "median",
  value: "100",
  stages: "Series A",
  arrMin: "1M",
  arrMax: "10M",
  period: "FY2025",
  periodBasis: "annual",
  cohortDefinition: "Test cohort",
  sampleSize: "40",
};
const errors = (raw: RawRecord) => validateRecord(raw).issues.filter((i) => i.severity === "error").map((i) => i.message);

describe("record validation", () => {
  it("accepts a complete record and fills in the name and value type", () => {
    const { record, issues } = validateRecord(base);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(record).toMatchObject({ metric: "nrr", displayName: "NRR", valueType: "percentage", value: 100, arrMin: 1_000_000, arrMax: 10_000_000, stages: ["Series A"], sampleSize: 40 });
  });

  it("rejects missing fields, wrong units, bad percentiles and ranges, with reasons", () => {
    expect(errors({ ...base, definition: "", period: "" })).toEqual(expect.arrayContaining([expect.stringMatching(/Definition is required/), expect.stringMatching(/Measurement period is required/)]));
    expect(errors({ ...base, unit: "" })).toEqual([expect.stringMatching(/Unit is required/)]);
    expect(errors({ ...base, unit: "usd" })).toEqual([expect.stringMatching(/NRR is measured in percent; this row says us dollars/)]);
    expect(errors({ ...base, value: "1200" })).toEqual([expect.stringMatching(/between -100 and 1000/)]);
    expect(errors({ ...base, statistic: "percentile" })).toEqual([expect.stringMatching(/need the percentile/)]);
    expect(errors({ ...base, statistic: "percentile", percentile: "150" })).toEqual([expect.stringMatching(/1 to 99/)]);
    expect(errors({ ...base, percentile: "25" })).toEqual([expect.stringMatching(/Only percentile statistics/)]);
    expect(errors({ ...base, statistic: "range", value: "", valueLow: "110", valueHigh: "90" })).toEqual([expect.stringMatching(/value_low is above value_high/)]);
    expect(errors({ ...base, value: "abc" })).toEqual([expect.stringMatching(/isn't a number/)]);
    expect(errors({ ...base, stages: "Series Z" })).toEqual([expect.stringMatching(/Unknown stage "Series Z"/)]);
    expect(errors({ ...base, arrMin: "10M", arrMax: "1M" })).toEqual([expect.stringMatching(/ARR minimum is above the maximum/)]);
    expect(errors({ ...base, metric: "sales_cycle_days", unit: "days", value: "-3" })).toEqual([expect.stringMatching(/can't be negative/)]);
    expect(errors({ ...base, definition: "PLACEHOLDER: replace me" })).toEqual([expect.stringMatching(/PLACEHOLDER/)]);
  });

  it("warns (without blocking) on fractions, unknown metrics, incompatible bases and missing documentation", () => {
    const w = (raw: RawRecord) => validateRecord(raw).issues.filter((i) => i.severity === "warning").map((i) => i.message).join(" ");
    expect(w({ ...base, value: "0.95" })).toMatch(/looks like a fraction/);
    expect(w({ ...base, metric: "logo_retention", displayName: "Logo retention" })).toMatch(/never matched/);
    expect(w({ ...base, periodBasis: "monthly" })).toMatch(/won't be matched/);
    expect(w({ ...base, sampleSize: "", definitionMatches: "no" })).toMatch(/No sample size.*directional/s);
  });

  it("finds duplicates, contradictory cohort definitions and decreasing percentiles across records", () => {
    const rec = (raw: RawRecord, ref: string) => ({ ...validateRecord({ ...base, ...raw }).record!, ref });
    expect(crossRecordIssues([rec({}, "a"), rec({}, "b")])).toEqual([{ ref: "b", message: expect.stringMatching(/Duplicate of a/) }]);
    expect(crossRecordIssues([rec({}, "a"), rec({ statistic: "mean", cohortDefinition: "Other words" }, "b")])).toEqual([{ ref: "b", message: expect.stringMatching(/described differently/) }]);
    expect(crossRecordIssues([rec({}, "a"), rec({ statistic: "mean", stages: "Seed" }, "b")])).toEqual([{ ref: "b", message: expect.stringMatching(/Same cohort description as a but different/) }]);
    expect(crossRecordIssues([rec({}, "a"), rec({ statistic: "percentile", percentile: "75", value: "90" }, "b")])).toEqual([{ ref: "b", message: expect.stringMatching(/75th percentile \(90\) is below the 50th/) }]);
    expect(dedupeKey(rec({}, "a"))).not.toBe(dedupeKey(rec({ period: "FY2024" }, "b")));
  });
});

describe("CSV import", () => {
  it("maps template and aliased headers, and the template's placeholder rows can't be imported", () => {
    expect(autoMap(["Metric", "n", "Stat", "segment"])).toEqual({ metric: 0, sampleSize: 1, statistic: 2, customerSegment: 3 });
    const p = previewCsv(csvTemplate());
    expect(p.fileErrors).toEqual([]);
    expect(p.counts).toMatchObject({ total: 2, accepted: 0, rejected: 2 });
  });

  it("previews valid, invalid, duplicate and already-imported rows without guessing", () => {
    const csv = [
      "metric,definition,definition_matches,unit,statistic,percentile,value,stages,arr_min,arr_max,period,period_basis,cohort_definition,sample_size",
      "nrr,Test def,yes,percent,median,,100,Series A,1M,10M,FY2025,annual,Test cohort,40",
      "nrr,Test def,yes,percent,percentile,75,110,Series A,1M,10M,FY2025,annual,Test cohort,40",
      "nrr,Test def,yes,percent,median,,100,Series A,1M,10M,FY2025,annual,Test cohort,40",
      "nrr,Test def,yes,dollars,median,,100,Series A,1M,10M,FY2024,annual,Test cohort,40",
      "win_rate,Test def,yes,percent,median,,20,Series A,1M,10M,FY2025,annual,Test cohort,40",
    ].join("\n");
    const existing = new Set([dedupeKey(validateRecord({ ...base, metric: "win_rate", value: "20" }).record!)]);
    const p = previewCsv(csv, undefined, existing);
    expect(p.counts).toEqual({ total: 5, accepted: 2, rejected: 2, skipped: 1 });
    expect(p.rows.map((r) => r.status)).toEqual(["accepted", "accepted", "rejected", "rejected", "skipped"]);
    expect(p.rows[2]!.issues.at(-1)!.message).toMatch(/Duplicate of line 2/);
    expect(p.rows[3]!.issues[0]!.message).toMatch(/Unknown unit "dollars"/);
  });

  it("reports a file without required columns or rows", () => {
    expect(previewCsv("metric,value\n").fileErrors.join(" ")).toMatch(/No column mapped for: definition, unit, statistic, period, period_basis/);
    expect(previewCsv("").fileErrors).toEqual(["The file is empty."]);
  });
});

const source = { id: "s1", name: "Test Source", publisher: "Test Publisher", url: null, documentRef: null, publishedOn: "2026-01-01", attribution: null, kind: "published_report" as const, reliability: "reliable" as const, allowCustomerDisplay: true, allowDerived: true, reviewIntervalDays: 365 };
let n = 0;
const cand = (raw: RawRecord, extra: Partial<CandidateRecord> = {}): CandidateRecord => ({
  ...validateRecord({ ...base, ...raw }).record!,
  id: `r${++n}`,
  versionId: "v1",
  version: 1,
  datasetId: "d1",
  datasetName: "Test dataset",
  reviewedAt: new Date(),
  source,
  ...extra,
});
const company: CompanyProfile = { stage: "Series A", arr: 4_000_000, revenueBand: null, industry: "B2B SaaS", segment: "Mid-market", acv: null };

describe("benchmark matching", () => {
  it("matches a compatible, specific cohort as strong and returns all its statistics", () => {
    const rs = [cand({}), cand({ statistic: "percentile", percentile: "25", value: "92" }), cand({ statistic: "percentile", percentile: "75", value: "110" })];
    const m = matchBenchmark("nrr", company, rs, undefined);
    expect(m.status).toBe("matched");
    if (m.status !== "matched") return;
    expect(m.quality).toBe("strong");
    expect(m.records).toHaveLength(3);
    expect(m.matchedOn).toEqual(["stage (Series A)", "ARR ($1M–$10M)"]);
  });

  it("never matches on the metric name alone: unit, basis, stage, ARR and licence must fit", () => {
    expect(matchBenchmark("nrr", company, [cand({ periodBasis: "monthly" })], undefined)).toMatchObject({ status: "none", reason: expect.stringMatching(/monthly basis doesn't match/) });
    expect(matchBenchmark("nrr", company, [cand({ stages: "Seed" })], undefined)).toMatchObject({ status: "none", reason: expect.stringMatching(/different stage/) });
    expect(matchBenchmark("nrr", company, [cand({ arrMin: "10M", arrMax: "50M" })], undefined)).toMatchObject({ status: "none", reason: expect.stringMatching(/ARR outside the cohort/) });
    expect(matchBenchmark("nrr", company, [cand({}, { source: { ...source, allowCustomerDisplay: false } })], undefined)).toMatchObject({ status: "none", reason: expect.stringMatching(/licence/) });
    expect(matchBenchmark("nrr", company, [cand({}, { source: { ...source, reliability: "unreliable" } })], undefined)).toMatchObject({ status: "none" });
    expect(matchBenchmark("nrr", company, [], undefined)).toMatchObject({ status: "none", reason: "No published benchmark exists for this metric yet." });
    expect(matchBenchmark("nrr", company, [cand({ statistic: "max" })], undefined)).toMatchObject({ status: "none" });
  });

  it("prefers the specific, documented cohort over a broad one, and labels weak matches directional", () => {
    const broad = cand({ stages: "", arrMin: "", arrMax: "", cohortDefinition: "All companies", sampleSize: "500" }, { versionId: "v2", datasetId: "d2", datasetName: "Broad", source: { ...source, name: "Broad Source" } });
    const specific = cand({});
    const m = matchBenchmark("nrr", company, [broad, specific], undefined);
    expect(m.status === "matched" && m.records[0]!.id).toBe(specific.id);
    expect(m.status === "matched" && m.alternatives).toEqual([expect.objectContaining({ sourceName: "Broad Source" })]);
    const only = matchBenchmark("nrr", company, [broad], undefined);
    expect(only).toMatchObject({ status: "matched", quality: "directional" });
    expect(matchBenchmark("nrr", { ...company, arr: null }, [cand({})], undefined)).toMatchObject({ status: "matched", quality: "directional" });
    expect(matchBenchmark("nrr", company, [cand({ definitionMatches: "no" })], undefined)).toMatchObject({ quality: "directional" });
    expect(matchBenchmark("nrr", company, [cand({}, { reviewedAt: new Date("2020-01-01") })], undefined)).toMatchObject({ quality: "directional", caveats: expect.arrayContaining(["the dataset is due for review"]) });
  });

  it("follows an advisor's override: a chosen record (even outside the cohort), or none", () => {
    const seed = cand({ stages: "Seed" });
    expect(matchBenchmark("nrr", company, [seed], { recordId: seed.id, reason: "closest available" })).toMatchObject({ status: "matched", selection: "override", quality: "directional" });
    expect(matchBenchmark("nrr", company, [cand({})], { recordId: null, reason: "definition differs" })).toMatchObject({ status: "none", reason: expect.stringMatching(/chose not to benchmark this metric: definition differs/) });
    const monthly = cand({ periodBasis: "monthly" });
    expect(matchBenchmark("nrr", company, [monthly], { recordId: monthly.id, reason: "x" })).toMatchObject({ status: "none", reason: expect.stringMatching(/can't be used/) });
  });
});

describe("deterministic comparisons", () => {
  it("calculates differences in points for percentages and in units plus % otherwise, direction-aware", () => {
    expect(difference("nrr", 94, 100)).toEqual({ difference: -6, formatted: "6 pts below", relativePct: null, better: false });
    expect(difference("sales_cycle_days", 60, 80)).toEqual({ difference: -20, formatted: "20d below", relativePct: -25, better: true });
    expect(difference("acv", 30_000, 30_000)).toMatchObject({ difference: 0, better: null });
  });

  it("places a value among the published percentiles or range", () => {
    const rs = [cand({ statistic: "percentile", percentile: "25", value: "92" }), cand({}), cand({ statistic: "percentile", percentile: "75", value: "110" })];
    expect(position("nrr", 95, rs)).toBe("between the 25th percentile and the median");
    expect(position("nrr", 120, rs)).toBe("above the 75th percentile");
    expect(position("nrr", 90, [cand({ statistic: "range", value: "", valueLow: "95", valueHigh: "105" })])).toBe("below the published range");
  });

  it("builds an evidence-backed comparison, and withholds derived figures when the licence doesn't allow them", () => {
    const rs = [cand({}), cand({ statistic: "percentile", percentile: "75", value: "110" })];
    const m = matchBenchmark("nrr", company, rs, undefined);
    if (m.status !== "matched") throw new Error("expected match");
    const c = compare({ metric: "nrr", value: 94, period: "FY2025", origin: "calculated" }, m);
    expect(c.observed.formatted).toBe("94%");
    expect(c.benchmark.stats.map((s) => [s.statistic, s.formatted])).toEqual([["median", "100%"], ["75th percentile", "110%"]]);
    expect(c.derived).toMatchObject({ versus: "median", formatted: "6 pts below", better: false, position: null });
    expect(c.interpretation).toBe("NRR of 94% is 6 pts below the cohort median (worse). This shows where the company sits against this cohort, not why; the diagnosis rests on the company's own data.");
    // With percentiles on both sides, the position adds information and is kept.
    const three = matchBenchmark("nrr", company, [...rs, cand({ statistic: "percentile", percentile: "25", value: "90" })], undefined);
    if (three.status !== "matched") throw new Error("expected match");
    expect(compare({ metric: "nrr", value: 94, period: null, origin: "manual" }, three).derived!.position).toBe("between the 25th percentile and the median");
    expect(c.benchmark.source.name).toBe("Test Source");
    const noDerived = compare({ metric: "nrr", value: 94, period: null, origin: "manual" }, { ...m, records: m.records.map((r) => ({ ...r, source: { ...r.source, allowDerived: false } })) });
    expect(noDerived.derived).toBeNull();
    expect(noDerived.limitations[0]).toMatch(/licence doesn't cover derived figures/);
  });
});
