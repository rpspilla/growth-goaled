/** Instant preliminary Benchmark + $1 unlock, against Postgres (PGlite). Models and Stripe are stubbed. */
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
import { confirmCheckout, createBenchmarkCheckout, recordPaidSession } from "@/lib/data/payments";
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
  for (const t of [schema.payments, schema.agentRuns, schema.reviews, schema.deliverables, schema.benchmarkMetrics, schema.benchmarkSources, schema.benchmarkCohorts, schema.companies, schema.users]) await db().delete(t);
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

    await db().update(schema.companies).set({ benchmarkUnlockedAt: new Date() }).where(eq(schema.companies.id, acme.id));
    const open = await founderBenchmark(await refresh());
    if (open.kind !== "preliminary" || !open.view) throw new Error("expected view");
    expect(open.view.rows.find((r) => r.metric === "nrr")).toMatchObject({ value: "108%", unconfirmed: true });
    expect(open.view.rows.find((r) => r.metric === "arr_growth")).toMatchObject({ unconfirmed: false });
  });

  it("isn't shown when the code checks fail, or after the advisor sends it back", async () => {
    await db().update(schema.companies).set({ benchmarkUnlockedAt: new Date() }).where(eq(schema.companies.id, acme.id));
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

describe("$1 unlock", () => {
  const fakeStripe = (session: Record<string, unknown>) => ({
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" })),
        retrieve: vi.fn(async () => session),
      },
    },
  });

  it("creates a $1 checkout for the company and unlocks only on a matching paid session", async () => {
    const stripe = fakeStripe({});
    const url = await createBenchmarkCheckout(founder, acme, "https://dev.test", stripe as never);
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    const args = (stripe.checkout.sessions.create.mock.calls[0] as unknown[])[0] as { line_items: { price_data: { unit_amount: number } }[]; client_reference_id: string; success_url: string };
    expect(args.line_items[0]!.price_data.unit_amount).toBe(100);
    expect(args.client_reference_id).toBe(acme.id);
    expect(args.success_url).toContain("session_id={CHECKOUT_SESSION_ID}");

    const base = { id: "cs_test_1", client_reference_id: acme.id, metadata: { companyId: acme.id }, amount_total: 100 };
    expect(await recordPaidSession({ ...base, payment_status: "unpaid" })).toBe(false);
    expect(await recordPaidSession({ ...base, payment_status: "paid", client_reference_id: "someone-else" })).toBe(false);
    expect(await recordPaidSession({ ...base, id: "cs_unknown", payment_status: "paid" })).toBe(false);
    expect((await refresh()).benchmarkUnlockedAt).toBeNull();

    expect(await recordPaidSession({ ...base, payment_status: "paid" })).toBe(true);
    expect(await recordPaidSession({ ...base, payment_status: "paid" })).toBe(true); // idempotent (webhook + return)
    expect((await refresh()).benchmarkUnlockedAt).not.toBeNull();
    const [p] = await db().select().from(schema.payments);
    expect(p).toMatchObject({ status: "paid", amountCents: 100 });
    expect((await db().select().from(schema.events).where(eq(schema.events.name, "benchmark_unlocked"))).length).toBe(1);
  });

  it("confirms on return from checkout only for the company's own session", async () => {
    await createBenchmarkCheckout(founder, acme, "https://dev.test", fakeStripe({}) as never);
    const [other] = (await db().insert(schema.companies).values({ name: "Other" }).returning()) as [Company];
    const paid = fakeStripe({ id: "cs_test_1", payment_status: "paid", client_reference_id: acme.id, metadata: { companyId: acme.id }, amount_total: 100 });
    expect(await confirmCheckout(other, "cs_test_1", paid as never)).toBe(false);
    expect(await confirmCheckout(acme, "cs_test_1", paid as never)).toBe(true);
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
    expect(steps[0]).toMatchObject({ title: "Add your Sales Cycle", href: "/intake/customers" });
    expect(steps.find((s) => s.title.startsWith("Confirm"))).toMatchObject({ href: "/readiness/files" });
    expect(steps.find((s) => s.title.startsWith("Resolve 2"))).toMatchObject({ href: "/questions" });
    expect(steps.some((s) => s.title.startsWith("Unlock revenue growth"))).toBe(true);
  });
});
