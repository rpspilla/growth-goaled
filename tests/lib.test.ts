import { describe, expect, it } from "vitest";
import { isStaging } from "@/lib/env";
import { formatMetric, isMetricKey } from "@/lib/metrics";
import { progressIndex, currentStep } from "@/lib/phases";

describe("isStaging", () => {
  it("is true only for the dev domain", () => {
    expect(isStaging("https://dev.growthgoaled.com")).toBe(true);
    expect(isStaging("https://app.growthgoaled.com")).toBe(false);
    expect(isStaging("http://localhost:3000")).toBe(false);
    expect(isStaging(undefined)).toBe(false);
    expect(isStaging("not a url")).toBe(false);
  });
});

describe("metrics", () => {
  it("formats prototype figures", () => {
    expect(formatMetric("arr", 4_200_000)).toBe("$4.2M");
    expect(formatMetric("acv", 42_000)).toBe("$42K");
    expect(formatMetric("nrr", 108)).toBe("108%");
    expect(formatMetric("sales_cycle_days", 94)).toBe("94d");
    expect(formatMetric("customers", 1234)).toBe("1,234");
  });

  it("recognises dictionary keys only", () => {
    expect(isMetricKey("nrr")).toBe(true);
    expect(isMetricKey("toString")).toBe(false);
  });
});

describe("phases", () => {
  it("maps company phase to sidebar step and progress bar", () => {
    expect(currentStep("benchmark")).toBe(3);
    expect(progressIndex("intake")).toBe(0);
    expect(progressIndex("upload")).toBe(0);
    expect(progressIndex("hiring")).toBe(5);
    expect(progressIndex("complete")).toBe(6);
  });
});
