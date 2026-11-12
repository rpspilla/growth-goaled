import { describe, expect, it } from "vitest";
import { computeHiringPlan, DEFAULT_RAMP_DAYS, figureFromField, HIRING_INPUTS, hiringValues, prefillFromFigures } from "@/lib/hiring-plan";
import { askFor, checkAnswer } from "@/lib/plan-requests";

const today = "2026-11-12";
// 12 months to the target, $1.2M gap.
const full = { target_arr: "3000000", target_date: "2027-11-12", ae_conversion: "25", ae_cycle_days: "60", acv: "40000", ramp_days: "90", gross_churn: "8" };

describe("Growth Hiring Plan inputs", () => {
  it("are exactly six, each with named fields and file columns", () => {
    expect(HIRING_INPUTS.map((i) => i.id)).toEqual(["conversion", "cycle", "acv", "ramp", "churn", "target"]);
    for (const i of HIRING_INPUTS) {
      expect(i.request.fields.length).toBeGreaterThan(0);
      expect(i.request.columns.length).toBeGreaterThan(1);
    }
    expect(askFor(HIRING_INPUTS[0]!.request)).toBe("Enter Conversion rate, founder-owned deals and Conversion rate, AE-owned deals");
    // ACV by segment is optional; blended is required.
    expect(askFor(HIRING_INPUTS[2]!.request)).toBe("Enter ACV, blended");
    expect(checkAnswer(HIRING_INPUTS[2]!.request, { acv: "40000" })).toEqual({ ok: true, values: { acv: "40000" } });
    // Ramp shows a labelled default.
    expect(HIRING_INPUTS[3]!.request.fields[0]).toMatchObject({ defaultValue: "90", defaultLabel: expect.stringContaining("Default") });
  });

  it("pre-fill from stored figures, and typed answers become those figures", () => {
    expect(prefillFromFigures({ acv: 41234.4, ramp_months: 3, grr: 91 })).toEqual({ acv: "41234", ramp_days: "91", gross_churn: "9" });
    expect(figureFromField("ramp_days", "90")).toEqual({ metric: "ramp_months", value: 3, unit: "months" });
    expect(figureFromField("gross_churn", "8")).toEqual({ metric: "grr", value: 92, unit: "percent" });
    expect(figureFromField("target_arr", "3000000")).toBeNull();
    expect(hiringValues([{ request: { fields: [], columns: [], answer: { values: { acv: "1", other: "x" }, at: "", by: "" } } }, { request: null }])).toEqual({ acv: "1" });
  });
});

describe("hiring math", () => {
  it("works out the quota and pipeline from the six inputs", () => {
    const r = computeHiringPlan(full, { currentArr: 1_800_000, storedCoverage: null, today });
    expect(r.missing).toEqual([]);
    expect(r.leakyBucket).toBeNull();
    const n = r.numbers!;
    expect(n.gap).toBe(1_200_000);
    expect(n.monthsToTarget).toBeCloseTo(11.99, 1);
    // Linear ramp: ~2.96 months at half pace, the rest at full.
    expect(n.effectiveMonths).toBeCloseTo(n.monthsToTarget - n.rampMonths / 2, 5);
    expect(n.monthlyQuota).toBeCloseTo(1_200_000 / n.effectiveMonths, 5);
    expect(n.quota).toBeCloseTo(n.monthlyQuota * 12, 5);
    // No stored coverage: 1 ÷ 25% = 4x.
    expect(n.coverage).toBe(4);
    expect(n.coverageSource).toBe("ae_conversion");
    expect(n.pipelinePerMonth).toBeCloseTo(n.monthlyQuota * 4, 5);
    expect(n.dealsPerMonth).toBeCloseTo(n.monthlyQuota / 40000, 5);
    // Pipeline for the first full month starts one AE cycle before ramp ends.
    expect(n.pipelineStartBy).toBe("2026-12-12");
    // The Source Trail shows each formula and its inputs; the target is labelled "your target".
    expect(r.trail.map((t) => t.label)).toEqual(["Gap to your target", "Selling months the AE has", "Quota recommendation", "Pipeline coverage", "Pipeline the AE must generate each month", "Deals a month"]);
    expect(r.trail[0]!.inputs).toContainEqual({ label: "Revenue target (ARR)", value: "$3,000,000", source: "your target" });
    expect(r.trail[2]!.formula).toContain("× 12");
  });

  it("uses stored pipeline coverage when there is one, and the ramp default when not answered", () => {
    const { ramp_days: _, ...noRamp } = full;
    const r = computeHiringPlan(noRamp, { currentArr: 1_800_000, storedCoverage: 3, today });
    expect(r.numbers!.coverage).toBe(3);
    expect(r.numbers!.coverageSource).toBe("stored");
    expect(r.numbers!.rampMonths).toBeCloseTo(DEFAULT_RAMP_DAYS / 30.4375, 5);
    expect(r.trail[1]!.inputs).toContainEqual(expect.objectContaining({ label: "Expected ramp time", source: "default" }));
  });

  it("lists what's missing instead of guessing", () => {
    const r = computeHiringPlan({ ae_conversion: "25" }, { currentArr: null, storedCoverage: null, today });
    expect(r.numbers).toBeNull();
    expect(r.missing).toEqual(["Revenue target (ARR)", "Target date", "Average deal cycle, AE-closed", "Gross revenue churn, last 12 months", "Current ARR (add it under Company Details or Performance)"]);
  });

  it("flags a leaky bucket before any hire, and says when the numbers can't work", () => {
    expect(computeHiringPlan({ ...full, gross_churn: "22" }, { currentArr: 1_800_000, storedCoverage: null, today }).leakyBucket).toContain("leaky bucket");
    expect(computeHiringPlan(full, { currentArr: 3_500_000, storedCoverage: null, today }).problems[0]).toContain("already meets your target");
    expect(computeHiringPlan({ ...full, target_date: "2026-01-01" }, { currentArr: 1_800_000, storedCoverage: null, today }).problems).toEqual(["Your target date has passed. Enter a date in the future."]);
  });
});
