import { describe, expect, it } from "vitest";
import { diagnose, type Figure } from "@/lib/diagnostics";
import type { FileAnalysis } from "@/lib/metrics-engine";

const fig = (metric: Figure["metric"], value: number, extra: Partial<Figure> = {}): Figure => ({ metric, value, period: "Sep 2025 – Sep 2026", origin: "calculated", confirmed: true, ...extra });
const withBridge = (b: Partial<NonNullable<FileAnalysis["bridge"]>>): FileAnalysis => ({
  metrics: [],
  warnings: [],
  bridge: { from: "2025-09", to: "2026-09", startArr: 1_000_000, newArr: 200_000, expansionArr: 50_000, contractionArr: 100_000, churnedArr: 250_000, endArr: 900_000, customersStart: 40, customersEnd: 38, customersNew: 6, customersChurned: 8, ...b },
});

describe("diagnostic rules", () => {
  it("establishes retention as the leak when losses outweigh new business on calculated figures", () => {
    const d = diagnose("growth_leak", [fig("nrr", 70)], [withBridge({})]);
    expect(d.certainty).toBe("established");
    expect(d.candidates[0]).toMatchObject({ id: "retention", impactArr: 350_000 });
    expect(d.candidates[0]!.supporting.map((e) => e.text)).toEqual(
      expect.arrayContaining(["More ARR was lost ($350K) than won from new customers ($200K)."]),
    );
  });

  it("points to new business, with retention's contradiction recorded, when the base is healthy", () => {
    const d = diagnose("growth_leak", [fig("nrr", 112)], [withBridge({ churnedArr: 20_000, contractionArr: 10_000, expansionArr: 150_000, newArr: 60_000 })]);
    const retention = d.candidates.find((c) => c.id === "retention")!;
    expect(retention.contradicting.map((e) => e.text).join(" ")).toMatch(/expansion outweighs losses/);
    expect(d.candidates[0]!.id).not.toBe("retention");
  });

  it("says the root cause is unresolved when there's nothing to go on, and names what's missing", () => {
    const d = diagnose("growth_leak", [], []);
    expect(d.certainty).toBe("unresolved");
    expect(d.candidates).toEqual([]);
    expect(d.unknowns).toEqual(expect.arrayContaining(["NRR isn't available yet.", "Churned ARR isn't available yet."]));
  });

  it("treats reported (not calculated) evidence as weaker, and flags small samples and unconfirmed figures", () => {
    const d = diagnose("hire_or_fix", [fig("win_rate", 18, { origin: "manual", sampleSize: 6, confirmed: false }), fig("founder_closed_share", 80)], []);
    expect(d.candidates.map((c) => c.id)).toEqual(expect.arrayContaining(["conversion", "founder_dependence"]));
    expect(d.unknowns).toEqual(expect.arrayContaining(["Win Rate isn't confirmed yet.", "Win Rate rests on only 6 records."]));
    expect(d.certainty).not.toBe("established");
  });

  it("ranks ICP segments only on adequate samples", () => {
    const segs: FileAnalysis = {
      metrics: [],
      warnings: [],
      segments: [{ dimension: "Industry", rows: [
        { name: "Fintech", won: 8, lost: 4, open: 0, winRate: 66.7, avgWonAmount: 40000, medianCycleDays: 60, smallSample: false },
        { name: "Health", won: 3, lost: 9, open: 0, winRate: 25, avgWonAmount: 20000, medianCycleDays: 120, smallSample: false },
        { name: "Retail", won: 2, lost: 0, open: 0, winRate: 100, avgWonAmount: 10000, medianCycleDays: 30, smallSample: true },
      ] }],
    };
    const d = diagnose("winning_icp", [], [segs]);
    expect(d.candidates[0]!.title).toBe("Fintech is the strongest industry");
    expect(d.candidates[0]!.contradicting[0]!.text).toBe("Too few closed deals to compare: Retail.");
  });
});
