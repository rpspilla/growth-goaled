import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mergeSuggestions, suggestFromColumns, suggestFromFilename } from "@/lib/sorting";
import { sheetPreview } from "@/lib/ai/classify";
import { contentTypeFor, handlingFor } from "@/lib/documents";

describe("suggestions from columns", () => {
  it("matches sheets whose columns cover an item, naming the sheet in multi-sheet files", () => {
    const s = suggestFromColumns({
      sheets: [
        { name: "P&L", rows: 12, columns: ["Month", "Revenue", "COGS", "Opex"] },
        { name: "Notes", rows: 3, columns: ["Comment"] },
      ],
      dateRange: null,
    });
    expect(s.map((x) => x.itemKey)).toContain("monthly_revenue");
    expect(s.find((x) => x.itemKey === "monthly_revenue")).toMatchObject({ sheet: "P&L", source: "columns", confidence: "medium" });
    expect(s.every((x) => x.sheet === "P&L")).toBe(true);
  });
  it("returns nothing without a profile", () => expect(suggestFromColumns(null)).toEqual([]));
});

describe("suggestions from file names", () => {
  it("guesses low-confidence items from common names", () => {
    expect(suggestFromFilename("Q3_board_deck.pptx").map((s) => s.itemKey)).toEqual(["targets"]);
    expect(suggestFromFilename("hubspot-pipeline-export.xls").map((s) => s.itemKey)).toEqual(["opportunities"]);
    expect(suggestFromFilename("IMG_0042.heic")).toEqual([]);
    expect(suggestFromFilename("P&L 2025.xls")[0]).toMatchObject({ confidence: "low", source: "filename" });
  });
});

describe("mergeSuggestions", () => {
  it("keeps one per item and sheet, and raises confidence when columns and the model agree", () => {
    const col = { itemKey: "monthly_revenue", sheet: "P&L", confidence: "medium" as const, reason: "columns", source: "columns" as const, status: "suggested" as const };
    const ai = { ...col, confidence: "medium" as const, reason: "model", source: "ai" as const };
    const merged = mergeSuggestions([col], [ai, { ...ai, itemKey: "not_a_real_item" }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ confidence: "high", reason: "columns; model" });
  });
});

describe("classifier input", () => {
  it("previews only the first rows and columns of each sheet", () => {
    const rows = Array.from({ length: 500 }, (_, r) => Array.from({ length: 60 }, (_, c) => `r${r}c${c}`));
    const preview = sheetPreview([{ name: "Everything", rows }]);
    expect(preview).toContain('Sheet "Everything" (500 rows)');
    expect(preview).toContain("r7c29");
    expect(preview).not.toContain("r8c0");
    expect(preview).not.toContain("c30");
  });
});

describe("file handling", () => {
  it("reads known formats and stores the rest", () => {
    expect(handlingFor("image/png")).toBe("image");
    expect(handlingFor(contentTypeFor("deck.pptx", ""))).toBe("stored");
    expect(contentTypeFor("photo.JPG", "")).toBe("image/jpeg");
    expect(contentTypeFor("weird.bin", "")).toBe("application/octet-stream");
  });
});
