import { describe, expect, it } from "vitest";
import { ANALYTIC_METRICS, ALL_ITEM_KEYS, CATEGORIES, getItem } from "@/lib/readiness";
import { assessReadiness, coverageMonths, missingFieldsFor, type ItemState } from "@/lib/readiness-assessment";
import { parseCsv, parseDateCell, profileSheets } from "@/lib/file-profile";
import { readinessFacts } from "@/lib/readiness-facts";

const NOW = new Date("2026-10-23T00:00:00Z");

const item = (key: string, over: Partial<ItemState> = {}): ItemState => ({
  key,
  status: "available",
  quality: "unverified",
  coverageStart: null,
  coverageEnd: null,
  limitations: null,
  followUp: null,
  fileCount: 0,
  missingFields: [],
  ...over,
});

describe("readiness requirements", () => {
  it("covers categories A–F with unique item keys", () => {
    expect(CATEGORIES.map((c) => c.letter)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(new Set(ALL_ITEM_KEYS).size).toBe(ALL_ITEM_KEYS.length);
    for (const c of CATEGORIES) {
      expect(c.items.length).toBeGreaterThan(0);
      expect(c.suggestedFiles.length).toBeGreaterThan(0);
      expect(c.items.some((i) => i.required)).toBe(true);
    }
  });

  it("gives every item a reason and a specific follow-up request", () => {
    for (const key of ALL_ITEM_KEYS) {
      const d = getItem(key)!;
      expect(d.why.length, key).toBeGreaterThan(10);
      expect(d.followUp.length, key).toBeGreaterThan(10);
    }
  });

  it("only references real items from metric requirements", () => {
    for (const m of ANALYTIC_METRICS) for (const k of [...m.needs, ...(m.improves ?? [])]) expect(getItem(k), `${m.key} → ${k}`).toBeDefined();
  });

  it("includes AI inference costs under product", () => {
    expect(getItem("ai_costs")?.category).toBe("product");
  });
});

describe("coverageMonths", () => {
  it("counts whole months inclusively", () => {
    expect(coverageMonths("2025-10-01", "2026-09-01")).toBe(12);
    expect(coverageMonths("2026-01-01", "2026-01-01")).toBe(1);
    expect(coverageMonths(null, "2026-01-01")).toBeNull();
  });
});

describe("assessReadiness", () => {
  it("starts with nothing ready and everything unreviewed", () => {
    const a = assessReadiness([], [], NOW);
    expect(a.collection.requiredPercent).toBe(0);
    expect(a.collection.reviewed).toBe(0);
    expect(a.analytical.every((m) => m.state === "blocked")).toBe(true);
    expect(a.readyForBenchmark).toBe(false);
    expect(a.nextRequest).not.toBeNull();
  });

  it("keeps collection, quality and analytical readiness separate", () => {
    // Every required item marked available, but nothing validated and with no coverage dates.
    const all = ALL_ITEM_KEYS.filter((k) => getItem(k)!.required).map((k) => item(k));
    const a = assessReadiness(all, [], NOW);
    expect(a.collection.requiredPercent).toBe(100);
    expect(a.quality.validated).toBe(0);
    expect(a.quality.unverified).toBe(all.length);
    // Marking available is not validation.
    expect(a.quality.issues.some((i) => i.kind === "no_coverage")).toBe(true);
  });

  it("counts partial as half and excludes not-applicable from required", () => {
    const required = ALL_ITEM_KEYS.filter((k) => getItem(k)!.required);
    const a = assessReadiness([item(required[0]!, { status: "partial" }), item(required[1]!, { status: "not_applicable" })], [], NOW);
    expect(a.collection.requiredTotal).toBe(required.length - 1);
    expect(a.collection.requiredSupplied).toBe(0.5);
  });

  it("flags short history, outdated data, estimates and missing fields", () => {
    const a = assessReadiness(
      [
        item("monthly_revenue", { coverageStart: "2026-03-01", coverageEnd: "2026-09-01", quality: "estimated" }),
        item("marketing_spend", { coverageStart: "2024-01-01", coverageEnd: "2025-06-01" }),
        item("revenue_by_customer", { missingFields: ["revenue"] }),
      ],
      [],
      NOW,
    );
    const kinds = (k: string) => a.quality.issues.filter((i) => i.key === k).map((i) => i.kind);
    expect(kinds("monthly_revenue")).toEqual(expect.arrayContaining(["short_history", "estimated"]));
    expect(kinds("marketing_spend")).toContain("outdated");
    expect(kinds("revenue_by_customer")).toContain("missing_fields");
    expect(a.gaps.incomplete).toEqual(expect.arrayContaining(["monthly_revenue", "marketing_spend", "revenue_by_customer"]));
    expect(a.analytical.find((m) => m.key === "revenue_growth")!.state).toBe("limited");
  });

  it("explains which metrics can't be calculated and what unblocks them", () => {
    const a = assessReadiness([item("revenue_by_customer")], [], NOW);
    const nrr = a.analytical.find((m) => m.key === "net_revenue_retention")!;
    expect(nrr.state).toBe("blocked");
    expect(nrr.blockedBy).toEqual(["churned_revenue"]);
    expect(nrr.message).toMatch(/NRR/);
  });

  it("prefers an advisor's follow-up request for the next step", () => {
    const others = ALL_ITEM_KEYS.filter((k) => k !== "monthly_revenue").map((k) => item(k));
    const a = assessReadiness(
      [...others, item("monthly_revenue", { status: "missing", followUp: "Export the P&L from QuickBooks, monthly, Oct 2025 – Sep 2026." })],
      [],
      NOW,
    );
    expect(a.nextRequest?.key).toBe("monthly_revenue");
    expect(a.nextRequest?.request).toMatch(/QuickBooks/);
  });

  it("reports conflicts and blocks the benchmark until critical inputs exist", () => {
    const a = assessReadiness([], [{ title: "Conflicting ARR data" }], NOW);
    expect(a.quality.openConflicts).toBe(1);
    expect(a.gaps.conflicting).toEqual(["Conflicting ARR data"]);
    expect(a.benchmarkBlockers.some((b) => b.includes("Revenue growth"))).toBe(true);
  });

  it("builds AI facts from names only, with no values", () => {
    const a = assessReadiness([item("monthly_revenue")], [], NOW);
    const facts = JSON.stringify(readinessFacts(a, { monthly_revenue: "available" }));
    expect(facts).toContain("Monthly revenue");
    expect(facts).not.toContain("monthly_revenue");
  });
});

describe("file profiling", () => {
  it("parses common date formats", () => {
    expect(parseDateCell("2026-01")).toBe("2026-01-01");
    expect(parseDateCell("2026-01-15")).toBe("2026-01-15");
    expect(parseDateCell("3/1/2026")).toBe("2026-03-01");
    expect(parseDateCell("Jan 2026")).toBe("2026-01-01");
    expect(parseDateCell("Jan-26")).toBe("2026-01-01");
    expect(parseDateCell("Acme")).toBeNull();
  });

  it("finds columns, row counts and the date range in a CSV", () => {
    const csv = 'Customer,Industry,ARR,Start date\nAcme,"Fintech, Payments",120000,2025-02-01\nGlobex,Health,80000,2026-08-15\n';
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual(["Acme", "Fintech, Payments", "120000", "2025-02-01"]);
    const profile = profileSheets([{ name: "customers", rows }]);
    expect(profile.sheets[0]!.columns).toEqual(["Customer", "Industry", "ARR", "Start date"]);
    expect(profile.sheets[0]!.rows).toBe(2);
    expect(profile.dateRange).toEqual({ start: "2025-02-01", end: "2026-08-15" });
  });

  it("flags expected columns that a file lacks", () => {
    expect(missingFieldsFor("monthly_revenue", ["Month", "Revenue"])).toEqual([]);
    expect(missingFieldsFor("monthly_revenue", ["Month", "Headcount"])).toEqual(["revenue"]);
  });
});
