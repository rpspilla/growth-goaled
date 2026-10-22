import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { extractionSchema } = await import("@/lib/ai/extract");

describe("extraction schema", () => {
  const point = { metric: "arr", value: 4_200_000, period: "Q3 2026", page: 3, raw_text: "ARR $4.2M", confidence: "high", inferred: false };

  it("accepts dictionary metrics", () => {
    expect(extractionSchema.safeParse({ data_points: [point] }).success).toBe(true);
  });

  it("rejects metrics outside the dictionary and bad confidence", () => {
    expect(extractionSchema.safeParse({ data_points: [{ ...point, metric: "revenue_per_employee" }] }).success).toBe(false);
    expect(extractionSchema.safeParse({ data_points: [{ ...point, confidence: "certain" }] }).success).toBe(false);
  });
});
