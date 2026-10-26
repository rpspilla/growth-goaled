import { describe, expect, it } from "vitest";
import { diagnose } from "@/lib/diagnostics";
import { analysisTables, diagnosisInput } from "@/lib/diagnostics/evidence";
import { analyzeSheets } from "@/lib/metrics-engine";

const months = ["Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026"];
const row = (name: string, start: number, end: number) => [name, String(start), ...Array(11).fill(String(start)), String(end)];
const wide = {
  name: "MRR by customer",
  rows: [["Customer", ...months], row("Acme", 1000, 1500), row("Beta", 2000, 1600), row("Gamma", 500, 0), ["Delta", ...Array(12).fill(""), "800"]],
};

describe("evidence for the Draft Agent", () => {
  it("prints the ARR bridge and largest customers as readable tables", () => {
    const tables = analysisTables([{ filename: "mrr.xlsx", analysis: analyzeSheets([wide]) }]);
    expect(tables[0]).toEqual({
      id: "analysis:0",
      title: "ARR bridge, Sep 2025 – Sep 2026 (calculated from mrr.xlsx)",
      rows: ["Starting ARR $42K (3 customers)", "+ New $9.6K (1 customer)", "+ Expansion $6K", "− Contraction $4.8K", "− Churn $6K (1 customer)", "= Ending ARR $46.8K (3 customers)"],
    });
    expect(tables[1]!.title).toBe("Largest customers by ARR (calculated from mrr.xlsx)");
    expect(tables[1]!.rows[0]).toBe("Beta: $19.2K (41% of ARR)");
  });

  it("numbers each piece of evidence once and refers to it by id", () => {
    const a = analyzeSheets([wide]);
    const figures = a.metrics.map((m) => ({ metric: m.metric, value: m.value, period: m.period, origin: "calculated" as const, confirmed: false }));
    const dx = diagnosisInput(diagnose("growth_leak", figures, [a]));
    const ids = dx.evidence.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("ev:0");
    const top = dx.candidates[0]!;
    expect(top.id).toBe("retention");
    expect(top.arr_at_stake).toBe("$10.8K");
    for (const id of [...top.supporting, ...top.context]) expect(ids).toContain(id);
    expect(dx.evidence.find((e) => e.id === top.supporting[0])!.text).toMatch(/^NRR 88\.6% \(calculated/);
  });
});
