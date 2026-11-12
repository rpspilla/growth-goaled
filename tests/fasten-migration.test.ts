/** Migration 0034 (Fasten Health's Growth Hiring Plan → the six inputs): all or nothing, only that plan, safe to re-run. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const CO = "6d3e9e72-cab2-4fc8-9eb5-77e027ea7f95";
const CU = "670acb4e-213a-463f-92c2-b32a83452e6e";
const D = "e0820161-51fc-4798-aedc-d22677a233cd";
const SQL = readFileSync("drizzle/0034_fasten_hiring_plan.sql", "utf8").split("--> statement-breakpoint");
let pg: PGlite;

beforeEach(async () => {
  pg = new PGlite();
  // Migrations run first (0034 finds nothing to do), then Fasten's plan as it is in production.
  await migrate(drizzle(pg), { migrationsFolder: "drizzle" });
  await pg.query(`insert into companies (id, name, revenue_band) values ($1, 'FastenHealth', '1m_3m'), ('00000000-0000-4000-8000-000000000001', 'Other', '1m_3m')`, [CO]);
  await pg.query(`insert into company_use_cases (id, company_id, use_case) values ($1, $2, 'hire_or_fix')`, [CU, CO]);
  await pg.query(`insert into deliverables (id, company_id, type, use_case, status) values ($1, $2, 'baseline', 'hire_or_fix', 'in_review')`, [D, CO]);
  for (let i = 1; i <= 7; i++) await pg.query(`insert into plan_actions (company_id, company_use_case_id, deliverable_id, priority, action, timing) values ($1,$2,$3,$4,$5,'next_30_days')`, [CO, CU, D, i, `Old ${i}`]);
}, 60_000);

const run = async () => {
  for (const s of SQL) await pg.exec(s);
};
const rows = async () => (await pg.query<{ priority: number; assignee: string; action: string; fields: number }>(`select priority, assignee, action, coalesce(jsonb_array_length(request->'fields'), 0) as fields from plan_actions order by priority`)).rows;

describe("migration 0034: Fasten Health's hiring plan", () => {
  it("becomes the six founder inputs and four Growth Goaled tasks, once", async () => {
    await run();
    const after = await rows();
    expect(after.map((r) => [r.priority, r.assignee])).toEqual([1, 2, 3, 4, 5, 6].map((p) => [p, "founder"]).concat([7, 8, 9, 10].map((p) => [p, "growth_goaled"])));
    expect(after.slice(0, 6).every((r) => r.fields > 0)).toBe(true);
    expect(after[0]!.action).toBe("Enter your conversion rate for founder-owned deals and for AE-owned deals.");
    await run();
    expect(await rows()).toHaveLength(10);
  });

  it("changes nothing if any item was touched", async () => {
    await pg.query(`update plan_actions set note = 'Started' where priority = 3`);
    await run();
    expect((await rows()).map((r) => r.action)).toEqual([1, 2, 3, 4, 5, 6, 7].map((i) => `Old ${i}`));
  });
});
