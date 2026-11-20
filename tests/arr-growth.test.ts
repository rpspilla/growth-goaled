import { describe, expect, it } from "vitest";
import { arrGrowthSinceLastUpdate, type ArrReading } from "@/lib/arr-growth";

const r = (value: number, day: string, extra: Partial<ArrReading> = {}): ArrReading => ({ value, period: null, status: "accepted", origin: "calculated", createdAt: new Date(day), updatedAt: new Date(day), ...extra });

describe("growth since the last data update", () => {
  it("compares the newest confirmed ARR with the update before it", () => {
    const g = arrGrowthSinceLastUpdate([r(1_000_000, "2026-08-01"), r(1_200_000, "2026-11-01", { period: "Nov 2026" }), r(900_000, "2026-05-01")]);
    expect(g).toMatchObject({ pct: 20, from: { value: 1_000_000, confirmed: true }, to: { value: 1_200_000, period: "Nov 2026" } });
  });
  it("skips repeats of the same figure, rejected figures and later unconfirmed ones; flags an unconfirmed earlier figure", () => {
    const g = arrGrowthSinceLastUpdate([
      r(1_500_000, "2026-12-01", { status: "proposed", origin: "extracted" }),
      r(1_200_000, "2026-11-01"),
      r(1_200_000, "2026-10-01"),
      r(5_000_000, "2026-09-01", { status: "rejected" }),
      r(1_250_000, "2026-07-01", { status: "proposed", origin: "extracted", period: "Jul 2026" }),
    ]);
    expect(g).toMatchObject({ pct: -4, from: { value: 1_250_000, period: "Jul 2026", confirmed: false } });
  });
  it("keeps figures set aside when a conflict was settled as history, if they're for an earlier month", () => {
    // Fasten: the corrected Nov figure chosen; the old misread (same month) and undated figures don't count.
    const g = arrGrowthSinceLastUpdate([
      r(1_662_850, "2026-11-20", { period: "Nov 2026" }),
      r(3_912_940, "2026-11-16", { status: "rejected", period: "Nov 2026" }),
      r(1_300_000, "2026-08-01", { status: "rejected", period: null }),
      r(1_247_450, "2026-07-30", { status: "rejected", origin: "extracted", period: "Jul 2026" }),
      r(93_000, "2026-07-30", { status: "rejected", origin: "extracted", period: "Jul 2025" }),
    ]);
    expect(g).toMatchObject({ pct: 33.3, from: { value: 1_247_450, period: "Jul 2026", confirmed: false } });
  });
  it("is null with nothing to compare", () => {
    expect(arrGrowthSinceLastUpdate([])).toBeNull();
    expect(arrGrowthSinceLastUpdate([r(1_000_000, "2026-11-01")])).toBeNull();
    expect(arrGrowthSinceLastUpdate([r(1_000_000, "2026-11-01", { status: "proposed" }), r(800_000, "2026-10-01", { status: "proposed" })])).toBeNull();
  });
});
