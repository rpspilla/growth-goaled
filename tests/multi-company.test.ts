import { describe, expect, it } from "vitest";
import { canAddCompanies } from "@/lib/multi-company";

describe("multiple company profiles", () => {
  it("is allowed only for founders listed in MULTI_COMPANY_FOUNDERS, matched case-insensitively", () => {
    const env = " spillane.ryan@gmail.com , ops@example.com";
    expect(canAddCompanies("spillane.ryan@gmail.com", env)).toBe(true);
    expect(canAddCompanies("Spillane.Ryan@Gmail.com", env)).toBe(true);
    expect(canAddCompanies("ops@example.com", env)).toBe(true);
    expect(canAddCompanies("someone@else.com", env)).toBe(false);
    expect(canAddCompanies("spillane.ryan@gmail.com", undefined)).toBe(false);
    expect(canAddCompanies("spillane.ryan@gmail.com", "")).toBe(false);
    expect(canAddCompanies(null, env)).toBe(false);
  });
});
