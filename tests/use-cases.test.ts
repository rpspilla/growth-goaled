import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_ITEM_KEYS } from "@/lib/readiness";
import { isMetricKey } from "@/lib/metrics";
import { answeredObjectiveFields, getUseCase, isUseCaseId, missingRequired, objectiveFields, parseAnswer, parseProfileFieldId, recommendedUseCases, targetSummary, USE_CASE_IDS, USE_CASES } from "@/lib/use-cases";
import { advisoryBookingUrl, advisoryHref, formatPrice, pricing, sellableUseCases } from "@/lib/pricing";
import { assessmentHistory } from "@/lib/use-cases/history";
import { questionnaire } from "@/lib/use-cases/questionnaire";
import { resultConfidence } from "@/lib/use-cases/results";
import { growthSnapshot } from "@/lib/use-cases/snapshot";
import { howWeWork } from "@/lib/use-cases/how-we-work";
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
  it("recommends Fix Churn, and never a coming-soon question", () => {
    expect(recommendedUseCases({ stage: "Seed", revenueBand: null })).toEqual(["growth_leak"]);
    expect(recommendedUseCases({ stage: "Series B+", revenueBand: "1m_3m" })).toEqual(["growth_leak"]);
    expect(recommendedUseCases({ stage: "Series A", revenueBand: "3m_10m" })).toEqual(["growth_leak"]);
    expect(recommendedUseCases({ stage: null, revenueBand: null })).toEqual(["growth_leak"]);
  });
});

describe("objective form", () => {
  const leak = getUseCase("growth_leak")!;
  it("keeps the questionnaire light: no free-text challenge, goal or context questions", () => {
    expect(objectiveFields(leak)).toEqual([]);
    for (const u of USE_CASES) {
      const ids = objectiveFields(u).map((f) => f.id);
      for (const retired of ["goal", "main_metric", "target_value", "target_date", "why_now", "already_tried", "constraints"]) expect(ids).not.toContain(retired);
    }
  });

  it("asks figures as ranges, adds employees everywhere, and skips what's on file", () => {
    const empty = questionnaire(leak, {});
    expect(empty.fields.filter((f) => f.group === "company").map((f) => f.id)).toEqual([
      "profile.company.stage",
      "profile.company.founded_year",
      "profile.gtm.model",
      "profile.company.arr_range",
      "profile.company.growth_range",
      "profile.customers.nrr_range",
      "profile.customers.gross_retention_range",
      "profile.company.industry",
      "profile.company.employees_range",
    ]);
    expect(empty.fields.find((f) => f.id === "profile.customers.gross_retention_range")).toMatchObject({ label: "Annual gross revenue churn", help: expect.stringMatching(/^The share of last year's recurring revenue you lost/) });
    expect(empty.fields.find((f) => f.id === "profile.customers.gross_retention_range")!.options!.map((o) => o.label)).toEqual(["Under 2%", "2–5%", "5–10%", "10–20%", "Over 20%"]);
    const year = empty.fields.find((f) => f.id === "profile.company.founded_year")!;
    expect(year).toMatchObject({ kind: "select", required: true });
    expect(year.options![0]!.value).toBe(String(new Date().getUTCFullYear()));
    expect(year.options!.at(-1)!.value).toBe("Before 1990");
    for (const f of empty.fields.filter((f) => f.id.endsWith("_range"))) {
      expect(f.kind).toBe("select");
      expect(f.help, f.id).toMatch(/\w{3,}.*\./); // every figure we ask for has a simple definition
    }
    expect(empty.fields.find((f) => f.id === "profile.company.employees_range")!.options!.map((o) => o.label)).toEqual(["1–5", "6–10", "11–25", "26–50", "50+"]);
    expect(empty.fields.filter((f) => f.required).map((f) => f.id)).toEqual(["profile.company.stage", "profile.company.founded_year", "profile.gtm.model"]);
    for (const u of USE_CASES) expect(questionnaire(u, {}).fields.map((f) => f.id)).toEqual(expect.arrayContaining(["profile.company.founded_year", "profile.company.industry", "profile.company.employees_range"]));
    // An exact figure or a range already given is listed, not asked again.
    const known = questionnaire(leak, { "company.stage": "Seed", "gtm.model": "Founder-led", "company.arr": 2_000_000, "company.growth_range": "25–50%" });
    expect(known.fields.filter((f) => f.group === "company").map((f) => f.id)).toEqual(["profile.company.founded_year", "profile.customers.nrr_range", "profile.customers.gross_retention_range", "profile.company.industry", "profile.company.employees_range"]);
    expect(known.known).toEqual([
      { label: "Stage", value: "Seed" },
      { label: "Sales model", value: "Founder-led" },
      { label: "ARR ($)", value: "2,000,000" },
      { label: "Year-over-year revenue growth", value: "25–50%" },
    ]);
    // Revenue given at onboarding isn't asked again.
    const banded = questionnaire(leak, {}, "3m_10m");
    expect(banded.fields.map((f) => f.id)).not.toContain("profile.company.arr_range");
    expect(banded.known).toEqual([{ label: "Annual revenue", value: "$3M–$10M" }]);
    expect(parseProfileFieldId("profile.company.arr_range")).toEqual({ section: "company", field: "arr_range" });
    expect(parseProfileFieldId("goal")).toBeNull();
  });

  it("normalises and validates answers", () => {
    const money = { id: "budget", label: "Budget", kind: "currency" as const };
    const when = { id: "when", label: "When", kind: "date" as const };
    expect(parseAnswer(money, " $1,250,000 ")).toBe("1250000");
    expect(parseAnswer(money, "")).toBe("");
    expect(() => parseAnswer(money, "a lot")).toThrow();
    expect(parseAnswer(when, "2027-06-30")).toBe("2027-06-30");
    expect(() => parseAnswer(when, "next year")).toThrow();
    // No use case asks its own questions now; earlier ones are still readable.
    for (const u of USE_CASES) expect(objectiveFields(u), u.id).toEqual([]);
    expect(answeredObjectiveFields(getUseCase("hire_or_fix")!).map((f) => f.id)).toEqual(expect.arrayContaining(["goal", "hiring_budget", "roles_considering"]));
  });

  it("lists required answers still missing and summarises the founder's target", () => {
    expect(missingRequired(leak, null)).toEqual(["profile.company.stage", "profile.company.founded_year", "profile.gtm.model"]);
    expect(missingRequired(leak, {}, { "company.stage": "Seed", "gtm.model": "Hybrid" })).toEqual(["profile.company.founded_year"]);
    expect(missingRequired(leak, {}, { "company.stage": "Seed", "company.founded_year": "2019", "gtm.model": "Hybrid" })).toEqual([]);
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

  it("reads ranges as ranges: a rule fires only when the whole range qualifies, and the range is quoted", () => {
    expect(snap("growth_leak", { "customers.nrr_range": "90–100%" }).signals[0]).toMatchObject({ kind: "watch", title: "Your existing customers shrink on net", basis: "Your answer: NRR 90–100%" });
    expect(snap("growth_leak", { "customers.nrr_range": "110–120%" }).signals[0]).toMatchObject({ kind: "positive" });
    // Asked as annual gross churn; read as gross retention (100% minus churn).
    expect(snap("growth_leak", { "customers.gross_retention_range": "5–10%" }).signals[0]).toMatchObject({ title: "About 5–10% of starting revenue is lost each year", basis: "Your answer: annual gross churn 5–10%" });
    expect(snap("growth_leak", { "customers.gross_retention_range": "Over 20%" }).signals[0]!.title).toBe("More than 20% of starting revenue is lost each year");
    expect(snap("growth_leak", { "customers.gross_retention_range": "Under 2%" }).signals[0]!.title).toBe("Up to 2% of starting revenue is lost each year");
    expect(snap("growth_leak", { "company.growth_range": "Shrinking" }).signals[0]!.title).toBe("Revenue isn't growing year over year");
    expect(snap("growth_leak", { "company.growth_range": "25–50%", "customers.nrr_range": "100–110%" }).signals.map((s) => s.title)).toContain("If there's a leak, it's more likely in new business");
    expect(snap("hire_or_fix", { "gtm.sales_reps_range": "None yet" }).fit).toMatchObject({ good: true, suggested: null, note: expect.stringMatching(/who to hire first/) });
    expect(snap("hire_or_fix", { "customers.acv_range": "$15K–$30K" }, { hiring_budget: "300000" }).signals.map((s) => s.title)).toContain("Your hiring budget equals about 10–20 deals at your ACV");
    expect(snap("winning_icp", { "customers.count_range": "10–19" }).signals[0]!.title).toBe("Segment comparisons will be directional");
    expect(snap("winning_icp", { "customers.count_range": "20–49" }).signals.map((s) => s.title)).not.toContain("Segment comparisons will be directional");
    // A range alone still counts as an answer, and an unknown label is ignored.
    expect(snap("growth_leak", { "company.employees_range": "6–10" }).answersOnly).toBe(false);
    expect(snap("growth_leak", { "customers.nrr_range": "about 100" }).answersOnly).toBe(true);
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
    expect(snap("hire_or_fix", { "gtm.sales_reps": 0 }).fit).toMatchObject({ good: true, suggested: null });
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
  it("defaults to $149 assessments for every available use case, $750 advisory and a reserved, unavailable $299 subscription", () => {
    expect(sellableUseCases()).toEqual(["growth_leak", "hire_or_fix", "winning_icp"]);
    expect(USE_CASES.filter((u) => u.comingSoon).map((u) => u.id)).toEqual(["series_a_ready", "series_b_ready", "founder_handoff"]);
    expect(pricing()).toEqual({ assessmentCents: 14_900, advisoryFromCents: 75_000, subscriptionMonthlyCents: 29_900, subscriptionAvailable: false });
    expect(formatPrice(14_900)).toBe("$149");
    expect(formatPrice(75_000)).toBe("$750");
    expect(formatPrice(1_250)).toBe("$12.50");
  });

  it("reads prices, the booking link and sellable assessments from configuration", () => {
    const env = { ...process.env };
    try {
      Object.assign(process.env, { ASSESSMENT_PRICE_CENTS: "59900", ADVISORY_PRICE_CENTS: "nonsense", ADVISORY_BOOKING_URL: "http://insecure.test", SELLABLE_USE_CASES: "growth_leak, winning_icp, made_up, series_a_ready" });
      expect(pricing().assessmentCents).toBe(59_900);
      expect(pricing().advisoryFromCents).toBe(75_000);
      expect(advisoryBookingUrl()).toBeNull();
      expect(sellableUseCases()).toEqual(["growth_leak", "winning_icp"]);
      process.env.ADVISORY_BOOKING_URL = "https://calendly.com/growthgoaled/session";
      expect(advisoryBookingUrl()).toBe("https://calendly.com/growthgoaled/session");
      expect(advisoryBookingUrl("monthly")).toBe("https://calendly.com/growthgoaled/session");
      process.env.ADVISORY_MONTHLY_BOOKING_URL = "https://calendly.com/growthgoaled/monthly";
      expect(advisoryBookingUrl("monthly")).toBe("https://calendly.com/growthgoaled/monthly");
      expect(advisoryHref("growth_leak", "review")).toBe("/advisory/book?use_case=growth_leak&kind=review");
      delete process.env.ADVISORY_BOOKING_URL;
      delete process.env.ADVISORY_MONTHLY_BOOKING_URL;
      expect(advisoryHref("growth_leak", "monthly")).toBe("/advisory?use_case=growth_leak&kind=monthly");
      delete process.env.SELLABLE_USE_CASES;
      expect(sellableUseCases()).toEqual(USE_CASE_IDS.filter((id) => !getUseCase(id)!.comingSoon));
    } finally {
      process.env = env;
    }
  });
});

describe("results confidence", () => {
  it("is high when the result rests on enough confirmed figures with no gaps", () => {
    expect(resultConfidence({ reviewed: false, unconfirmed: 0, gaps: 0, metrics: 4 }).level).toBe("High");
    expect(resultConfidence({ reviewed: true, unconfirmed: 1, gaps: 0, metrics: 4 }).level).toBe("Medium");
    const low = resultConfidence({ reviewed: false, unconfirmed: 2, gaps: 3, metrics: 2 });
    expect(low.level).toBe("Low");
    expect(low.reasons).toEqual([
      "Every figure was checked in code against your inputs.",
      "2 figures were read from your files and not yet confirmed by you.",
      "3 data gaps limit how far the conclusions go (listed below).",
      "Based on 2 figures; more data would broaden it.",
    ]);
    expect(resultConfidence({ reviewed: true, unconfirmed: 0, gaps: 0, metrics: 5 }).reasons[0]).toMatch(/advisor reviewed it/);
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
    expect(none.map((s) => s.label)).toEqual(["Overview", "Growth questions", "Data", "Results", "Action plan"]);
    expect(none.filter((s) => s.locked).map((s) => s.key)).toEqual(["data", "baseline", "progress"]);
    expect(none.find((s) => s.key === "data")!.lockedReason).toBe("Unlocks when you buy an assessment");
    expect(none.find((s) => s.key === "baseline")!.label).toBe("Results");
    expect(none.find((s) => s.current)!.key).toBe("library");

    const active = stepStates({ useCase: "growth_leak", status: "active" });
    expect(active.filter((s) => s.locked).map((s) => s.key)).toEqual(["progress"]);
    expect(active.find((s) => s.key === "progress")!.lockedReason).toBe("Unlocks when you commit to your plan");
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

describe("how we work with companies like yours", () => {
  const profile = { "company.industry": "Fintech", "company.stage": "Seed", "customers.segment": "Mid-market", "gtm.model": "Founder-led" };
  it("describes the founder's kind of company and what we'd do after the assessment, without claiming past results", () => {
    for (const u of USE_CASES) {
      const h = howWeWork({ useCase: u.id, profile, revenueBand: "1m_3m" });
      expect(h.audience).toBe("Seed fintech companies selling to mid-market companies, with founder-led sales, at $1–3M ARR");
      expect(h.approach.length).toBeGreaterThanOrEqual(3);
      expect(h.example.trigger).toMatch(/^If the assessment/);
      expect(h.example.steps.length).toBeGreaterThanOrEqual(3);
      const text = [...h.approach, h.example.trigger, ...h.example.steps].join(" ");
      expect(text, u.id).not.toMatch(/\d+\s?%|\$\d|customers like|helped|we've helped|case study/i);
    }
  });

  it("tailors the example to the founder's answers", () => {
    expect(howWeWork({ useCase: "growth_leak", profile: { "customers.nrr": 92 }, revenueBand: null }).example.trigger).toMatch(/existing customers/);
    expect(howWeWork({ useCase: "growth_leak", profile: { "customers.nrr": 110 }, revenueBand: null }).example.trigger).toMatch(/new business/);
    expect(howWeWork({ useCase: "growth_leak", profile: { "customers.nrr_range": "90–100%" }, revenueBand: null }).example.trigger).toMatch(/existing customers/);
    expect(howWeWork({ useCase: "growth_leak", profile: { "customers.nrr_range": "110–120%" }, revenueBand: null }).example.trigger).toMatch(/new business/);
    expect(howWeWork({ useCase: "series_a_ready", profile: { "gtm.model": "Founder-led" }, revenueBand: null }).example.trigger).toMatch(/founder-led sales/);
    expect(howWeWork({ useCase: "hire_or_fix", profile: { "gtm.sales_reps": 0 }, revenueBand: null }).example.trigger).toMatch(/first sales hire/);
    expect(howWeWork({ useCase: "growth_leak", profile: {}, revenueBand: null }).audience).toBe("Early-stage B2B software companies");
  });
});

describe("metric definitions", () => {
  it("defines every metric, and every figure the profile or a questionnaire asks for", async () => {
    const { METRICS } = await import("@/lib/metrics");
    const { INTAKE_SECTIONS } = await import("@/lib/intake");
    for (const [k, m] of Object.entries(METRICS)) expect(m.definition.length, k).toBeGreaterThan(20);
    for (const s of INTAKE_SECTIONS) for (const f of s.fields) if (f.metric || f.rangeOf || f.kind === "currency") expect(f.help, `${s.id}.${f.id}`).toBeTruthy();
    for (const u of USE_CASES) for (const q of u.objectiveQuestions) if (q.kind === "currency" || q.kind === "number" || /share|%/.test(q.placeholder ?? "")) expect(q.help, `${u.id}.${q.id}`).toBeTruthy();
  });
});
