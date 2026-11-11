import { describe, expect, it } from "vitest";
import { domainOf, followUpBucket, mapImportRows, matchCategory, matchSource, normalizeEmail } from "@/lib/crm";
import { parseCsv } from "@/lib/file-profile";

describe("crm rules", () => {
  it("normalises emails and website domains", () => {
    expect(normalizeEmail(" Sam@Acme.COM ")).toBe("sam@acme.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(domainOf("https://www.Acme.com/about")).toBe("acme.com");
    expect(domainOf("acme")).toBeNull();
  });

  it("buckets follow-ups by due date", () => {
    expect(followUpBucket("2026-11-10", "2026-11-11")).toBe("overdue");
    expect(followUpBucket("2026-11-11", "2026-11-11")).toBe("today");
    expect(followUpBucket("2026-11-18", "2026-11-11")).toBe("upcoming");
    expect(followUpBucket("2026-11-19", "2026-11-11")).toBe("later");
    expect(followUpBucket(null, "2026-11-11")).toBe("none");
  });

  it("maps CSV columns by their headers, splits a Name column, and skips rows with no name or email", () => {
    const csv = `Name,E-mail,Company,Job Title,LinkedIn,Category,Lead Source
"Ada Lovelace",ADA@calc.io,Calc,CEO,https://linkedin.com/in/ada,Seed,Referral
,,Nobody Co,,,,
Grace,grace@navy.mil,Navy,,,,`;
    const r = mapImportRows(parseCsv(csv));
    expect(r.skipped).toBe(1);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ firstName: "Ada", lastName: "Lovelace", email: "ada@calc.io", company: "Calc", jobTitle: "CEO", linkedinUrl: "https://linkedin.com/in/ada", category: "Seed", source: "Referral" });
    expect(r.rows[1]).toMatchObject({ firstName: "Grace", lastName: null, email: "grace@navy.mil" });
  });

  it("matches categories and sources typed in imports", () => {
    expect(matchCategory("Seed")).toEqual({ category: "Founder", subcategory: "Seed" });
    expect(matchCategory("investors")).toEqual({ category: "Investor", subcategory: null });
    expect(matchCategory("VC partner")).toEqual({ category: "Investor", subcategory: null });
    expect(matchCategory("fractional cro")).toEqual({ category: "Advisor", subcategory: "Fractional CRO" });
    expect(matchCategory("plumber")).toBeNull();
    expect(matchSource("linkedin")).toBe("LinkedIn");
    expect(matchSource("conference booth")).toBe("Other");
    expect(matchSource("")).toBeNull();
  });
});
