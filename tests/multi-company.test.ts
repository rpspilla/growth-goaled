import { describe, expect, it } from "vitest";
import { canAddCompanies, canSwitchToAdvisor } from "@/lib/multi-company";

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

  it("lets only founders listed in SELF_ADVISOR_EMAILS switch to the advisor view", () => {
    const env = "jwinn1599@gmail.com";
    expect(canSwitchToAdvisor("JWinn1599@gmail.com", env)).toBe(true);
    expect(canSwitchToAdvisor("someone@else.com", env)).toBe(false);
    expect(canSwitchToAdvisor("jwinn1599@gmail.com", undefined)).toBe(false);
  });
});
