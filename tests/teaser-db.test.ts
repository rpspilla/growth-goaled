/** The free teaser verdict from the key file, before payment, against Postgres (PGlite). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { teaserVerdict } from "@/lib/data/teaser";
import type { FileAnalysis } from "@/lib/metrics-engine";
import { getUseCase } from "@/lib/use-cases";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let co: Company;
const leak = getUseCase("growth_leak")!;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.dataPoints, schema.documents, schema.companies]) await db().delete(t);
  [co] = (await db().insert(schema.companies).values({ name: "Teaser Co" }).returning()) as [Company];
});

// A year where churn and contraction take a large share of starting ARR.
const analysis: FileAnalysis = {
  metrics: [],
  warnings: [],
  bridge: { from: "2025-09", to: "2026-09", startArr: 1_000_000, newArr: 150_000, expansionArr: 20_000, contractionArr: 60_000, churnedArr: 240_000, endArr: 870_000, customersStart: 40, customersEnd: 36, customersNew: 6, customersChurned: 10 },
  monthly: [
    { month: "2026-07", mrr: 74_000 },
    { month: "2026-08", mrr: 73_000 },
    { month: "2026-09", mrr: 72_500 },
  ],
};

async function keyFile(status: "uploaded" | "done" | "failed", withAnalysis = true) {
  const [doc] = await db()
    .insert(schema.documents)
    .values({ companyId: co.id, docType: "other", blobUrl: "x", filename: "mrr.csv", mime: "text/csv", size: 1, status, dataItemKeys: ["revenue_by_customer", "monthly_revenue", "churned_revenue"], analysis: withAnalysis ? analysis : null })
    .returning();
  return doc!;
}

describe("teaser verdict", () => {
  it("asks for the key file until one is uploaded, then says it's being read", async () => {
    expect(await teaserVerdict(co, leak)).toEqual({ state: "no_file" });
    await keyFile("uploaded", false);
    expect(await teaserVerdict(co, leak)).toEqual({ state: "reading", filename: "mrr.csv" });
  });

  it("says when the file couldn't be read", async () => {
    await keyFile("failed", false);
    expect(await teaserVerdict(co, leak)).toMatchObject({ state: "unreadable", filename: "mrr.csv" });
  });

  it("names the leading constraint and shows real figures from the file, with charts to blur", async () => {
    const doc = await keyFile("done");
    const point = (metric: string, value: number, unit: string) => ({ companyId: co.id, metric, value, unit, confidence: "high" as const, status: "proposed" as const, origin: "calculated" as const, documentId: doc.id, period: "Sep 2025 – Sep 2026" });
    await db()
      .insert(schema.dataPoints)
      .values([point("nrr", 72, "percent"), point("grr", 70, "percent"), point("churned_arr", 240_000, "usd"), point("new_arr", 150_000, "usd")]);
    const t = await teaserVerdict(co, leak);
    if (t.state !== "ready") throw new Error(`expected ready, got ${t.state}`);
    expect(t.headline).toMatch(/Revenue lost from existing customers/);
    expect(t.certainty).not.toBe("unresolved");
    expect(t.figures.map((f) => [f.label, f.value])).toEqual([
      ["NRR", "72%"],
      ["Gross Retention", "70%"],
      ["New ARR", "$150K"],
    ]);
    expect(t.charts.bridge).toMatchObject({ startArr: 1_000_000, churnedArr: 240_000, source: "mrr.csv" });
  });

  it("has nothing to tease for a question without a key file", async () => {
    expect(await teaserVerdict(co, getUseCase("series_a_ready")!)).toEqual({ state: "no_file" });
  });
});
