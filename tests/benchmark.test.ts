import { describe, expect, it } from "vitest";
import { radarScore, statusVsTopQuartile } from "@/lib/benchmark";

describe("statusVsTopQuartile", () => {
  it("compares higher-is-better metrics", () => {
    expect(statusVsTopQuartile("arr_growth", 72, 89)).toBe("behind");
    expect(statusVsTopQuartile("win_rate", 28, 24)).toBe("ahead");
    expect(statusVsTopQuartile("nrr", 119, 119)).toBe("ahead");
  });

  it("inverts lower-is-better metrics", () => {
    expect(statusVsTopQuartile("sales_cycle_days", 94, 61)).toBe("behind");
    expect(statusVsTopQuartile("cac_payback_months", 10, 11)).toBe("ahead");
  });
});

describe("radarScore", () => {
  it("scales to top quartile = 100", () => {
    expect(radarScore("arr_growth", 89, 89)).toBe(100);
    expect(radarScore("arr_growth", 72, 89)).toBe(81);
    expect(radarScore("sales_cycle_days", 94, 61)).toBe(65);
  });

  it("caps outliers and guards zero", () => {
    expect(radarScore("win_rate", 60, 24)).toBe(120);
    expect(radarScore("nrr", 0, 119)).toBe(0);
  });
});
