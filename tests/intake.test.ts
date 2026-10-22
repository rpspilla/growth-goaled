import { describe, expect, it } from "vitest";
import {
  answerKey,
  displayValue,
  firstIncompleteSection,
  getField,
  INTAKE_SECTIONS,
  parseFieldValue,
  percentComplete,
  sectionComplete,
  type IntakeAnswers,
} from "@/lib/intake";
import { isMetricKey } from "@/lib/metrics";

const f = (section: string, field: string) => getField(section, field)!;

describe("parseFieldValue", () => {
  it("reads currency in common formats", () => {
    expect(parseFieldValue(f("company", "arr"), "4,200,000")).toEqual({ ok: true, value: 4_200_000 });
    expect(parseFieldValue(f("company", "arr"), "$4.2M")).toEqual({ ok: true, value: 4_200_000 });
    expect(parseFieldValue(f("customers", "acv"), "42k")).toEqual({ ok: true, value: 42_000 });
  });

  it("reads percentages and whole numbers", () => {
    expect(parseFieldValue(f("company", "growth"), "72%")).toEqual({ ok: true, value: 72 });
    expect(parseFieldValue(f("customers", "count"), "87")).toEqual({ ok: true, value: 87 });
    expect(parseFieldValue(f("customers", "count"), "8.5").ok).toBe(false);
    expect(parseFieldValue(f("company", "growth"), "5000").ok).toBe(false);
  });

  it("rejects junk and validates selects", () => {
    expect(parseFieldValue(f("company", "arr"), "about four million").ok).toBe(false);
    expect(parseFieldValue(f("company", "stage"), "Series A")).toEqual({ ok: true, value: "Series A" });
    expect(parseFieldValue(f("company", "stage"), "IPO").ok).toBe(false);
  });

  it("treats blank input as clearing the answer", () => {
    expect(parseFieldValue(f("company", "arr"), "  ")).toEqual({ ok: true, value: null });
  });
});

describe("completion", () => {
  const all: IntakeAnswers = {};
  for (const s of INTAKE_SECTIONS) for (const field of s.fields) if (field.required) all[answerKey(s.id, field.id)] = field.options?.[0] ?? 1;

  it("is 0% empty and 100% with every required field", () => {
    expect(percentComplete({})).toBe(0);
    expect(percentComplete(all)).toBe(100);
    expect(firstIncompleteSection(all)).toBeNull();
  });

  it("ignores optional fields and finds the first gap", () => {
    const partial = { ...all, [answerKey("gtm", "channels")]: "" };
    expect(sectionComplete(INTAKE_SECTIONS.find((s) => s.id === "gtm")!, partial)).toBe(false);
    expect(firstIncompleteSection(partial)).toBe("gtm");
    expect(percentComplete(partial)).toBeLessThan(100);
  });
});

describe("intake config", () => {
  it("maps metric fields to dictionary metrics and numeric kinds", () => {
    for (const s of INTAKE_SECTIONS) {
      for (const field of s.fields) {
        if (field.metric) {
          expect(isMetricKey(field.metric)).toBe(true);
          expect(["currency", "percent", "integer"]).toContain(field.kind);
        }
      }
    }
  });

  it("formats currency for display", () => {
    expect(displayValue(f("company", "arr"), 4_200_000)).toBe("4,200,000");
    expect(displayValue(f("company", "arr"), null)).toBe("");
  });
});
