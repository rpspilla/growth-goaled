import { describe, expect, it } from "vitest";
import { analyzeSheets } from "@/lib/metrics-engine";
import { bridge } from "@/lib/metrics-engine/revenue";
import { parseNumber } from "@/lib/metrics-engine/tables";

const metric = (a: ReturnType<typeof analyzeSheets>, key: string) => a.metrics.find((m) => m.metric === key);

/**
 * Hand-worked example, MRR per customer (wide layout, months across):
 *            Sep 2025  Sep 2026
 *   Acme        1,000     1,500   expansion +500
 *   Beta        2,000     1,600   contraction −400
 *   Gamma         500         0   churned −500
 *   Delta           0       800   new +800
 * Start MRR 3,500 → ARR 42,000. End MRR 3,900 → ARR 46,800.
 * NRR = (3,500 + 500 − 400 − 500) / 3,500 = 88.6%. GRR = (3,500 − 400 − 500) / 3,500 = 74.3%.
 */
const months = ["Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026"];
const row = (name: string, start: number, end: number) => [name, String(start), ...Array(11).fill(String(start)), String(end)];
const wide = {
  name: "MRR by customer",
  rows: [
    ["Monthly recurring revenue by customer"],
    ["Customer", ...months],
    row("Acme", 1000, 1500),
    row("Beta", 2000, 1600),
    row("Gamma", 500, 0),
    ["Delta", ...Array(12).fill(""), "800"],
    ["Total", "3500", ...Array(11).fill("3500"), "3900"],
  ],
};

describe("revenue calculations", () => {
  it("builds the ARR bridge, NRR and GRR from customer MRR (hand-checked)", () => {
    const a = analyzeSheets([wide]);
    expect(a.bridge).toMatchObject({ from: "2025-09", to: "2026-09", startArr: 42000, newArr: 9600, expansionArr: 6000, contractionArr: 4800, churnedArr: 6000, endArr: 46800, customersStart: 3, customersEnd: 3, customersNew: 1, customersChurned: 1 });
    expect(metric(a, "arr")).toMatchObject({ value: 46800, period: "Sep 2026" });
    expect(metric(a, "nrr")).toMatchObject({ value: 88.6, period: "Sep 2025 – Sep 2026", sampleSize: 3 });
    expect(metric(a, "grr")!.value).toBe(74.3);
    expect(metric(a, "arr_growth")!.value).toBe(11.4); // 3,900 / 3,500 − 1
    expect(metric(a, "customers")!.value).toBe(3);
    expect(metric(a, "top_customer_concentration")!.value).toBe(41); // Beta 1,600 / 3,900
    expect(metric(a, "acv")!.value).toBe(15600);
    expect(metric(a, "nrr")!.method).toMatch(/starting ARR/);
    expect(a.topCustomers![0]).toEqual({ name: "Beta", arr: 19200, share: 41 });
  });

  it("is deterministic and doesn't depend on row order", () => {
    const shuffled = { ...wide, rows: [wide.rows[0]!, wide.rows[1]!, ...wide.rows.slice(2).reverse()] };
    expect(analyzeSheets([shuffled]).metrics).toEqual(analyzeSheets([wide]).metrics);
  });

  it("reads long tables, divides ARR columns by 12, and warns about missing months", () => {
    const a = analyzeSheets([{ name: "Revenue", rows: [["Month", "ARR"], ["2026-01", "120000"], ["2026-02", "132000"], ["2026-04", "150000"]] }]);
    expect(metric(a, "arr")!.value).toBe(150000);
    expect(metric(a, "arr")!.method).toMatch(/annual amounts ÷ 12/);
    expect(a.warnings.join(" ")).toMatch(/missing month/);
    expect(metric(a, "nrr")).toBeUndefined(); // no per-customer data, no retention figure
  });

  it("flags a bridge shorter than a year", () => {
    const short = { name: "MRR", rows: [["Customer", "Jan 2026", "Feb 2026", "Mar 2026"], ["A", "100", "100", "120"], ["B", "100", "100", "0"]] };
    const a = analyzeSheets([short]);
    expect(metric(a, "nrr")!.method).toMatch(/Covers 2 months, not a full year/);
    expect(a.warnings.join(" ")).toMatch(/not a full year/);
  });

  it("doesn't treat a P&L as a customer table", () => {
    const pl = { name: "P&L", rows: [["Line", "Jan 2026", "Feb 2026", "Mar 2026"], ["Revenue", "100000", "110000", "120000"], ["COGS", "20000", "22000", "24000"], ["Total expenses", "300000", "300000", "300000"], ["Cash", "2400000", "2210000", "2030000"]] };
    const a = analyzeSheets([pl]);
    expect(metric(a, "arr")).toBeUndefined();
    expect(metric(a, "gross_margin")).toMatchObject({ value: 80, period: "Jan 2026 – Mar 2026" });
    // burn = expenses − revenue = 200k, 190k, 180k → avg 190k; runway = 2,030,000 / 190,000 = 10.7
    expect(metric(a, "runway_months")).toMatchObject({ value: 10.7, period: "Mar 2026" });
  });
});

describe("pipeline calculations", () => {
  const deals = {
    name: "Deals",
    rows: [
      ["Deal", "Stage", "Amount", "Create Date", "Close Date", "Deal Owner", "Lead Source"],
      ["1", "Closed Won", "$40,000", "2026-01-01", "2026-03-02", "Maya (Founder)", "Referral"],
      ["2", "Closed Won", "$30,000", "2026-02-01", "2026-04-02", "Maya (Founder)", "Referral"],
      ["3", "Closed Won", "$20,000", "2026-03-01", "2026-06-29", "Sam", "Outbound"],
      ["4", "Closed Lost", "$25,000", "2026-03-01", "2026-05-01", "Sam", "Outbound"],
      ["5", "Closed Lost", "$25,000", "2026-04-01", "2026-06-01", "Sam", "Outbound"],
      ["6", "Proposal", "$50,000", "2026-07-01", "", "Sam", "Outbound"],
      ["7", "Closed Lost", "$10,000", "2024-01-01", "2024-03-01", "Sam", "Outbound"], // outside the 12-month window
    ],
  };

  it("computes win rate, cycle and founder share over the 12 months to the latest close (hand-checked)", () => {
    const a = analyzeSheets([deals]);
    expect(metric(a, "win_rate")).toMatchObject({ value: 60, sampleSize: 5, period: "2025-06-29 to 2026-06-29" }); // 3 won / 5 closed in window
    expect(metric(a, "sales_cycle_days")!.value).toBe(60); // median of 60, 60, 120
    expect(metric(a, "founder_closed_share")!.value).toBe(66.7); // 2 of 3 won
    expect(a.pipeline).toEqual({ openCount: 1, openAmount: 50000, wonCount: 3, lostCount: 2, asOf: "2026-06-29" });
    const source = a.segments!.find((s) => s.dimension === "Source")!;
    expect(source.rows[0]).toMatchObject({ name: "Referral", won: 2, lost: 0, winRate: 100, avgWonAmount: 35000, smallSample: true });
    expect(source.rows[1]).toMatchObject({ name: "Outbound", won: 1, lost: 2, winRate: 33.3 });
    expect(a.warnings.join(" ")).toMatch(/only 5 closed deals/);
  });

  it("doesn't guess who the founder is", () => {
    const anon = { ...deals, rows: deals.rows.map((r, i) => (i === 0 ? r : r.map((c, j) => (j === 5 ? "Rep A" : c)))) };
    const a = analyzeSheets([anon]);
    expect(metric(a, "founder_closed_share")).toBeUndefined();
    expect(a.warnings.join(" ")).toMatch(/founder involvement can't be measured/);
  });
});

describe("number parsing", () => {
  it("handles spreadsheet formats", () => {
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("(1,200)")).toBe(-1200);
    expect(parseNumber("12%")).toBe(12);
    expect(parseNumber("1.2k")).toBe(1200);
    expect(parseNumber("-")).toBe(0);
    expect(parseNumber("n/a")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });

  it("bridge handles customers who appear and disappear", () => {
    const b = bridge(new Map([["A", new Map([["2026-01", 0], ["2026-12", 0]])]]), "2026-01", "2026-12");
    expect(b).toMatchObject({ startArr: 0, endArr: 0, customersStart: 0 });
  });
});
