import { describe, expect, it } from "vitest";
import { founderOnboardingSchema, needsOnboarding, staffProfileSchema } from "@/lib/onboarding";

const valid = { name: "Sam Ahmed", title: "CEO", companyName: "Acme AI", website: "acme-ai.com", revenueBand: "3m_10m" };

describe("founderOnboardingSchema", () => {
  it("accepts company basics and normalises the website", () => {
    const parsed = founderOnboardingSchema.parse(valid);
    expect(parsed.website).toBe("https://acme-ai.com");
    expect(founderOnboardingSchema.parse({ ...valid, website: "https://www.acme.com/about" }).website).toBe("https://www.acme.com");
  });

  it("treats an empty website as missing", () => {
    expect(founderOnboardingSchema.parse({ ...valid, website: "  " }).website).toBeNull();
  });

  it("rejects bad input with a field-specific message", () => {
    const r = founderOnboardingSchema.safeParse({ ...valid, companyName: " ", website: "not a site", revenueBand: "100m_plus" });
    expect(r.success).toBe(false);
    const fields = r.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["companyName", "website", "revenueBand"]));
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
