import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { positionTone, shortPosition } from "@/components/use-cases/PeerComparisonCard";
import { dataItemIcon, dataItemShort, OUTCOME_ICONS } from "@/components/visual/icons";
import { StepStrip } from "@/components/visual/journey";
import { MetricTile, ProgressRing, StatusChip } from "@/components/visual/primitives";
import { QuestionIllustration } from "@/components/visual/QuestionIllustration";
import { SignatureCharts } from "@/components/views/SignatureCharts";
import { briefChartsSchema, chartsFromAnalyses, EMPTY_CHARTS } from "@/lib/deliverables/charts";
import type { BaselineRow } from "@/lib/data/assessments";
import type { FileAnalysis } from "@/lib/metrics-engine";
import { CATEGORIES } from "@/lib/readiness";
import { USE_CASES } from "@/lib/use-cases";
import { USE_CASE_VISUALS } from "@/lib/use-cases/visual";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("visual copy for every growth question", () => {
  it("has a short one-liner and exactly three short outcome chips with known icons", () => {
    for (const u of USE_CASES) {
      const v = USE_CASE_VISUALS[u.id];
      expect(v.oneLine.split(/\s+/).length, u.id).toBeLessThanOrEqual(8);
      expect(v.outcomes).toHaveLength(3);
      for (const o of v.outcomes) {
        expect(o.label.split(/\s+/).length).toBeLessThanOrEqual(3);
        expect(OUTCOME_ICONS[o.icon]).toBeDefined();
      }
    }
  });

  it("draws an illustration for every question, decorative and hidden from screen readers", () => {
    for (const u of USE_CASES) {
      const out = html(createElement(QuestionIllustration, { id: u.id }));
      expect(out).toContain("<svg");
      expect(out).toContain('aria-hidden="true"');
    }
  });
});

describe("data item tiles", () => {
  it("give every readiness item a short label and an icon", () => {
    for (const c of CATEGORIES)
      for (const i of c.items) {
        expect(dataItemShort(i.key, i.name).split(/\s+/).length, i.key).toBeLessThanOrEqual(4);
        expect(dataItemIcon(i.key, c.id)).toBeDefined();
      }
  });
});

describe("primitives", () => {
  it("status chips carry a word, not colour alone", () => {
    expect(html(createElement(StatusChip, { status: "missing" }))).toContain("Needs data");
    expect(html(createElement(StatusChip, { status: "in", word: "Available" }))).toContain("Available");
  });
  it("progress ring states its value for screen readers and clamps it", () => {
    expect(html(createElement(ProgressRing, { value: 0.25, label: "Ready" }))).toContain('aria-label="Ready: 25%"');
    expect(html(createElement(ProgressRing, { value: 3, label: "Done" }))).toContain('aria-label="Done: 100%"');
  });
  it("metric tile shows the value and comparison", () => {
    const out = html(createElement(MetricTile, { label: "NRR", value: "109%", compare: "Peer median 104%", tone: "green" }));
    expect(out).toContain("109%");
    expect(out).toContain("Peer median 104%");
  });
  it("step strip shows the four steps with the price on Data", () => {
    const out = html(createElement(StepStrip, { price: "$149" }));
    for (const s of ["Snapshot", "Data", "Results", "Action plan", "$149"]) expect(out).toContain(s);
  });
});

describe("peer position chips", () => {
  it("colour above-median green and below-median amber, ranges neutral", () => {
    expect(positionTone("Between the median and the top quartile")).toBe("green");
    expect(positionTone("Above the top quartile")).toBe("green");
    expect(positionTone("Between the bottom quartile and the median")).toBe("amber");
    expect(positionTone("Below the bottom quartile")).toBe("amber");
    expect(positionTone("Your range spans below the bottom quartile to between the median and the top quartile; an exact figure would place you precisely")).toBe("neutral");
    expect(shortPosition("Between the median and the top quartile")).toBe("Above median");
    expect(shortPosition(null)).toBeNull();
  });
});

const analysis = (a: Partial<FileAnalysis>): FileAnalysis => ({ metrics: [], warnings: [], ...a });
const bridge = (customersStart: number, startArr: number) => ({ from: "2025-09", to: "2026-09", startArr, newArr: 100, expansionArr: 10, contractionArr: 5, churnedArr: 20, endArr: startArr + 85, customersStart, customersEnd: customersStart, customersNew: 1, customersChurned: 1 });

describe("chart data saved with a brief", () => {
  it("ignores one-customer bridges (an aggregate sheet) and keeps the one with most customers", () => {
    const c = chartsFromAnalyses([
      { filename: "board.xlsx", analysis: analysis({ bridge: bridge(1, 999) }) },
      { filename: "mrr.csv", analysis: analysis({ bridge: bridge(24, 676_632) }) },
      { filename: "older.csv", analysis: analysis({ bridge: bridge(10, 1) }) },
    ]);
    expect(c.bridge?.source).toBe("mrr.csv");
    expect(c.bridge?.customersStart).toBe(24);
  });

  it("keeps only segment rows with closed deals, and the grouping with the most per dimension", () => {
    const row = (name: string, won: number, lost: number) => ({ name, won, lost, open: 0, winRate: won + lost ? (won / (won + lost)) * 100 : null, avgWonAmount: won ? 1000 : null, medianCycleDays: null, smallSample: false });
    const c = chartsFromAnalyses([
      { filename: "a.xlsx", analysis: analysis({ segments: [{ dimension: "Segment", rows: [row("A", 0, 0), row("B", 0, 0)] }, { dimension: "Segment", rows: [row("A", 5, 5), row("B", 1, 9), row("C", 0, 0)] }] }) },
    ]);
    expect(c.segments).toHaveLength(1);
    expect(c.segments[0]!.rows.map((r) => r.name)).toEqual(["A", "B"]);
  });

  it("defaults to empty for briefs built before charts were saved", () => {
    expect(briefChartsSchema.parse({})).toEqual(EMPTY_CHARTS);
  });
});

describe("signature charts", () => {
  const baseline: BaselineRow[] = [];
  it("show Needs data tiles, never a placeholder chart, when the data isn't there", () => {
    const churn = html(createElement(SignatureCharts, { useCase: "growth_leak", charts: EMPTY_CHARTS, baseline }));
    expect(churn).toContain("Needs data");
    expect(churn).toContain('href="/data#item-revenue_by_customer"');
    expect(churn).not.toContain("recharts");
    const hiring = html(createElement(SignatureCharts, { useCase: "hire_or_fix", charts: EMPTY_CHARTS, baseline, dataPath: "/advisor/companies/x/data" }));
    expect(hiring).toContain('href="/advisor/companies/x/data#item-roster"');
    expect(hiring).toContain('href="/advisor/companies/x/data#item-opportunities"');
  });

  it("draw the ARR bridge from saved chart data, with its source", () => {
    const out = html(createElement(SignatureCharts, { useCase: "growth_leak", charts: { ...EMPTY_CHARTS, bridge: { ...bridge(24, 676_632), source: "mrr.csv" } }, baseline }));
    expect(out).toContain("ARR bridge");
    expect(out).toContain("mrr.csv");
    expect(out).not.toContain("Needs data");
  });
});
