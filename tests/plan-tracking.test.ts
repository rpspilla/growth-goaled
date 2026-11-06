/** Execute & Monitor tracking rules: deadlines, targets and the two hours of live time a month. */
import { describe, expect, it } from "vitest";
import type { ActionPlanContent } from "@/lib/db/schema";
import { carryDues, cleanTargets, isOverdue, supportMinutesThisMonth, targetMet, withDefaultDues } from "@/lib/plan-tracking";

const step = (action: string, extra: Record<string, unknown> = {}) => ({ action, owner: "Founder", measure: "m", ...extra });
const plan = (o: Partial<ActionPlanContent> = {}): ActionPlanContent => ({ goal: "g", summary: "s", days30: [step("A")], days60: [step("B", { due: "2027-03-01" })], days90: [step("C")], risks: [], assumptions: [], ...o });

describe("deadlines", () => {
  it("default to the end of each period from the start, keeping ones already set", () => {
    const c = withDefaultDues(plan(), new Date("2026-11-06T12:00:00Z"));
    expect([c.days30[0]!.due, c.days60[0]!.due, c.days90[0]!.due]).toEqual(["2026-12-06", "2027-03-01", "2027-02-04"]);
  });
  it("carry over a rewrite by action, with the targets", () => {
    const before = plan({ days30: [step("Hire an AE", { due: "2026-12-01" })], targets: [{ metric: "win_rate", target: 25 }] });
    const after = carryDues(plan({ days30: [step(" hire an ae "), step("New")] }), before);
    expect(after.days30.map((s) => s.due)).toEqual(["2026-12-01", undefined]);
    expect(after.targets).toEqual([{ metric: "win_rate", target: 25 }]);
  });
  it("are overdue once past and not done", () => {
    expect(isOverdue({ due: "2026-11-05" }, "2026-11-06")).toBe(true);
    expect(isOverdue({ due: "2026-11-06" }, "2026-11-06")).toBe(false);
    expect(isOverdue({ due: "2026-11-05", done: true }, "2026-11-06")).toBe(false);
    expect(isOverdue({}, "2026-11-06")).toBe(false);
  });
});

describe("targets", () => {
  it("accept known metrics, numbers and dates; one per metric, at most six", () => {
    expect(cleanTargets([{ metric: "win_rate", target: 25, by: "2027-01-31" }, { metric: "nrr", target: 110 }])).toEqual([{ metric: "win_rate", target: 25, by: "2027-01-31" }, { metric: "nrr", target: 110, by: null }]);
    expect(cleanTargets([{ metric: "made_up", target: 1 }])).toBeNull();
    expect(cleanTargets([{ metric: "nrr", target: Number.NaN }])).toBeNull();
    expect(cleanTargets([{ metric: "nrr", target: 1, by: "soon" }])).toBeNull();
    expect(cleanTargets([{ metric: "nrr", target: 1 }, { metric: "nrr", target: 2 }])).toBeNull();
    expect(cleanTargets("nope")).toBeNull();
  });
  it("are met in the metric's own direction", () => {
    expect(targetMet("win_rate", 26, 25)).toBe(true);
    expect(targetMet("win_rate", 20, 25)).toBe(false);
    expect(targetMet("sales_cycle_days", 40, 45)).toBe(true);
    expect(targetMet("sales_cycle_days", 60, 45)).toBe(false);
    expect(targetMet("win_rate", null, 25)).toBeNull();
  });
});

describe("live time", () => {
  it("counts live support in the current month only; reviews don't count", () => {
    const sessions = [
      { kind: "support", minutes: 45, heldOn: "2026-11-02" },
      { kind: "support", minutes: 30, heldOn: "2026-10-30" },
      { kind: "review", minutes: 60, heldOn: "2026-11-03" },
      { kind: "support", minutes: 20, heldOn: "2026-11-05" },
    ];
    expect(supportMinutesThisMonth(sessions, new Date("2026-11-06T00:00:00Z"))).toBe(65);
  });
});
