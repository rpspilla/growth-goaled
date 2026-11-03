/** Typed answers to the sign-in chat's sign-up questions, read without buttons or dropdowns. */
import { describe, expect, it } from "vitest";
import { count, foundedYear, revenueBand, stage, understand, vertical } from "@/lib/guest/understand";
import { GUEST_STEPS, interpretAnswer } from "@/lib/guest/steps";
import { FOUNDING_YEARS } from "@/lib/intake";

const step = (key: string) => GUEST_STEPS.find((s) => s.key === key)!;
const now = Number(FOUNDING_YEARS[0]);

describe("typed sign-up answers", () => {
  it("revenue", () => {
    expect(revenueBand("pre-revenue")).toBe("lt_1m");
    expect(revenueBand("about 800k")).toBe("lt_1m");
    expect(revenueBand("under $1m")).toBe("lt_1m");
    expect(revenueBand("$2M ARR")).toBe("1m_3m");
    expect(revenueBand("1-3 million")).toBe("1m_3m");
    expect(revenueBand("2,500,000")).toBe("1m_3m");
    expect(revenueBand("about 4")).toBe("3m_10m");
    expect(revenueBand("$15M")).toBe("10m_20m");
    expect(revenueBand("40 million")).toBe("20m_50m");
    expect(revenueBand("a lot")).toBeNull();
  });
  it("founding year", () => {
    expect(foundedYear("founded in 2019")).toBe("2019");
    expect(foundedYear("last year")).toBe(String(now - 1));
    expect(foundedYear("3 years ago")).toBe(String(now - 3));
    expect(foundedYear("1975")).toBe("Before 1990");
    expect(foundedYear(String(now + 1))).toBeNull();
    expect(foundedYear("recently")).toBeNull();
  });
  it("stage", () => {
    expect(stage("we're bootstrapped")).toBe("Bootstrapped");
    expect(stage("pre seed")).toBe("Pre-seed");
    expect(stage("just closed our seed round")).toBe("Seed");
    expect(stage("series a")).toBe("Series A");
    expect(stage("Series C".toLowerCase())).toBe("Series B+");
    expect(stage("not sure")).toBeNull();
  });
  it("vertical: keywords, or their own words under Other", () => {
    expect(vertical("we sell payments software to banks")).toEqual({ vertical: "Fintech" });
    expect(vertical("cybersecurity")).toEqual({ vertical: "Security" });
    expect(vertical("HR tech")).toEqual({ vertical: "HR & workforce" });
    expect(vertical("Other")).toEqual({ vertical: "Other" });
    expect(vertical("pet care marketplace")).toEqual({ vertical: "Other", verticalOther: "pet care marketplace" });
    expect(vertical("?")).toBeNull();
  });
  it("counts", () => {
    expect(count("3")).toBe("3");
    expect(count("three")).toBe("3");
    expect(count("just me")).toBe("0");
    expect(count("none yet")).toBe("0");
    expect(count("we have 12 reps")).toBe("12");
    expect(count("lots")).toBeNull();
  });
  it("optional questions can be skipped in words; exact option labels still work", () => {
    expect(understand(step("bdrs"), "skip")).toEqual({ bdrs: "" });
    expect(understand(step("aes"), "skip")).toBeNull();
    expect(understand(step("revenueBand"), "$1M–$3M")).toEqual({ revenueBand: "1m_3m" });
  });
  it("answers are still checked by the sign-up rules, and unclear ones get a question back", () => {
    expect(interpretAnswer(step("aes"), "99999")).toEqual({ ok: false, reply: "Enter a whole number, e.g. 3." });
    expect(interpretAnswer(step("stage"), "hmm")).toMatchObject({ ok: false, reply: expect.stringMatching(/Which stage/) });
    expect(interpretAnswer(step("vertical"), "pet care")).toEqual({ ok: true, values: { vertical: "Other", verticalOther: "pet care" } });
  });
});
