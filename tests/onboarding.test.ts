import { describe, expect, it } from "vitest";
import { founderOnboardingSchema, needsOnboarding, staffProfileSchema } from "@/lib/onboarding";

const valid = { name: "Sam Ahmed", title: "CEO", companyName: "Acme AI", revenueBand: "3m_10m", foundedYear: "2020", vertical: "Fintech", stage: "Seed", aes: "4", bdrs: "", cs: "1" };

describe("founderOnboardingSchema", () => {
  it("accepts the six company basics, with headcounts as numbers and blank optional ones as null", () => {
    const parsed = founderOnboardingSchema.parse(valid);
    expect(parsed).toMatchObject({ companyName: "Acme AI", foundedYear: "2020", vertical: "Fintech", stage: "Seed", aes: 4, bdrs: null, cs: 1, verticalOther: null });
  });

  it("accepts Bootstrapped and 0 account executives", () => {
    expect(founderOnboardingSchema.parse({ ...valid, stage: "Bootstrapped", aes: "0" })).toMatchObject({ stage: "Bootstrapped", aes: 0 });
  });

  it("doesn't offer B2B SaaS as a vertical, and needs a name for Other", () => {
    expect(founderOnboardingSchema.safeParse({ ...valid, vertical: "B2B SaaS" }).success).toBe(false);
    const other = founderOnboardingSchema.safeParse({ ...valid, vertical: "Other", verticalOther: " " });
    expect(other.error?.issues.map((i) => i.path[0])).toEqual(["verticalOther"]);
    expect(founderOnboardingSchema.parse({ ...valid, vertical: "Other", verticalOther: "Insurance" }).verticalOther).toBe("Insurance");
  });

  it("rejects bad input with a field-specific message", () => {
    const r = founderOnboardingSchema.safeParse({ ...valid, title: " ", companyName: " ", revenueBand: "100m_plus", stage: "IPO", cs: "2.5" });
    expect(r.success).toBe(false);
    const fields = r.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["title", "companyName", "revenueBand", "stage", "cs"]));
  });

  it("needs only name, role, company and vertical (Nov 25, 2026): stage, revenue, year and team are optional", () => {
    const parsed = founderOnboardingSchema.parse({ name: "Sam", title: "CEO", companyName: "Acme", vertical: "Fintech", revenueBand: "", foundedYear: "", stage: "", aes: "", bdrs: "", cs: "" });
    expect(parsed).toMatchObject({ revenueBand: null, foundedYear: null, stage: null, aes: null, challenge: null });
  });
});

describe("staffProfileSchema", () => {
  it("requires name and title only", () => {
    expect(staffProfileSchema.safeParse({ name: "Jamie", title: "Lead Advisor" }).success).toBe(true);
    expect(staffProfileSchema.safeParse({ name: "Jamie", title: "" }).success).toBe(false);
  });
});

describe("needsOnboarding", () => {
  it("is true until the form is completed", () => {
    expect(needsOnboarding({ onboardedAt: null })).toBe(true);
    expect(needsOnboarding({ onboardedAt: new Date() })).toBe(false);
  });
});
