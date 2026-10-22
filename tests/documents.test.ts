import { describe, expect, it } from "vitest";
import { contentTypeFor, findConflicts, relativeDifference, samePeriod, unsupportedReason } from "@/lib/documents";

const p = (id: string, metric: string, value: number, period: string | null = null) => ({ id, metric, value, period });

describe("conflict detection", () => {
  it("flags the same metric and period more than 10% apart", () => {
    const intake = [p("i1", "sales_cycle_days", 94, "Current")];
    const fromDeck = [p("d1", "sales_cycle_days", 62, "Q2 2026")];
    const conflicts = findConflicts(fromDeck, intake);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.other.id).toBe("i1");
  });

  it("ignores small differences, other metrics and other periods", () => {
    expect(findConflicts([p("d1", "arr", 4_300_000, "Q3 2026")], [p("i1", "arr", 4_200_000, "Current")])).toHaveLength(0);
    expect(findConflicts([p("d1", "arr", 1_000_000)], [p("i1", "nrr", 108)])).toHaveLength(0);
    expect(findConflicts([p("d1", "arr", 3_000_000, "FY2024")], [p("d2", "arr", 4_200_000, "FY2025")])).toHaveLength(0);
  });

  it("treats missing or 'Current' periods as matching", () => {
    expect(samePeriod(null, "Q3 2026")).toBe(true);
    expect(samePeriod("Current", "FY2025")).toBe(true);
    expect(samePeriod("q3 2026", "Q3 2026 ")).toBe(true);
    expect(samePeriod("Q2 2026", "Q3 2026")).toBe(false);
  });

  it("measures difference against the larger value", () => {
    expect(relativeDifference(90, 100)).toBeCloseTo(0.1);
    expect(relativeDifference(0, 0)).toBe(0);
  });
});

describe("file handling", () => {
  it("infers content type from the extension when the browser doesn't say", () => {
    expect(contentTypeFor("model.xlsx", "")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(contentTypeFor("deck.pdf", "application/octet-stream")).toBe("application/pdf");
    expect(contentTypeFor("data.csv", "text/csv")).toBe("text/csv");
  });

  it("explains unsupported formats", () => {
    expect(unsupportedReason("Board Deck.pptx")).toMatch(/PDF/);
    expect(unsupportedReason("old.xls")).toMatch(/xlsx/);
    expect(unsupportedReason("deck.pdf")).toBeNull();
  });
});
