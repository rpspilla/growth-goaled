/** Benchmark library against a real Postgres (PGlite) with the committed migrations. The model is stubbed. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { ResearchError, type ResearchResult } from "@/lib/ai/research";
import {
  createCohort,
  discardProposedMetric,
  importBenchmarkCsv,
  latestResearchRun,
  listCohortMetrics,
  runResearch,
  setMetricStatus,
  startResearch,
} from "@/lib/data/benchmarks";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;

let advisor: User;
let founder: User;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  await db().delete(schema.agentRuns);
  await db().delete(schema.benchmarkMetrics);
  await db().delete(schema.benchmarkSources);
  await db().delete(schema.benchmarkCohorts);
  await db().delete(schema.users);
  [advisor, founder] = (await db()
    .insert(schema.users)
    .values([
      { email: "ana@gg.test", authUserId: "a1", role: "advisor" },
      { email: "maya@acme.test", authUserId: "a2", role: "founder" },
    ])
    .returning()) as [User, User];
});

const cohortInput = { name: "Series A B2B SaaS", stage: ["Series A"], arr_min: 2_000_000, arr_max: 10_000_000, model: "B2B SaaS" };
const source = { name: "Portfolio survey Q3 2026", year: 2026 };
const CSV = "metric,p25,median,top_quartile,sample_size,period\nnrr,95,104,119,40,2026\nsales_cycle_days,110,78,61,40,2026\nwin_rate,30,20,10,,\n";

describe("CSV import", () => {
  it("imports valid rows as proposed with one advisory source", async () => {
    const cohort = (await createCohort(advisor, cohortInput))!;
    expect(cohort.criteria).toEqual({ stage: ["Series A"], arr_min: 2_000_000, arr_max: 10_000_000, model: "B2B SaaS" });
    const result = await importBenchmarkCsv(advisor, cohort.id, CSV, source);
    expect(result).toMatchObject({ ok: true, imported: 2, errors: [{ line: 4 }] });
    const rows = await listCohortMetrics(cohort.id);
    expect(rows.every((r) => r.status === "proposed" && r.source?.type === "advisory" && r.source.name === source.name)).toBe(true);
  });

  it("refuses founders and sample cohorts", async () => {
    const cohort = (await createCohort(advisor, cohortInput))!;
    expect((await importBenchmarkCsv(founder, cohort.id, CSV, source)).ok).toBe(false);
    expect(await createCohort(founder, cohortInput)).toBeNull();
    const [sample] = await db().insert(schema.benchmarkCohorts).values({ name: "Sample", criteria: {}, isSample: true }).returning();
    expect((await importBenchmarkCsv(advisor, sample!.id, CSV, source)).ok).toBe(false);
  });
});

describe("approval", () => {
  it("approves, retires, and keeps one approved row per metric and period", async () => {
    const cohort = (await createCohort(advisor, cohortInput))!;
    await importBenchmarkCsv(advisor, cohort.id, CSV, source);
    await importBenchmarkCsv(advisor, cohort.id, "metric,p25,median,top_quartile,sample_size,period\nnrr,97,106,121,55,2026\n", { name: "Second survey" });
    const nrr = (await listCohortMetrics(cohort.id)).filter((r) => r.metric === "nrr");
    expect(nrr).toHaveLength(2);
    expect(await setMetricStatus(advisor, nrr[0]!.id, "approved")).toEqual({ ok: true });
    expect(await setMetricStatus(advisor, nrr[1]!.id, "approved")).toEqual({ ok: true });
    const after = await listCohortMetrics(cohort.id);
    const statuses = Object.fromEntries(after.filter((r) => r.metric === "nrr").map((r) => [r.id, r.status]));
    expect(statuses).toEqual({ [nrr[0]!.id]: "retired", [nrr[1]!.id]: "approved" });
    expect(after.find((r) => r.id === nrr[1]!.id)!.approvedBy).toBe(advisor.id);
    expect(await setMetricStatus(founder, nrr[1]!.id, "retired")).toMatchObject({ ok: false });
  });

  it("won't approve a row without a source or with quartiles out of order", async () => {
    const cohort = (await createCohort(advisor, cohortInput))!;
    const [noSource] = await db().insert(schema.benchmarkMetrics).values({ cohortId: cohort.id, metric: "nrr", median: 100 }).returning();
    expect(await setMetricStatus(advisor, noSource!.id, "approved")).toMatchObject({ ok: false, error: expect.stringMatching(/source/) });
    const [src] = await db().insert(schema.benchmarkSources).values({ name: "S", type: "public" }).returning();
    const [bad] = await db().insert(schema.benchmarkMetrics).values({ cohortId: cohort.id, metric: "nrr", p25: 120, median: 100, sourceId: src!.id }).returning();
    expect((await setMetricStatus(advisor, bad!.id, "approved")).ok).toBe(false);
  });

  it("discards only proposed rows", async () => {
    const cohort = (await createCohort(advisor, cohortInput))!;
    await importBenchmarkCsv(advisor, cohort.id, CSV, source);
    const [a, b] = await listCohortMetrics(cohort.id);
    await setMetricStatus(advisor, a!.id, "approved");
    expect(await discardProposedMetric(advisor, a!.id)).toBe(false);
    expect(await discardProposedMetric(advisor, b!.id)).toBe(true);
    expect(await discardProposedMetric(founder, a!.id)).toBe(false);
    expect(await listCohortMetrics(cohort.id)).toHaveLength(1);
  });
});

describe("public research run", () => {
  const result: ResearchResult = {
    output: {
      sources: [{ name: "SaaS Survey 2026", publisher: "KeyBanc", url: "https://example.com/report", year: 2026, sample_description: "300 companies" }],
      metrics: [
        { metric: "nrr", p25: 95, median: 104, top_quartile: 115, sample_size: 300, period: "2025", source_index: 0, basis: "$5–20M ARR" },
        { metric: "cac_payback_months", p25: 10, median: 15, top_quartile: 24, sample_size: null, period: null, source_index: 0, basis: "all" },
      ],
      not_found: ["magic_number"],
    },
    searchedUrls: ["https://example.com/report"],
    dropped: [],
    model: "test-model",
    tokensIn: 100,
    tokensOut: 50,
  };

  it("stores public sources and proposed rows, and logs the run", async () => {
    const cohort = (await createCohort(advisor, cohortInput))!;
    const started = await startResearch(advisor, cohort.id);
    if (!("runId" in started)) throw new Error("expected a run");
    expect(await startResearch(advisor, cohort.id)).toEqual({ error: expect.stringMatching(/already running/) });
    await runResearch(started.runId, async () => result);

    const rows = await listCohortMetrics(cohort.id);
    expect(rows.map((r) => r.metric)).toEqual(["nrr"]); // CAC payback quartiles were in the wrong order for lower-is-better
    expect(rows[0]).toMatchObject({ status: "proposed", p75: 115, sampleSize: 300, source: { type: "public", url: "https://example.com/report" } });
    const run = (await latestResearchRun(cohort.id))!;
    expect(run).toMatchObject({ status: "succeeded", agent: "research", tokensIn: 100, startedBy: advisor.id });
    expect((run.output as { rejected: string[] }).rejected.join(" ")).toMatch(/cac_payback_months/);
  });

  it("records a failed run with its reason", async () => {
    const cohort = (await createCohort(advisor, cohortInput))!;
    const started = await startResearch(advisor, cohort.id);
    if (!("runId" in started)) throw new Error("expected a run");
    await runResearch(started.runId, async () => {
      throw new ResearchError("The research returned invalid data.");
    });
    expect(await latestResearchRun(cohort.id)).toMatchObject({ status: "failed", error: "The research returned invalid data." });
    expect(await listCohortMetrics(cohort.id)).toEqual([]);
    const [r] = await db().select().from(schema.agentRuns).where(eq(schema.agentRuns.id, started.runId));
    expect(r!.durationMs).not.toBeNull();
  });
});
