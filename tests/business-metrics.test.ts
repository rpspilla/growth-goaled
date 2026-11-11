import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {}, schema: {} }));
import { summarize } from "@/lib/data/business-metrics";
import { planProgress } from "@/lib/data/current-plan";

const row = (metric: string, value: number, day: number, extra: Partial<{ documentId: string; filename: string; origin: string; status: string; period: string }> = {}) => ({
  metric,
  value,
  period: extra.period ?? null,
  createdAt: new Date(Date.UTC(2026, 10, day, 12)),
  origin: extra.origin ?? "manual",
  status: extra.status ?? "accepted",
  documentId: extra.documentId ?? null,
  filename: extra.filename ?? null,
});

describe("summarize business metrics", () => {
  it("leads with the newest reading and shows the one before it", () => {
    const s = summarize([row("arr", 1_200_000, 10), row("arr", 1_000_000, 1), row("nrr", 104, 10)]);
    expect(s.latest.revenue).toMatchObject({ value: 1_200_000, previous: { value: 1_000_000 } });
    expect(s.latest.retention).toMatchObject({ metric: "nrr", value: 104, previous: null });
    expect(s.latest.growth).toBeNull();
  });
  it("uses gross retention only when there's no NRR", () => {
    expect(summarize([row("grr", 90, 3)]).latest.retention?.metric).toBe("grr");
    expect(summarize([row("grr", 90, 5), row("nrr", 110, 3)]).latest.retention?.metric).toBe("nrr");
  });
  it("groups readings into dated updates: one per file, typed-in ones by when they were saved", () => {
    const s = summarize([
      row("arr", 900_000, 2, { documentId: "d1", filename: "model.xlsx", origin: "extracted", status: "proposed" }),
      row("nrr", 101, 2, { documentId: "d1", filename: "model.xlsx", origin: "extracted", status: "proposed" }),
      row("arr", 960_000, 9),
      row("mom_growth", 6.7, 9, { origin: "calculated" }),
    ]);
    expect(s.updates).toHaveLength(2);
    expect(s.updates[0]).toMatchObject({ source: "Entered by hand", values: { revenue: { value: 960_000 }, growth: { value: 6.7 } } });
    expect(s.updates[1]).toMatchObject({ source: "Read from model.xlsx", values: { revenue: { value: 900_000, confirmed: false }, retention: { value: 101 } } });
  });
});

describe("planProgress", () => {
  it("counts milestones done, overdue ones and the next to do", () => {
    const step = (action: string, done = false, due?: string) => ({ action, owner: "", measure: "", done, due });
    const p = planProgress({ days30: [step("Hire AE", true), step("Write playbook", false, "2026-11-01")], days60: [step("Ramp AE")], days90: [] }, "2026-11-11");
    expect(p).toEqual({ done: 1, total: 3, overdue: 1, next: "Write playbook" });
    expect(planProgress(null)).toBeNull();
    expect(planProgress({ days30: [], days60: [], days90: [] })).toBeNull();
  });
});
