/** Benchmark deliverable pipeline end to end against Postgres (PGlite). Draft and QA models are stubbed. */
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
import type { DraftInput, DraftOutput } from "@/lib/ai/draft";
import { DraftError } from "@/lib/ai/draft";
import {
  approveDeliverable,
  createBenchmarkVersion,
  deliverableRuns,
  editDeliverable,
  founderBenchmarkStatus,
  getDeliverable,
  publishDeliverable,
  runBenchmarkPipeline,
  runQaForVersion,
  sendBackDeliverable,
} from "@/lib/data/deliverables";
import { benchmarkViewFor, getPublishedBenchmark } from "@/lib/data/benchmark";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;

let advisor: User;
let acme: Company;
let dp: Record<string, string>;
let bm: Record<string, string>;
let sampleCohortId: string;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.agentRuns, schema.reviews, schema.deliverables, schema.benchmarkMetrics, schema.benchmarkSources, schema.benchmarkCohorts, schema.companies, schema.users]) await db().delete(t);
  [advisor] = (await db().insert(schema.users).values({ email: "ana@gg.test", authUserId: "a1", role: "advisor" }).returning()) as [User];
  [acme] = (await db()
    .insert(schema.companies)
    .values({ name: "Acme AI", stage: "Series A", salesModel: "Founder-led", arr: 4_200_000, phase: "benchmark", advisorId: advisor.id })
    .returning()) as [Company];
  const values = { arr_growth: 72, nrr: 108, sales_cycle_days: 94, win_rate: 27, ae_productivity: 840_000 };
  dp = {};
  for (const [metric, value] of Object.entries(values)) {
    const [row] = await db().insert(schema.dataPoints).values({ companyId: acme.id, metric, value, unit: "x", confidence: "high", status: "accepted" }).returning();
    dp[metric] = row!.id;
  }
  // A rejected value must never be used.
  await db().insert(schema.dataPoints).values({ companyId: acme.id, metric: "grr", value: 70, unit: "percent", confidence: "low", status: "rejected" });

  const [src] = await db().insert(schema.benchmarkSources).values({ name: "SaaS Survey", year: 2026, type: "public" }).returning();
  const [cohort] = await db()
    .insert(schema.benchmarkCohorts)
    .values({ name: "Series A founder-led", criteria: { stage: ["Series A"], arr_min: 2_000_000, arr_max: 10_000_000, gtm_motion: "Founder-led" }, companyCount: 14 })
    .returning();
  const bench = { arr_growth: [58, 89], nrr: [104, 119], sales_cycle_days: [78, 61], win_rate: [21, 24], grr: [88, 94] };
  bm = {};
  for (const [metric, [median, p75]] of Object.entries(bench)) {
    const [row] = await db().insert(schema.benchmarkMetrics).values({ cohortId: cohort!.id, metric, median, p75, sourceId: src!.id, status: "approved" }).returning();
    bm[metric] = row!.id;
  }
  // A proposed (unapproved) row must never be used.
  await db().insert(schema.benchmarkMetrics).values({ cohortId: cohort!.id, metric: "ae_productivity", median: 920_000, p75: 1_200_000, sourceId: src!.id, status: "proposed" });
  // The sample cohort has more metrics but is never matched to a real company.
  const [sample] = await db().insert(schema.benchmarkCohorts).values({ name: "Sample", criteria: { stage: ["Series A"] }, isSample: true }).returning();
  sampleCohortId = sample!.id;
  for (const metric of Object.keys(values)) await db().insert(schema.benchmarkMetrics).values({ cohortId: sample!.id, metric, median: 1, p75: 2, sourceId: src!.id, status: "approved" });
});

let seenInput: DraftInput | null = null;
const goodDraft = (input: DraftInput): DraftOutput => {
  seenInput = input;
  const id = (m: string) => input.comparison.find((c) => c.metric === m)!;
  return {
    headline: "Strong growth; sales cycle is the gap.",
    insight: { headline: "Your sales cycle is the constraint.", body: "At 94d you are 33 days behind the top quartile of 61d.", sources: [id("sales_cycle_days").data_point_id, id("sales_cycle_days").benchmark_row_id] },
    strengths: [{ text: "Growth above median (72% vs. 58%)", sources: [id("arr_growth").data_point_id, id("arr_growth").benchmark_row_id] }],
    watch_areas: [{ text: "NRR below top quartile (108% vs. 119%)", sources: [id("nrr").data_point_id, id("nrr").benchmark_row_id] }],
    priority: { text: "Shorten the sales cycle before hiring.", sources: [id("sales_cycle_days").data_point_id] },
    missing_inputs: [],
  };
};
const passAll = async () => ({
  results: Object.fromEntries(["data_consistency", "benchmark_methodology", "source_trail", "recommendation_logic", "missing_inputs"].map((k) => [k, { result: "pass" as const, note: "ok" }])) as never,
  model: "qa-model",
  tokensIn: 1,
  tokensOut: 1,
});
const deps = { draft: async (i: DraftInput) => ({ output: goodDraft(i), model: "draft-model", tokensIn: 10, tokensOut: 5 }), qa: passAll };

describe("pipeline", () => {
  it("drafts from accepted data and approved rows only, then QA puts it in review", async () => {
    const d = (await createBenchmarkVersion(acme))!;
    expect(await createBenchmarkVersion(acme)).toBeNull(); // one at a time
    expect(await founderBenchmarkStatus(acme.id)).toMatchObject({ status: "drafting", hasPublished: false });
    await runBenchmarkPipeline(d.id, null, deps);

    expect(seenInput!.cohort.name).toBe("Series A founder-led");
    expect(seenInput!.comparison.map((c) => c.metric).sort()).toEqual(["arr_growth", "nrr", "sales_cycle_days", "win_rate"]);
    expect(seenInput!.comparison.find((c) => c.metric === "sales_cycle_days")).toMatchObject({ company_value: "94d", cohort_top_quartile: "61d", status_vs_top_quartile: "behind" });
    expect(seenInput!.other_company_data.map((o) => o.metric)).toEqual(["ae_productivity"]);
    expect(seenInput!.cohort.methodology).toMatch(/Matched on stage \(Series A\)/);

    const after = (await getDeliverable(d.id))!;
    expect(after.status).toBe("in_review");
    expect(after.headline).toBe("Strong growth; sales cycle is the gap.");
    const [review] = await db().select().from(schema.reviews).where(eq(schema.reviews.deliverableId, d.id));
    expect(review!.qaResults!.data_consistency.result).toBe("pass");
    const runs = await deliverableRuns(d.id);
    expect(runs.map((r) => `${r.agent}:${r.status}`).sort()).toEqual(["draft:succeeded", "qa:succeeded"]);

    // Staff preview renders every row with its sources; the founder sees nothing until publish.
    const view = (await benchmarkViewFor(after))!;
    expect(view.rows.map((r) => r.metric).sort()).toEqual(["arr_growth", "nrr", "sales_cycle_days", "win_rate"]);
    expect(view.claims["row.nrr"]!.sources.map((s) => s.kind)).toEqual(["data_point", "benchmark_metric", "methodology"]);
    expect(view.claims["insight"]!.sources).toHaveLength(2);
    expect(await getPublishedBenchmark(acme.id)).toBeNull();
  });

  it("fails QA in code when the draft states a figure that isn't in the inputs", async () => {
    const d = (await createBenchmarkVersion(acme))!;
    await runBenchmarkPipeline(d.id, null, {
      draft: async (i) => {
        const out = goodDraft(i);
        out.watch_areas.push({ text: "CAC payback is 31 months", sources: ["not-an-id"] });
        return { output: out, model: "m", tokensIn: 1, tokensOut: 1 };
      },
      qa: passAll,
    });
    const [review] = await db().select().from(schema.reviews).where(eq(schema.reviews.deliverableId, d.id));
    expect(review!.qaResults!.data_consistency).toMatchObject({ result: "fail", note: expect.stringMatching(/31 months/) });
    expect(review!.qaResults!.source_trail.result).toBe("fail");
  });

  it("marks the version failed when no approved cohort fits, and when the model fails", async () => {
    await db().update(schema.benchmarkMetrics).set({ status: "retired" }).where(eq(schema.benchmarkMetrics.sourceId, (await db().select().from(schema.benchmarkSources))[0]!.id));
    const d = (await createBenchmarkVersion(acme))!;
    await runBenchmarkPipeline(d.id, null, deps);
    expect((await getDeliverable(d.id))!.status).toBe("failed");
    expect((await deliverableRuns(d.id))[0]!.error).toMatch(/No approved benchmark cohort/);

    await db().update(schema.benchmarkMetrics).set({ status: "approved" }).where(eq(schema.benchmarkMetrics.id, bm.nrr!));
    const d2 = (await createBenchmarkVersion(acme))!;
    await runBenchmarkPipeline(d2.id, null, { draft: async () => { throw new DraftError("The Draft Agent returned invalid output twice."); }, qa: passAll });
    expect((await getDeliverable(d2.id))!.status).toBe("failed");
    expect((await deliverableRuns(d2.id))[0]!.error).toBe("The Draft Agent returned invalid output twice.");
    expect(sampleCohortId).toBeTruthy();
  });
});

describe("advisor gate", () => {
  async function inReview() {
    const d = (await createBenchmarkVersion(acme))!;
    await runBenchmarkPipeline(d.id, null, deps);
    return d.id;
  }

  it("approve then publish makes it visible to the founder", async () => {
    const id = await inReview();
    expect((await publishDeliverable(advisor, acme, id)).ok).toBe(false); // must approve first
    expect(await approveDeliverable(advisor, acme, id, "Looks right.")).toEqual({ ok: true });
    expect(await getPublishedBenchmark(acme.id)).toBeNull();
    expect(await publishDeliverable(advisor, acme, id)).toEqual({ ok: true });
    const published = (await getPublishedBenchmark(acme.id))!;
    expect(published.headline).toBe("Strong growth; sales cycle is the gap.");
    expect(published.approval).toMatchObject({ comment: "Looks right." });
    const [company] = await db().select().from(schema.companies).where(eq(schema.companies.id, acme.id));
    expect(company!.phase).toBe("baseline");
    const events = await db().select().from(schema.events);
    expect(events.map((e) => e.name).sort()).toEqual(["deliverable_published", "review_decision"]);
  });

  it("send back creates a new draft run with the advisor's comment", async () => {
    const id = await inReview();
    const r = await sendBackDeliverable(advisor, acme, id, "Mention win rate as a strength.");
    if (!r.ok || !r.newId) throw new Error("expected new version");
    expect((await getDeliverable(id))!.status).toBe("changes_requested");
    await runBenchmarkPipeline(r.newId, "Mention win rate as a strength.", deps);
    expect(seenInput!.advisor_feedback).toBe("Mention win rate as a strength.");
    expect((await getDeliverable(r.newId))!).toMatchObject({ status: "in_review", version: 2 });
  });

  it("edits become a new version that is QA'd again, with sources kept", async () => {
    const id = await inReview();
    const r = await editDeliverable(
      advisor,
      acme,
      id,
      {
        headline: "Edited headline",
        insightHeadline: "Sales cycle is the constraint.",
        insightBody: "At 94d you are well behind the top quartile (61d).",
        strengths: ["Growth well above median (72%)"],
        watchAreas: ["NRR trails the top quartile and is 45% short"],
        priority: "Fix the sales cycle first.",
      },
      "Tightened wording",
    );
    if (!r.ok || !r.newId) throw new Error("expected new version");
    expect((await getDeliverable(r.newId))!).toMatchObject({ status: "qa", version: 2, headline: "Edited headline" });
    await runQaForVersion(r.newId, { qa: passAll });
    const v2 = (await getDeliverable(r.newId))!;
    expect(v2.status).toBe("in_review");
    const [review] = await db().select().from(schema.reviews).where(eq(schema.reviews.deliverableId, r.newId));
    // "45%" isn't an input figure or gap: the code check catches the advisor's edit too.
    expect(review!.qaResults!.data_consistency).toMatchObject({ result: "fail", note: expect.stringMatching(/45%/) });
    const view = (await benchmarkViewFor(v2))!;
    expect(view.claims["strength.1"]).toMatchObject({ text: "Growth well above median (72%)" });
    expect(view.claims["strength.1"]!.sources.length).toBe(2);
  });

  it("refuses decisions on another company's deliverable", async () => {
    const id = await inReview();
    const [other] = (await db().insert(schema.companies).values({ name: "Other" }).returning()) as [Company];
    expect((await approveDeliverable(advisor, other, id, null)).ok).toBe(false);
  });
});
