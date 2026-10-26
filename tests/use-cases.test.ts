import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_ITEM_KEYS } from "@/lib/readiness";
import { isMetricKey } from "@/lib/metrics";
import { getUseCase, isUseCaseId, missingRequired, objectiveFields, parseAnswer, parseProfileFieldId, recommendedUseCases, targetSummary, USE_CASE_IDS, USE_CASES } from "@/lib/use-cases";
import { advisoryBookingUrl, formatPrice, pricing, sellableUseCases } from "@/lib/pricing";
import { assessmentHistory } from "@/lib/use-cases/history";
import { questionnaire } from "@/lib/use-cases/questionnaire";
import { resultConfidence } from "@/lib/use-cases/results";
import { growthSnapshot } from "@/lib/use-cases/snapshot";
import { journeyStage, nextAction, stepStates } from "@/lib/use-cases/steps";
import { baselineReadiness } from "@/lib/use-cases/readiness";

describe("use case registry", () => {
  it("has the six use cases from HANDOFF §13.3, in order, with stable ids", () => {
    expect(USE_CASES.map((u) => u.id)).toEqual(["growth_leak", "series_a_ready", "series_b_ready", "hire_or_fix", "winning_icp", "founder_handoff"]);
    expect(USE_CASE_IDS).toHaveLength(6);
    expect(getUseCase("nope")).toBeUndefined();
    expect(getUseCase("__proto__")).toBeUndefined();
  });

  it.each(USE_CASES.map((u) => [u.id, u] as const))("%s uses real readiness items and metrics", (_id, u) => {
    const items = [...u.requiredItems, ...u.helpfulItems, ...u.optionalItems];
    for (const k of items) expect(ALL_ITEM_KEYS, k).toContain(k);
    expect(new Set(items).size).toBe(items.length);
    expect(u.requiredItems.length).toBeGreaterThan(0);
    for (const m of [...u.figures, ...u.trackableMetrics]) expect(isMetricKey(m), m).toBe(true);
    for (const m of u.trackableMetrics) expect(u.figures).toContain(m);
    expect(u.objectiveQuestions.length).toBeGreaterThanOrEqual(1);
    expect(u.objectiveQuestions.length).toBeLessThanOrEqual(4);
    const ids = objectiveFields(u).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches the required items in the spec table", () => {
    expect(getUseCase("growth_leak")!.requiredItems).toEqual(["monthly_revenue", "revenue_by_customer", "churned_revenue"]);
    expect(getUseCase("founder_handoff")!.requiredItems).toEqual(["opportunities", "win_loss", "founder_dependencies"]);
  });
});

describe("recommendation", () => {
  it("recommends Series A readiness and Growth Leak to early companies, Growth Leak otherwise", () => {
    expect(recommendedUseCases({ stage: "Seed", revenueBand: null })).toEqual(["series_a_ready", "growth_leak"]);
    expect(recommendedUseCases({ stage: "Series B+", revenueBand: "1m_3m" })).toEqual(["series_a_ready", "growth_leak"]);
    expect(recommendedUseCases({ stage: "Series A", revenueBand: "3m_10m" })).toEqual(["growth_leak"]);
    expect(recommendedUseCases({ stage: null, revenueBand: null })).toEqual(["growth_leak"]);
  });
});

describe("objective form", () => {
  const leak = getUseCase("growth_leak")!;
  it("keeps the questionnaire light: only the challenge is required, goal and context are optional", () => {
    const fields = objectiveFields(leak);
    expect(fields.filter((f) => f.required).map((f) => f.id)).toEqual(["goal"]);
    expect(fields.find((f) => f.id === "main_metric")!.options!.map((o) => o.value)).toEqual([...leak.figures]);
    expect(fields.at(-1)!).toMatchObject({ id: "suspected_leak", group: "challenge" });
  });

  it("asks only for profile answers we don't have, and requires stage and sales model", () => {
    const empty = questionnaire(leak, {});
    expect(empty.fields.filter((f) => f.group === "company").map((f) => f.id)).toEqual([
      "profile.company.stage",
      "profile.gtm.model",
      "profile.company.arr",
      "profile.company.growth",
      "profile.customers.nrr",
      "profile.customers.gross_retention",
    ]);
    expect(empty.fields.filter((f) => f.required).map((f) => f.id)).toEqual(["goal", "profile.company.stage", "profile.gtm.model"]);
    const known = questionnaire(leak, { "company.stage": "Seed", "gtm.model": "Founder-led", "company.arr": 2_000_000 });
    expect(known.fields.filter((f) => f.group === "company").map((f) => f.id)).toEqual(["profile.company.growth", "profile.customers.nrr", "profile.customers.gross_retention"]);
    expect(known.known).toEqual([
      { label: "Stage", value: "Seed" },
      { label: "Sales model", value: "Founder-led" },
      { label: "ARR ($)", value: "2,000,000" },
    ]);
    expect(parseProfileFieldId("profile.company.stage")).toEqual({ section: "company", field: "stage" });
    expect(parseProfileFieldId("goal")).toBeNull();
  });

  it("normalises and validates answers", () => {
    const field = (id: string) => objectiveFields(leak).find((f) => f.id === id)!;
    expect(parseAnswer(field("target_value"), " $1,250,000 ")).toBe("1250000");
    expect(parseAnswer(field("target_value"), "")).toBe("");
    expect(() => parseAnswer(field("target_value"), "a lot")).toThrow();
    expect(parseAnswer(field("target_date"), "2027-06-30")).toBe("2027-06-30");
    expect(() => parseAnswer(field("target_date"), "next year")).toThrow();
    expect(() => parseAnswer(field("main_metric"), "burn_multiple")).toThrow(); // not a Growth Leak figure
    expect(() => parseAnswer(field("goal"), "x".repeat(4001))).toThrow();
  });

  it("lists required answers still missing and summarises the founder's target", () => {
    expect(missingRequired(leak, null)).toEqual(["goal", "profile.company.stage", "profile.gtm.model"]);
    expect(missingRequired(leak, { goal: "Grow" }, { "company.stage": "Seed", "gtm.model": "Hybrid" })).toEqual([]);
    const objective = { goal: "Grow", main_metric: "arr", target_value: "5000000", target_date: "2027-06-30" };
    expect(targetSummary(objective)).toBe("ARR $5M by 2027-06-30");
    expect(targetSummary({ main_metric: "arr" })).toBeNull();
    expect(targetSummary({ main_metric: "toString", target_value: "1" })).toBeNull();
  });
});

describe("Growth Snapshot", () => {
  const snap = (id: string, profile: Record<string, string | number>, objective: Record<string, string> = {}, dataStatus: Record<string, "available" | "missing"> = {}) =>
    growthSnapshot({ useCase: getUseCase(id)!, objective, profile, dataStatus }, new Date("2026-10-26T00:00:00Z"));

  it("only quotes the founder's own answers, labels every signal with its basis, and never cites peers", () => {
    for (const u of USE_CASES) {
      const s = snap(u.id, { "company.stage": "Seed", "gtm.model": "Founder-led", "company.growth": 40, "customers.nrr": 95, "customers.gross_retention": 88, "gtm.sales_reps": 2, "customers.sales_cycle": 60, "customers.acv": 30000, "customers.count": 12 }, { raise_close_date: "2027-04-30", raise_amount: "10000000", hiring_budget: "300000", founder_deal_share: "80%" });
      expect(s.signals.length, u.id).toBeGreaterThan(0);
      for (const sig of s.signals) {
        expect(sig.basis, `${u.id}: ${sig.title}`).toBeTruthy();
        expect(`${sig.title} ${sig.detail}`, u.id).not.toMatch(/benchmark|median|top quartile|peers?\b|typical|industry average/i);
      }
    }
  });

  it("flags shrinking retention for Growth Leak and points to new business when retention is healthy", () => {
    expect(snap("growth_leak", { "customers.nrr": 94 }).signals[0]).toMatchObject({ kind: "watch", title: "Your existing customers shrink on net", basis: "Your answer: NRR 94%" });
    const healthy = snap("growth_leak", { "customers.nrr": 112, "company.growth": 30 });
    expect(healthy.signals.map((s) => s.title)).toContain("If there's a leak, it's more likely in new business");
  });

  it("does simple arithmetic on the founder's numbers, nothing more", () => {
    expect(snap("hire_or_fix", { "gtm.sales_reps": 3, "customers.acv": 40000 }, { hiring_budget: "300000" }).signals.map((s) => s.title)).toContain(
      "Your hiring budget equals about 8 deals at your ACV",
    );
    expect(snap("series_a_ready", { "company.arr": 2_000_000, "company.stage": "Seed" }, { raise_amount: "10000000", raise_close_date: "2027-04-26" }).signals.map((s) => s.title)).toEqual(
      expect.arrayContaining(["You're raising about 5× your current ARR", "About 6 months until your target close"]),
    );
  });

  it("suggests a better-fitting assessment when the answers point elsewhere", () => {
    expect(snap("series_a_ready", { "company.stage": "Series A" }).fit).toMatchObject({ good: false, suggested: "series_b_ready" });
    expect(snap("series_b_ready", { "company.stage": "Seed" }).fit).toMatchObject({ good: false, suggested: "series_a_ready" });
    expect(snap("hire_or_fix", { "gtm.sales_reps": 0 }).fit).toMatchObject({ good: false, suggested: "founder_handoff" });
    expect(snap("growth_leak", {}).fit.good).toBe(true);
  });

  it("says plainly when there's nothing to go on, and which data would confirm it", () => {
    const s = snap("growth_leak", {}, {}, { monthly_revenue: "available" });
    expect(s.answersOnly).toBe(true);
    expect(s.signals[0]!.title).toBe("Not enough to go on yet");
    expect(s.dataNeeded).toEqual([
      { key: "monthly_revenue", have: true },
      { key: "revenue_by_customer", have: false },
      { key: "churned_revenue", have: false },
    ]);
  });
});

describe("pricing", () => {
  it("defaults to $499 assessments, $750 advisory and a reserved, unavailable $299 subscription", () => {
    expect(pricing()).toEqual({ assessmentCents: 49_900, advisoryFromCents: 75_000, subscriptionMonthlyCents: 29_900, subscriptionAvailable: false });
    expect(formatPrice(49_900)).toBe("$499");
    expect(formatPrice(75_000)).toBe("$750");
    expect(formatPrice(1_250)).toBe("$12.50");
  });

  it("reads prices, the booking link and sellable assessments from configuration", () => {
    const env = { ...process.env };
    try {
      Object.assign(process.env, { ASSESSMENT_PRICE_CENTS: "59900", ADVISORY_PRICE_CENTS: "nonsense", ADVISORY_BOOKING_URL: "http://insecure.test", SELLABLE_USE_CASES: "growth_leak, winning_icp, made_up" });
      expect(pricing().assessmentCents).toBe(59_900);
      expect(pricing().advisoryFromCents).toBe(75_000);
      expect(advisoryBookingUrl()).toBeNull();
      expect(sellableUseCases()).toEqual(["growth_leak", "winning_icp"]);
      process.env.ADVISORY_BOOKING_URL = "https://calendly.com/growthgoaled/session";
      expect(advisoryBookingUrl()).toBe("https://calendly.com/growthgoaled/session");
      delete process.env.SELLABLE_USE_CASES;
      expect(sellableUseCases()).toEqual(["growth_leak"]);
    } finally {
      process.env = env;
    }
  });
});

describe("results confidence", () => {
  it("is high only for reviewed results with no unconfirmed figures or gaps", () => {
    expect(resultConfidence({ reviewed: true, unconfirmed: 0, gaps: 0, metrics: 4 }).level).toBe("High");
    expect(resultConfidence({ reviewed: true, unconfirmed: 1, gaps: 0, metrics: 4 }).level).toBe("Medium");
    expect(resultConfidence({ reviewed: false, unconfirmed: 0, gaps: 0, metrics: 4 }).level).toBe("Medium");
    const low = resultConfidence({ reviewed: false, unconfirmed: 2, gaps: 3, metrics: 2 });
    expect(low.level).toBe("Low");
    expect(low.reasons).toEqual([
      "Built automatically and checked in code; not yet reviewed by an analyst.",
      "2 figures were read from your files and not yet confirmed by you.",
      "3 inputs are still missing (listed under next steps).",
      "Based on 2 metrics; more data would broaden it.",
    ]);
  });
});

describe("assessment history", () => {
  const d = (s: string) => new Date(s);
  it("shows purchase and assessment status per use case, newest first, linking results only when bought", () => {
    const rows = [
      { useCase: "growth_leak", status: "active" as const, activatedAt: d("2026-10-02"), activation: "paid" as const, createdAt: d("2026-10-01") },
      { useCase: "winning_icp", status: "objective" as const, activatedAt: null, activation: null, createdAt: d("2026-10-05") },
      { useCase: "hire_or_fix", status: "objective" as const, activatedAt: null, activation: null, createdAt: d("2026-10-03") },
      { useCase: "series_a_ready", status: "active" as const, activatedAt: d("2026-10-04"), activation: "advisor" as const, createdAt: d("2026-10-04") },
      { useCase: "not_real", status: "objective" as const, activatedAt: null, activation: null, createdAt: d("2026-10-06") },
    ];
    const payments = [
      { useCase: "winning_icp", status: "expired" as const, createdAt: d("2026-10-05") },
      { useCase: "hire_or_fix", status: "pending" as const, createdAt: d("2026-10-03") },
    ];
    const h = assessmentHistory(rows, payments, { growth_leak: d("2026-10-10") }, [], isUseCaseId);
    expect(h.map((e) => [e.useCase, e.purchase, e.assessment])).toEqual([
      ["winning_icp", "Payment didn't complete", "Snapshot only"],
      ["series_a_ready", "Granted by your advisor", "Collecting data"],
      ["hire_or_fix", "Payment pending", "Snapshot only"],
      ["growth_leak", "Purchased", "Complete"],
    ]);
    expect(h.find((e) => e.useCase === "growth_leak")).toMatchObject({ completedAt: d("2026-10-10"), href: "/assessments/open?use_case=growth_leak" });
    expect(h.find((e) => e.useCase === "winning_icp")!.href).toBe("/library/winning_icp/snapshot");
    expect(assessmentHistory([{ ...rows[0]!, activatedAt: d("2026-10-02") }], [], {}, ["growth_leak"], isUseCaseId)[0]!.assessment).toBe("Preliminary results");
  });
});

describe("five steps", () => {
  it("locks Data and Baseline until a use case is active, and Progress until the baseline is approved", () => {
    const none = stepStates(null);
    expect(none.map((s) => s.label)).toEqual(["Overview", "Use Case Library", "Data", "Results", "Progress & Tracking"]);
    expect(none.filter((s) => s.locked).map((s) => s.key)).toEqual(["data", "baseline", "progress"]);
    expect(none.find((s) => s.key === "data")!.lockedReason).toBe("Unlocks when you buy an assessment");
    expect(none.find((s) => s.key === "baseline")!.label).toBe("Results");
    expect(none.find((s) => s.current)!.key).toBe("library");

    const active = stepStates({ useCase: "growth_leak", status: "active" });
    expect(active.filter((s) => s.locked).map((s) => s.key)).toEqual(["progress"]);
    expect(active.find((s) => s.key === "progress")!.lockedReason).toBe("Unlocks when your results are approved");
    expect(active.find((s) => s.current)!.key).toBe("data");
    expect(active.find((s) => s.key === "library")!.done).toBe(true);

    const tracking = stepStates({ useCase: "growth_leak", status: "tracking" });
    expect(tracking.some((s) => s.locked)).toBe(false);
    expect(tracking.find((s) => s.current)!.key).toBe("progress");
  });

  it("points Overview's button at the next action", () => {
    expect(journeyStage(null)).toBe(0);
    expect(nextAction(null, null)).toEqual({ label: "Pick a question to answer", path: "/library" });
    expect(nextAction(null, "winning_icp")).toEqual({ label: "See your free Snapshot", path: "/library/winning_icp/snapshot" });
    expect(nextAction({ useCase: "growth_leak", status: "active" }, null)).toEqual({ label: "Connect your data", path: "/data" });
    expect(nextAction({ useCase: "growth_leak", status: "baseline_in_review" }, null).path).toBe("/baseline");
  });
});

describe("migration 0010", () => {
  it("turns existing paid benchmark unlocks into an active Growth Leak use case", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    const dir = path.join(process.cwd(), "drizzle");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const run = async (f: string) => {
      for (const stmt of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    };
    for (const f of files.filter((f) => f < "0010")) await run(f);
    await pg.exec(`INSERT INTO companies (id, name, benchmark_unlocked_at) VALUES
      ('00000000-0000-0000-0000-000000000001', 'Paid', '2026-10-20T10:00:00Z'),
      ('00000000-0000-0000-0000-000000000002', 'Unpaid', NULL)`);
    await pg.exec(`INSERT INTO payments (company_id, purpose, stripe_session_id, amount_cents, currency, status)
      VALUES ('00000000-0000-0000-0000-000000000001', 'benchmark_unlock', 'cs_1', 100, 'usd', 'paid')`);
    await run(files.find((f) => f.startsWith("0010"))!);
    const { rows } = await pg.query<{ company_id: string; use_case: string; status: string; activation: string }>("SELECT company_id, use_case, status, activation FROM company_use_cases");
    expect(rows).toEqual([{ company_id: "00000000-0000-0000-0000-000000000001", use_case: "growth_leak", status: "active", activation: "paid" }]);
    const pay = await pg.query<{ use_case: string }>("SELECT use_case FROM payments");
    expect(pay.rows[0]!.use_case).toBe("growth_leak");
  }, 60_000);
});

describe("Data step", () => {
  it.each(USE_CASES.map((u) => [u.id, u] as const))("%s explains why each required and helpful item matters", (_id, u) => {
    for (const k of [...u.requiredItems, ...u.helpfulItems]) expect(u.itemWhy[k], k).toBeTruthy();
    for (const k of Object.keys(u.itemWhy)) expect([...u.requiredItems, ...u.helpfulItems, ...u.optionalItems], k).toContain(k);
    expect(Object.values(u.itemWhy).join(" ")).not.toMatch(/benchmark/i);
  });

  it("baseline readiness counts required items in and is ready only when all are", () => {
    const leak = getUseCase("growth_leak")!;
    expect(baselineReadiness(leak, {})).toMatchObject({ done: 0, total: 3, percent: 0, ready: false, outstanding: ["monthly_revenue", "revenue_by_customer", "churned_revenue"] });
    const some = baselineReadiness(leak, { monthly_revenue: "available", revenue_by_customer: "missing", grr_nrr: "available" });
    expect(some).toMatchObject({ done: 1, percent: 33, ready: false, outstanding: ["revenue_by_customer", "churned_revenue"] });
    expect(baselineReadiness(leak, { monthly_revenue: "available", revenue_by_customer: "partial", churned_revenue: "not_applicable" })).toMatchObject({ done: 3, ready: true });
    // Everything "not applicable" isn't something we can build from.
    expect(baselineReadiness(leak, { monthly_revenue: "not_applicable", revenue_by_customer: "not_applicable", churned_revenue: "not_applicable" }).ready).toBe(false);
  });
});
