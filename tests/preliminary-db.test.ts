/** Instant preliminary Benchmark + per-use-case $1 activation, against Postgres (PGlite). Models and Stripe are stubbed. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import type { DraftInput } from "@/lib/ai/draft";
import { approveDeliverable, createBenchmarkVersion, publishDeliverable, runBenchmarkPipeline, sendBackDeliverable } from "@/lib/data/deliverables";
import { founderBenchmark, startPreliminaryIfDue } from "@/lib/data/preliminary";
import { CheckoutError, confirmCheckout, createAssessmentCheckout, markSession, recordPaidSession } from "@/lib/data/payments";
import { createAdvisoryRequest } from "@/lib/data/advisory";
import { activateUseCase, activateWithoutPayment, getCompanyUseCase, pickActiveUseCase, listCompanyUseCases, saveObjectiveAnswer } from "@/lib/data/use-cases";
import { completionSteps } from "@/lib/completion";
import { assessReadiness } from "@/lib/readiness-assessment";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User;
let advisor: User;
let acme: Company;
let docId: string;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

const refresh = async () => (await db().select().from(schema.companies).where(eq(schema.companies.id, acme.id)))[0]!;

beforeEach(async () => {
  for (const t of [schema.events, schema.advisoryRequests, schema.companyUseCases, schema.payments, schema.agentRuns, schema.reviews, schema.deliverables, schema.benchmarkMetrics, schema.benchmarkSources, schema.benchmarkCohorts, schema.companies, schema.users]) await db().delete(t);
  [founder, advisor] = (await db()
    .insert(schema.users)
    .values([
      { email: "maya@acme.test", authUserId: "a1", role: "founder" },
      { email: "ana@gg.test", authUserId: "a2", role: "advisor" },
    ])
    .returning()) as [User, User];
  [acme] = (await db().insert(schema.companies).values({ name: "Acme", stage: "Series A", arr: 4_200_000, advisorId: advisor.id }).returning()) as [Company];
  const [doc] = await db().insert(schema.documents).values({ companyId: acme.id, docType: "other", blobUrl: "x", filename: "everything.xlsx", mime: "text/csv", size: 1, status: "done", inbox: true, sortStatus: "sorted" }).returning();
  docId = doc!.id;
  await db().insert(schema.dataPoints).values([
    { companyId: acme.id, metric: "arr_growth", value: 72, unit: "percent", confidence: "high", status: "accepted" },
    // Read from the file, not yet confirmed by the founder: used in the preliminary report only.
    { companyId: acme.id, metric: "nrr", value: 108, unit: "percent", confidence: "medium", status: "proposed", documentId: docId },
  ]);
  const [src] = await db().insert(schema.benchmarkSources).values({ name: "Survey", type: "public" }).returning();
  const [cohort] = await db().insert(schema.benchmarkCohorts).values({ name: "Series A SaaS", criteria: { stage: ["Series A"] }, companyCount: 40 }).returning();
  await db().insert(schema.benchmarkMetrics).values([
    { cohortId: cohort!.id, metric: "arr_growth", median: 58, p75: 89, sourceId: src!.id, status: "approved" },
    { cohortId: cohort!.id, metric: "nrr", median: 104, p75: 119, sourceId: src!.id, status: "approved" },
    { cohortId: cohort!.id, metric: "win_rate", median: 21, p75: 24, sourceId: src!.id, status: "approved" },
  ]);
});

const draft = async (i: DraftInput) => {
  const c = (m: string) => i.comparison.find((x) => x.metric === m)!;
  return {
    output: {
      headline: "Growth is strong.",
      insight: { headline: "Retention is the gap.", body: "NRR is 108% vs. a top quartile of 119%.", sources: [c("nrr").data_point_id, c("nrr").benchmark_row_id] },
      strengths: [{ text: "Growth 72% vs. median 58%", sources: [c("arr_growth").data_point_id, c("arr_growth").benchmark_row_id] }],
      watch_areas: [{ text: "NRR 108% vs. 119%", sources: [c("nrr").data_point_id] }],
      priority: { text: "Improve retention.", sources: [c("nrr").data_point_id] },
      missing_inputs: [],
    },
    model: "m",
    tokensIn: 1,
    tokensOut: 1,
  };
};
const qa = async () => ({ results: Object.fromEntries(["data_consistency", "benchmark_methodology", "source_trail", "recommendation_logic", "missing_inputs"].map((k) => [k, { result: "pass" as const, note: "ok" }])) as never, model: "q", tokensIn: 1, tokensOut: 1 });

describe("preliminary benchmark", () => {
  it("is built once uploads settle, using unconfirmed file figures, and stays locked until paid", async () => {
    await db().update(schema.documents).set({ status: "analyzing" }).where(eq(schema.documents.id, docId));
    expect(await startPreliminaryIfDue(acme)).toBeNull(); // still reading
    await db().update(schema.documents).set({ status: "done" }).where(eq(schema.documents.id, docId));
    const id = (await startPreliminaryIfDue(acme))!;
    expect(id).toBeTruthy();
    expect((await founderBenchmark(acme)).kind === "preliminary" && (await founderBenchmark(acme) as { state: string }).state).toBe("building");
    await runBenchmarkPipeline(id, null, { draft, qa });
    expect(await startPreliminaryIfDue(acme)).toBeNull(); // nothing changed since

    const locked = await founderBenchmark(acme);
    if (locked.kind !== "preliminary") throw new Error("expected preliminary");
    expect(locked).toMatchObject({ state: "ready", unlocked: false, view: null });
    expect(locked.preview).toMatchObject({ cohortName: "Series A SaaS", companyCount: 40, metrics: ["ARR Growth", "NRR"] });
    expect(JSON.stringify(locked.preview)).not.toMatch(/72|108|119/); // no figures before payment
    const titles = locked.steps.map((s) => s.title);
    expect(titles).toContain("Add your Win Rate");
    expect(titles).toContain("Confirm 1 figure read from your files");

    await activateUseCase(acme.id, "growth_leak", { activation: "paid", by: founder.id });
    const open = await founderBenchmark(await refresh());
    if (open.kind !== "preliminary" || !open.view) throw new Error("expected view");
    expect(open.view.rows.find((r) => r.metric === "nrr")).toMatchObject({ value: "108%", unconfirmed: true });
    expect(open.view.rows.find((r) => r.metric === "arr_growth")).toMatchObject({ unconfirmed: false });
  });

  it("isn't shown when the code checks fail, or after the advisor sends it back", async () => {
    await activateUseCase(acme.id, "growth_leak", { activation: "paid", by: founder.id });
    const id = (await startPreliminaryIfDue(acme))!;
    await runBenchmarkPipeline(id, null, {
      draft: async (i) => {
        const d = await draft(i);
        d.output.watch_areas.push({ text: "CAC payback is 31 months", sources: [] });
        return d;
      },
      qa,
    });
    const failed = await founderBenchmark(await refresh());
    expect(failed).toMatchObject({ kind: "preliminary", state: "unavailable", view: null, reason: expect.stringMatching(/accuracy checks/) });

    expect(await startPreliminaryIfDue(await refresh())).toBeNull(); // automatic rebuilds are throttled
    const v2 = (await createBenchmarkVersion(await refresh(), { preliminary: true }))!; // "Build it again" replaces the unreviewed preliminary
    await runBenchmarkPipeline(v2.id, null, { draft, qa });
    expect(await founderBenchmark(await refresh())).toMatchObject({ state: "ready" });
    await sendBackDeliverable(advisor, await refresh(), v2.id, "Recheck NRR");
    expect(await founderBenchmark(await refresh())).toMatchObject({ state: "unavailable", reason: expect.stringMatching(/revising/) });
  });

  it("only starts automatically after an upload", async () => {
    await db().delete(schema.documents);
    expect(await startPreliminaryIfDue(acme)).toBeNull();
  });

  it("gives way to an advisor-driven version, even mid-run", async () => {
    const prelim = (await startPreliminaryIfDue(acme))!;
    await db().update(schema.dataPoints).set({ status: "accepted" }).where(eq(schema.dataPoints.documentId, docId));
    const manual = (await createBenchmarkVersion(acme))!;
    expect(manual).toBeTruthy();
    await runBenchmarkPipeline(prelim, null, { draft, qa }); // superseded: must not come back to life
    const [p] = await db().select().from(schema.deliverables).where(eq(schema.deliverables.id, prelim));
    expect(p!.status).toBe("changes_requested");
    expect(await founderBenchmark(acme)).toMatchObject({ advisorInProgress: true });
  });

  it("never replaces an advisor-driven version, and the published report takes over", async () => {
    // Advisor-driven versions use confirmed figures only.
    await db().update(schema.dataPoints).set({ status: "accepted" }).where(eq(schema.dataPoints.documentId, docId));
    const manual = (await createBenchmarkVersion(acme))!;
    expect(await createBenchmarkVersion(acme, { preliminary: true })).toBeNull();
    await runBenchmarkPipeline(manual.id, null, { draft, qa });
    await approveDeliverable(advisor, acme, manual.id, "Checked");
    await publishDeliverable(advisor, acme, manual.id);
    const state = await founderBenchmark(await refresh());
    expect(state.kind).toBe("published"); // advisor-published reports don't need the unlock
  });
});

describe("assessment purchase", () => {
  const fakeStripe = (session: Record<string, unknown>) => ({
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" })),
        retrieve: vi.fn(async () => session),
      },
    },
  });
  const activeRows = async () => (await db().select().from(schema.companyUseCases)).filter((r) => r.activatedAt);
  const paid = { id: "cs_test_1", client_reference_id: "", metadata: {}, amount_total: 14_900, payment_status: "paid" as "paid" | "unpaid" };

  it("selecting a use case and answering questions is free: no payment, no entitlement", async () => {
    await saveObjectiveAnswer(acme, "growth_leak", "goal", "Find the leak");
    expect(await db().select().from(schema.payments)).toHaveLength(0);
    expect(await activeRows()).toHaveLength(0);
    expect(await getCompanyUseCase(acme.id, "growth_leak")).toMatchObject({ status: "objective", activatedAt: null });
  });

  it("creates a $149 checkout for the company and use case, and grants it only on a matching paid session", async () => {
    const stripe = fakeStripe({});
    const url = await createAssessmentCheckout(founder, acme, "growth_leak", "https://dev.test", stripe as never);
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    const [args, opts] = stripe.checkout.sessions.create.mock.calls[0] as unknown as [
      { line_items: { price_data: { unit_amount: number } }[]; client_reference_id: string; success_url: string; cancel_url: string; metadata: Record<string, string> },
      { idempotencyKey: string },
    ];
    expect(args.line_items[0]!.price_data.unit_amount).toBe(14_900);
    expect(args.client_reference_id).toBe(acme.id);
    expect(args.metadata).toMatchObject({ useCase: "growth_leak", purpose: "assessment", userId: founder.id });
    expect(args.success_url).toBe("https://dev.test/api/checkout/return?use_case=growth_leak&session_id={CHECKOUT_SESSION_ID}");
    expect(args.cancel_url).toBe("https://dev.test/library/growth_leak/snapshot?checkout=cancelled");
    expect(opts.idempotencyKey).toMatch(new RegExp(`^assessment:${acme.id}:growth_leak:`));
    expect((await db().select().from(schema.payments))[0]).toMatchObject({ status: "pending", amountCents: 14_900, useCase: "growth_leak", purpose: "assessment", checkoutUrl: url });

    const base = { ...paid, client_reference_id: acme.id, metadata: { companyId: acme.id } };
    expect(await recordPaidSession({ ...base, payment_status: "unpaid" })).toBe(false);
    expect(await recordPaidSession({ ...base, client_reference_id: "someone-else" })).toBe(false);
    expect(await recordPaidSession({ ...base, metadata: { companyId: "someone-else" } })).toBe(false);
    expect(await recordPaidSession({ ...base, id: "cs_unknown" })).toBe(false);
    expect(await recordPaidSession({ ...base, amount_total: 100 })).toBe(false); // underpaid
    expect(await activeRows()).toHaveLength(0);

    expect(await recordPaidSession(base)).toBe(true);
    expect(await recordPaidSession(base)).toBe(true); // idempotent (webhook + return)
    const rows = await activeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ useCase: "growth_leak", status: "active", activation: "paid", activatedBy: founder.id });
    expect((await db().select().from(schema.payments))[0]).toMatchObject({ status: "paid" });
    const events = await db().select().from(schema.events).where(eq(schema.events.name, "use_case_activated"));
    expect(events).toHaveLength(1);
  });

  it("prevents duplicate charges: reuses an open checkout, refuses one already bought", async () => {
    const open = fakeStripe({ id: "cs_test_1", status: "open", payment_status: "unpaid" });
    const first = await createAssessmentCheckout(founder, acme, "growth_leak", "https://dev.test", open as never);
    const second = await createAssessmentCheckout(founder, acme, "growth_leak", "https://dev.test", open as never);
    expect(second).toBe(first);
    expect(open.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(await db().select().from(schema.payments)).toHaveLength(1);

    // Paid in the meantime (webhook not yet arrived): the retry grants it and refuses a new charge.
    const nowPaid = fakeStripe({ ...paid, status: "complete", client_reference_id: acme.id, metadata: { companyId: acme.id } });
    await expect(createAssessmentCheckout(founder, acme, "growth_leak", "https://dev.test", nowPaid as never)).rejects.toThrow(CheckoutError);
    expect(nowPaid.checkout.sessions.create).not.toHaveBeenCalled();
    expect(await activeRows()).toHaveLength(1);
    await expect(createAssessmentCheckout(founder, acme, "growth_leak", "https://dev.test", nowPaid as never)).rejects.toThrow("You already have this assessment.");
  });

  it("starts a fresh checkout once the old one expired, and records failed and expired sessions without granting", async () => {
    await createAssessmentCheckout(founder, acme, "growth_leak", "https://dev.test", fakeStripe({}) as never);
    const expired = fakeStripe({ id: "cs_test_1", status: "expired", payment_status: "unpaid" });
    expired.checkout.sessions.create.mockResolvedValueOnce({ id: "cs_test_2", url: "https://checkout.stripe.com/c/pay/cs_test_2" });
    expect(await createAssessmentCheckout(founder, acme, "growth_leak", "https://dev.test", expired as never)).toBe("https://checkout.stripe.com/c/pay/cs_test_2");
    const statuses = Object.fromEntries((await db().select().from(schema.payments)).map((p) => [p.stripeSessionId, p.status]));
    expect(statuses).toEqual({ cs_test_1: "expired", cs_test_2: "pending" });

    await markSession("cs_test_2", "failed");
    expect((await db().select().from(schema.payments).where(eq(schema.payments.stripeSessionId, "cs_test_2")))[0]!.status).toBe("failed");
    expect(await activeRows()).toHaveLength(0);
    // A paid payment is never downgraded by a late "expired" event.
    await db().update(schema.payments).set({ status: "paid" }).where(eq(schema.payments.stripeSessionId, "cs_test_1"));
    await markSession("cs_test_1", "expired");
    expect((await db().select().from(schema.payments).where(eq(schema.payments.stripeSessionId, "cs_test_1")))[0]!.status).toBe("paid");
  });

  it("sells all six assessments by default, and only those listed when SELLABLE_USE_CASES narrows it", async () => {
    expect(await createAssessmentCheckout(founder, acme, "series_a_ready", "https://dev.test", fakeStripe({}) as never)).toContain("checkout.stripe.com");
    process.env.SELLABLE_USE_CASES = "growth_leak";
    try {
      await expect(createAssessmentCheckout(founder, acme, "winning_icp", "https://dev.test", fakeStripe({}) as never)).rejects.toThrow("isn't available to buy yet");
    } finally {
      delete process.env.SELLABLE_USE_CASES;
    }
  });

  it("confirms on return from checkout with Stripe, only for the company's own session", async () => {
    await createAssessmentCheckout(founder, acme, "growth_leak", "https://dev.test", fakeStripe({}) as never);
    const [other] = (await db().insert(schema.companies).values({ name: "Other" }).returning()) as [Company];
    const ok = fakeStripe({ ...paid, client_reference_id: acme.id, metadata: { companyId: acme.id } });
    expect(await confirmCheckout(other, "cs_test_1", ok as never)).toBe("unknown");
    expect(await getCompanyUseCase(other.id, "growth_leak")).toBeNull();
    expect(await confirmCheckout(acme, "cs_test_1", fakeStripe({ id: "cs_test_1", status: "open", payment_status: "unpaid" }) as never)).toBe("pending");
    expect(await activeRows()).toHaveLength(0);
    expect(await confirmCheckout(acme, "cs_test_1", ok as never)).toBe("paid");
    expect(await activeRows()).toHaveLength(1);
  });

  it("still honours paid sessions from the retired $1 purchases", async () => {
    await db().insert(schema.payments).values([
      { companyId: acme.id, userId: founder.id, purpose: "benchmark_unlock", stripeSessionId: "cs_old", amountCents: 100, currency: "usd" },
      { companyId: acme.id, userId: founder.id, purpose: "use_case", useCase: "winning_icp", stripeSessionId: "cs_uc", amountCents: 100, currency: "usd" },
    ]);
    const s = { payment_status: "paid" as const, client_reference_id: acme.id, metadata: { companyId: acme.id }, amount_total: 100 };
    expect(await recordPaidSession({ ...s, id: "cs_old" })).toBe(true);
    expect(await recordPaidSession({ ...s, id: "cs_uc" })).toBe(true);
    expect((await activeRows()).map((r) => r.useCase).sort()).toEqual(["growth_leak", "winning_icp"]);
  });

  it("records advisory requests once a week per use case, and never touches the assessment", async () => {
    await activateUseCase(acme.id, "growth_leak", { activation: "paid", by: founder.id });
    expect(await createAdvisoryRequest(founder, acme, "growth_leak", "Help prioritize")).toEqual({ created: true });
    expect(await createAdvisoryRequest(founder, acme, "growth_leak", "Again")).toEqual({ created: false });
    expect(await createAdvisoryRequest(founder, acme, "hire_or_fix", "")).toEqual({ created: true });
    expect(await db().select().from(schema.advisoryRequests)).toHaveLength(2);
    expect((await getCompanyUseCase(acme.id, "growth_leak"))!.activatedAt).toBeTruthy();
  });

  it("saves objective answers one at a time, keeps them through activation, and validates them", async () => {
    expect(await saveObjectiveAnswer(acme, "series_a_ready", "goal", "  Raise a $12M Series A  ")).toEqual({ ok: true, value: "Raise a $12M Series A" });
    expect(await saveObjectiveAnswer(acme, "series_a_ready", "target_value", "$5,000,000")).toEqual({ ok: true, value: "5000000" });
    expect(await saveObjectiveAnswer(acme, "series_a_ready", "target_value", "lots")).toMatchObject({ ok: false });
    expect(await saveObjectiveAnswer(acme, "series_a_ready", "main_metric", "made_up")).toMatchObject({ ok: false });
    expect(await saveObjectiveAnswer(acme, "series_a_ready", "target_date", "2027-13-45")).toMatchObject({ ok: false });
    expect(await saveObjectiveAnswer(acme, "series_a_ready", "not_a_question", "x")).toMatchObject({ ok: false });
    expect(await saveObjectiveAnswer(acme, "growth_leak", "raise_amount", "1")).toMatchObject({ ok: false }); // another use case's question
    let row = await getCompanyUseCase(acme.id, "series_a_ready");
    expect(row).toMatchObject({ status: "objective", activatedAt: null, objective: { goal: "Raise a $12M Series A", target_value: "5000000" } });
    expect(await saveObjectiveAnswer(acme, "series_a_ready", "goal", "")).toMatchObject({ ok: true });
    row = await getCompanyUseCase(acme.id, "series_a_ready");
    expect(row!.objective).toEqual({ target_value: "5000000" });

    await activateWithoutPayment(advisor, acme, "series_a_ready", "Pilot");
    row = await getCompanyUseCase(acme.id, "series_a_ready");
    expect(row).toMatchObject({ status: "active", activation: "advisor", activatedBy: advisor.id, activationNote: "Pilot", objective: { target_value: "5000000" } });
    // A second activation (e.g. a late payment) keeps the original record.
    expect(await activateUseCase(acme.id, "series_a_ready", { activation: "paid", by: founder.id })).toEqual({ activated: false });
    expect((await getCompanyUseCase(acme.id, "series_a_ready"))!.activation).toBe("advisor");
    await expect(activateWithoutPayment(founder, acme, "growth_leak", "me")).rejects.toThrow();
  });

  it("picks the preferred active use case, else the latest activation", async () => {
    await activateUseCase(acme.id, "growth_leak", { activation: "paid", by: founder.id });
    await new Promise((r) => setTimeout(r, 5));
    await activateUseCase(acme.id, "hire_or_fix", { activation: "paid", by: founder.id });
    await saveObjectiveAnswer(acme, "winning_icp", "goal", "Find our ICP");
    const rows = await listCompanyUseCases(acme.id);
    expect(pickActiveUseCase(rows, undefined)?.useCase).toBe("hire_or_fix");
    expect(pickActiveUseCase(rows, "growth_leak")?.useCase).toBe("growth_leak");
    expect(pickActiveUseCase(rows, "winning_icp")?.useCase).toBe("hire_or_fix"); // not activated
    expect(pickActiveUseCase([], "growth_leak")).toBeNull();
  });
});

describe("completion steps", () => {
  it("lists missing cohort metrics, unconfirmed figures, conflicts and blocked metrics with links", () => {
    const steps = completionSteps({
      cohortMetrics: ["arr_growth", "nrr", "sales_cycle_days"],
      comparedMetrics: ["arr_growth", "nrr"],
      unconfirmedMetrics: ["nrr"],
      openConflicts: 2,
      assessment: assessReadiness([], [], new Date("2026-10-24")),
      noCohort: false,
    });
    expect(steps[0]).toMatchObject({ title: "Add your Sales Cycle", href: "/profile/customers" });
    expect(steps.find((s) => s.title.startsWith("Confirm"))).toMatchObject({ href: "/data/files" });
    expect(steps.find((s) => s.title.startsWith("Resolve 2"))).toMatchObject({ href: "/data/questions" });
    expect(steps.some((s) => s.title.startsWith("Unlock revenue growth"))).toBe(true);
  });
});
