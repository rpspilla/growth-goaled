import { describe, expect, it } from "vitest";
import { figureChoice, parseFigure, sameValue } from "@/lib/figures";

const c = (id: string, value: number, status: "accepted" | "proposed", source: string, at = "2026-10-20") => ({ id, value, status, source, period: null, rawText: null, updatedAt: new Date(at) });

describe("figure choices", () => {
  it("flags a conflict when the profile and a file disagree, and uses the confirmed value meanwhile", () => {
    const f = figureChoice("nrr", [c("file", 101, "proposed", "metrics.xlsx", "2026-10-25"), c("profile", 94, "accepted", "Your company profile")]);
    expect(f.state).toBe("conflict");
    expect(f.inUseId).toBe("profile");
    expect(f.candidates.map((x) => [x.source, x.formatted])).toEqual([["Your company profile", "94%"], ["metrics.xlsx", "101%"]]);
  });

  it("treats rounding differences as agreement, and knows unconfirmed and missing", () => {
    expect(figureChoice("arr", [c("a", 4_200_000, "accepted", "p"), c("b", 4_210_000, "proposed", "f")]).state).toBe("agreed");
    expect(figureChoice("arr", [c("b", 4_210_000, "proposed", "f")]).state).toBe("unconfirmed");
    expect(figureChoice("arr", [])).toMatchObject({ state: "missing", inUseId: null, unitHint: "in dollars" });
    expect(sameValue(94, 94.4)).toBe(true);
    expect(sameValue(94, 96)).toBe(false);
  });

  it("parses what founders type", () => {
    expect(parseFigure("$1.2M")).toBe(1_200_000);
    expect(parseFigure("4,200,000")).toBe(4_200_000);
    expect(parseFigure("94%")).toBe(94);
    expect(parseFigure("1.5x")).toBe(1.5);
    expect(parseFigure("120 days")).toBe(120);
    expect(parseFigure("about a million")).toBeNull();
    expect(parseFigure("")).toBeNull();
  });
});
