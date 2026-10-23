/** Portfolio rows and counts against Postgres (PGlite). */
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
import { portfolioCounts, portfolioRows, saveAdvisorSummary, setHealth } from "@/lib/data/portfolio";
import { updateDataItem } from "@/lib/data/readiness";

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
  await db().delete(schema.companies);
  await db().delete(schema.users);
  [advisor, founder] = (await db()
    .insert(schema.users)
    .values([
      { email: "ana@gg.test", authUserId: "a1", role: "advisor" },
      { email: "maya@acme.test", authUserId: "a2", role: "founder" },
    ])
    .returning()) as [User, User];
});

describe("portfolio", () => {
  it("builds rows from accepted data, registers and benchmark status", async () => {
    const [acme, beta, done] = (await db()
      .insert(schema.companies)
      .values([
        { name: "Acme", phase: "benchmark", arr: 1_000_000, advisorId: advisor.id },
        { name: "Beta", phase: "upload", health: "critical", advisorId: advisor.id },
        { name: "Done", phase: "complete", advisorId: advisor.id },
      ])
      .returning()) as [Company, Company, Company];
    await db().insert(schema.dataPoints).values([
      { companyId: acme.id, metric: "arr", value: 4_200_000, unit: "usd", confidence: "high", status: "accepted" },
      { companyId: acme.id, metric: "arr_growth", value: 900, unit: "percent", confidence: "low", status: "proposed" },
    ]);
    await db().insert(schema.registerItems).values([
      { companyId: acme.id, type: "conflict", title: "Conflict", owner: "founder" },
      { companyId: beta.id, type: "question", title: "Q", owner: "founder" },
      { companyId: beta.id, type: "follow_up", title: "Internal", owner: "advisor" },
    ]);
    await db().insert(schema.deliverables).values({ companyId: acme.id, type: "benchmark", version: 1, status: "in_review" });
    await updateDataItem(founder, beta, "monthly_revenue", { status: "available" });

    const rows = await portfolioRows([acme, beta, done]);
    const acmeRow = rows.find((r) => r.id === acme.id)!;
    expect(acmeRow).toMatchObject({ arr: 4_200_000, growth: null, benchmarkStatus: "in_review", openQuestions: 1, openConflicts: 1 });
    expect(acmeRow.attention).toEqual(["Benchmark ready for review", "1 data conflict"]);
    const betaRow = rows.find((r) => r.id === beta.id)!;
    expect(betaRow.openQuestions).toBe(1); // advisor-owned items aren't founder questions
    expect(betaRow.readinessPercent).toBeGreaterThan(0);
    expect(betaRow.attention).toEqual(["Health: at risk"]);
    expect(portfolioCounts(rows)).toEqual({ active: 2, attention: 2, awaitingFounder: 2, inReview: 1, complete: 1 });
  });

  it("only staff set health and the advisor summary", async () => {
    const [acme] = (await db().insert(schema.companies).values({ name: "Acme" }).returning()) as [Company];
    expect(await setHealth(founder, acme, "good")).toBe(false);
    expect(await saveAdvisorSummary(founder, acme, "x")).toBe(false);
    expect(await setHealth(advisor, acme, "watch")).toBe(true);
    expect(await saveAdvisorSummary(advisor, acme, "  Sales efficiency is the constraint.  ")).toBe(true);
    const [row] = await db().select().from(schema.companies).where(eq(schema.companies.id, acme.id));
    expect(row).toMatchObject({ health: "watch", advisorSummary: "Sales efficiency is the constraint.", advisorSummaryBy: advisor.id });
    await saveAdvisorSummary(advisor, acme, "");
    const [cleared] = await db().select().from(schema.companies).where(eq(schema.companies.id, acme.id));
    expect(cleared).toMatchObject({ advisorSummary: null, advisorSummaryAt: null });
  });
});
