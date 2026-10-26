import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_ITEM_KEYS } from "@/lib/readiness";
import { isMetricKey } from "@/lib/metrics";
import { getUseCase, missingRequired, objectiveFields, parseAnswer, recommendedUseCases, targetSummary, USE_CASE_IDS, USE_CASES } from "@/lib/use-cases";
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
  it("shares the core questions and offers the use case's figures as the main metric", () => {
    const fields = objectiveFields(leak);
    expect(fields.filter((f) => f.required).map((f) => f.id)).toEqual(["goal", "main_metric", "target_value", "target_date"]);
    expect(fields.find((f) => f.id === "main_metric")!.options!.map((o) => o.value)).toEqual([...leak.figures]);
    expect(fields.at(-1)!.id).toBe("suspected_leak");
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
    expect(missingRequired(leak, null).map((f) => f.id)).toEqual(["goal", "main_metric", "target_value", "target_date"]);
    const objective = { goal: "Grow", main_metric: "arr", target_value: "5000000", target_date: "2027-06-30" };
    expect(missingRequired(leak, objective)).toEqual([]);
    expect(targetSummary(objective)).toBe("ARR $5M by 2027-06-30");
    expect(targetSummary({ main_metric: "arr" })).toBeNull();
    expect(targetSummary({ main_metric: "toString", target_value: "1" })).toBeNull();
  });
});

describe("five steps", () => {
  it("locks Data and Baseline until a use case is active, and Progress until the baseline is approved", () => {
    const none = stepStates(null);
    expect(none.map((s) => s.label)).toEqual(["Overview", "Use Case Library", "Data", "Baseline", "Progress & Tracking"]);
    expect(none.filter((s) => s.locked).map((s) => s.key)).toEqual(["data", "baseline", "progress"]);
    expect(none.find((s) => s.key === "data")!.lockedReason).toBe("Unlocks when you activate a use case");
    expect(none.find((s) => s.current)!.key).toBe("library");

    const active = stepStates({ useCase: "growth_leak", status: "active" });
    expect(active.filter((s) => s.locked).map((s) => s.key)).toEqual(["progress"]);
    expect(active.find((s) => s.key === "progress")!.lockedReason).toBe("Unlocks when your baseline is approved");
    expect(active.find((s) => s.current)!.key).toBe("data");
    expect(active.find((s) => s.key === "library")!.done).toBe(true);

    const tracking = stepStates({ useCase: "growth_leak", status: "tracking" });
    expect(tracking.some((s) => s.locked)).toBe(false);
    expect(tracking.find((s) => s.current)!.key).toBe("progress");
  });

  it("points Overview's button at the next action", () => {
    expect(journeyStage(null)).toBe(0);
    expect(nextAction(null, null)).toEqual({ label: "Pick a use case", path: "/library" });
    expect(nextAction(null, "winning_icp")).toEqual({ label: "Finish your objective", path: "/library/winning_icp" });
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
