import { describe, expect, it } from "vitest";
import { canViewCompany, canViewDeliverable, homePathFor, type Actor } from "@/lib/access";

const founder: Actor = { id: "u-founder", role: "founder" };
const advisor: Actor = { id: "u-advisor", role: "advisor" };
const otherAdvisor: Actor = { id: "u-advisor-2", role: "advisor" };
const admin: Actor = { id: "u-admin", role: "admin" };

const ownCompany = { id: "c-own", advisorId: "u-advisor" };
const otherCompany = { id: "c-other", advisorId: "u-advisor" };
const unassigned = { id: "c-unassigned", advisorId: null };

describe("canViewCompany", () => {
  it("founder sees only companies they belong to", () => {
    expect(canViewCompany(founder, ownCompany, ["c-own"])).toBe(true);
    expect(canViewCompany(founder, otherCompany, ["c-own"])).toBe(false);
    expect(canViewCompany(founder, unassigned, ["c-own"])).toBe(false);
  });

  it("advisor sees assigned companies and the unassigned queue only", () => {
    expect(canViewCompany(advisor, ownCompany, [])).toBe(true);
    expect(canViewCompany(advisor, unassigned, [])).toBe(true);
    expect(canViewCompany(otherAdvisor, ownCompany, [])).toBe(false);
  });

  it("advisor membership rows do not widen access", () => {
    expect(canViewCompany(otherAdvisor, ownCompany, ["c-own"])).toBe(false);
  });

  it("admin sees everything", () => {
    expect(canViewCompany(admin, ownCompany, [])).toBe(true);
    expect(canViewCompany(admin, unassigned, [])).toBe(true);
  });
});

describe("canViewDeliverable", () => {
  const statuses = ["drafting", "qa", "in_review", "changes_requested", "approved", "failed"];

  it("founder never sees an unpublished deliverable", () => {
    for (const status of statuses) expect(canViewDeliverable(founder, { status }, true)).toBe(false);
    expect(canViewDeliverable(founder, { status: "published" }, true)).toBe(true);
  });

  it("nobody sees a deliverable for a company they cannot access", () => {
    for (const actor of [founder, advisor, admin]) {
      expect(canViewDeliverable(actor, { status: "published" }, false)).toBe(false);
    }
  });

  it("staff see drafts for companies they can access", () => {
    for (const status of statuses) {
      expect(canViewDeliverable(advisor, { status }, true)).toBe(true);
      expect(canViewDeliverable(admin, { status }, true)).toBe(true);
    }
  });
});

describe("homePathFor", () => {
  it("routes founders and staff to different apps", () => {
    expect(homePathFor("founder")).toBe("/overview");
    expect(homePathFor("advisor")).toBe("/advisor/portfolio");
    expect(homePathFor("admin")).toBe("/advisor/portfolio");
  });
});
