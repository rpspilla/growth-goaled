import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { csvTemplate, describeCriteria, parseBenchmarkCsv, quartileProblem } from "@/lib/benchmarks";
import { groundToSearch, type ResearchOutput } from "@/lib/ai/research";

describe("quartile order", () => {
  it("expects p25 ≤ median ≤ top quartile when higher is better", () => {
    expect(quartileProblem("nrr", { p25: 95, median: 104, p75: 119 })).toBeNull();
    expect(quartileProblem("nrr", { p25: 119, median: 104, p75: 95 })).toMatch(/p25 ≤ median/);
  });
  it("expects the top quartile to be smallest when lower is better", () => {
    expect(quartileProblem("sales_cycle_days", { p25: 110, median: 78, p75: 61 })).toBeNull();
    expect(quartileProblem("sales_cycle_days", { p25: 61, median: 78, p75: 110 })).toMatch(/lower-is-better/);
  });
  it("allows missing quartiles but not an empty row", () => {
    expect(quartileProblem("win_rate", { p25: null, median: 21, p75: 24 })).toBeNull();
    expect(quartileProblem("win_rate", { p25: null, median: null, p75: null })).toBe("No values given.");
  });
});

describe("advisory CSV", () => {
  it("parses the downloadable template, skipping comments", () => {
    const { rows, errors } = parseBenchmarkCsv(csvTemplate());
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.metric)).toEqual(["arr_growth", "sales_cycle_days"]);
    expect(rows[1]).toMatchObject({ p25: 110, median: 78, p75: 61, sampleSize: 120, period: "2026" });
  });

  it("reports bad rows instead of guessing", () => {
    const csv = [
      "metric,p25,median,top_quartile,sample_size,period",
      "nrr,95,104,119,40,2025",
      "made_up,1,2,3,,",
      "win_rate,abc,21,24,,",
      "sales_cycle_days,61,78,110,,",
      "acv,\"$20,000\",\"$35,000\",\"$60,000\",12.5,",
      "nrr,90,100,110,,2025",
      "grr,,,,,",
    ].join("\n");
    const { rows, errors } = parseBenchmarkCsv(csv);
    expect(rows.map((r) => r.metric)).toEqual(["nrr"]);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(errors.find((e) => e.line === 6)?.message).toMatch(/whole number/);
    expect(errors.find((e) => e.line === 7)?.message).toMatch(/Duplicate/);
  });

  it("accepts currency formatting in values", () => {
    const { rows } = parseBenchmarkCsv('metric,p25,median,top_quartile\nacv,"$20,000","$35,000","$60,000"');
    expect(rows[0]).toMatchObject({ p25: 20000, median: 35000, p75: 60000, sampleSize: null, period: null });
  });

  it("rejects files without the template columns", () => {
    expect(parseBenchmarkCsv("name,value\nnrr,100").errors[0]?.message).toMatch(/Missing columns/);
  });
});

describe("research grounding", () => {
  const output: ResearchOutput = {
    sources: [
      { name: "SaaS Survey 2026", publisher: "KeyBanc", url: "https://example.com/report/", year: 2026, sample_description: "300 private SaaS cos" },
      { name: "Made-up report", publisher: "Nobody", url: "https://invented.example/x", year: 2026, sample_description: null },
    ],
    metrics: [
      { metric: "nrr", p25: 95, median: 104, top_quartile: 115, sample_size: 300, period: "2025", source_index: 0, basis: "$5–20M ARR" },
      { metric: "win_rate", p25: null, median: 22, top_quartile: null, sample_size: null, period: null, source_index: 1, basis: "all" },
      { metric: "grr", p25: null, median: null, top_quartile: null, sample_size: null, period: null, source_index: 0, basis: "none" },
    ],
    not_found: ["magic_number"],
  };

  it("keeps only sources the search returned and re-indexes their metrics", () => {
    const { output: out, dropped } = groundToSearch(output, ["https://example.com/report"]);
    expect(out.sources.map((s) => s.name)).toEqual(["SaaS Survey 2026"]);
    expect(out.metrics.map((m) => m.metric)).toEqual(["nrr"]);
    expect(out.metrics[0]!.source_index).toBe(0);
    expect(dropped.join(" ")).toMatch(/Made-up report/);
    expect(dropped.join(" ")).toMatch(/Win Rate/);
  });
});

describe("criteria", () => {
  it("describes cohort criteria", () => {
    expect(describeCriteria({ stage: ["Series A"], arr_min: 2_000_000, arr_max: 10_000_000, model: "B2B SaaS", gtm_motion: "Founder-led" })).toBe(
      "Series A · ARR $2M–$10M · B2B SaaS · Founder-led",
    );
    expect(describeCriteria({})).toBe("No criteria set");
  });
});
