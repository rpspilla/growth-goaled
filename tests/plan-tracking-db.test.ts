/** Execute & Monitor in the database: owners and deadlines, targets, logged live time; approval dates milestones (PGlite). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/email", () => ({ sendEmail: async () => ({ sent: true }) }));

import { schema } from "@/lib/db";
import type { ActionPlanContent, Company, User } from "@/lib/db/schema";
import { approvePlan, logPlanSession, planSessionsFor, setPlanTargets, updateStep } from "@/lib/data/action-plans";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User, advisor: User;
let co: Company, other: Company;
const content: ActionPlanContent = { goal: "g", summary: "s", days30: [{ action: "Audit deals", owner: "Founder", measure: "m" }], days60: [{ action: "Hire", owner: "Founder", measure: "m" }], days90: [], risks: [], assumptions: [] };

async function plan(company: Company, tier: "plan" | "supported", status: "active" | "delivered" | "in_review") {
  const [conv] = await db().insert(schema.conversations).values({ companyId: company.id, userId: founder.id, topic: "other", title: "t" }).returning();
  const [p] = await db().insert(schema.actionPlans).values({ companyId: company.id, conversationId: conv!.id, topic: "other", tier, status, content, createdBy: founder.id }).returning();
  return p!;
}
const read = async (id: string) => (await db().select().from(schema.actionPlans).where(eq(schema.actionPlans.id, id)))[0]!;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.planSessions, schema.actionPlans, schema.conversations, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder, advisor] = (await db().insert(schema.users).values([{ email: "f@co.test", authUserId: "f", role: "founder" }, { email: "a@gg.test", authUserId: "a", role: "advisor" }]).returning()) as [User, User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Co", advisorId: advisor.id }, { name: "Other" }]).returning()) as [Company, Company];
});

describe("owners and deadlines", () => {
  it("can be changed on a live plan of the company's own", async () => {
    const p = await plan(co, "supported", "active");
    expect(await updateStep(co, p.id, "days30", 0, { owner: "Head of Sales", due: "2026-12-15" })).toEqual({ ok: true });
    expect((await read(p.id)).content!.days30[0]).toMatchObject({ owner: "Head of Sales", due: "2026-12-15" });
    expect(await updateStep(co, p.id, "days30", 0, { owner: "Head of Sales", due: null })).toEqual({ ok: true });
    expect((await read(p.id)).content!.days30[0]!.due).toBeUndefined();
  });
  it("are refused on other companies' plans, finished plans, and bad input", async () => {
    const p = await plan(co, "supported", "active");
    const delivered = await plan(co, "plan", "delivered");
    expect((await updateStep(other, p.id, "days30", 0, { owner: "X", due: null })).ok).toBe(false);
    expect((await updateStep(co, delivered.id, "days30", 0, { owner: "X", due: null })).ok).toBe(false);
    expect((await updateStep(co, p.id, "days30", 5, { owner: "X", due: null })).ok).toBe(false);
    expect((await updateStep(co, p.id, "days30", 0, { owner: " ", due: null })).ok).toBe(false);
    expect((await updateStep(co, p.id, "days30", 0, { owner: "X", due: "next week" })).ok).toBe(false);
  });
  it("are set from approval for a Diagnose plan's milestones", async () => {
    const p = await plan(co, "plan", "in_review");
    expect(await approvePlan(advisor, co, p.id, content, null, "https://app.test")).toEqual({ ok: true });
    const dues = (await read(p.id)).content!;
    expect(dues.days30[0]!.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dues.days60[0]!.due! > dues.days30[0]!.due!).toBe(true);
  });
});

describe("targets", () => {
  it("are saved on a live plan only, validated", async () => {
    const p = await plan(co, "supported", "active");
    expect(await setPlanTargets(co, p.id, [{ metric: "win_rate", target: 25, by: "2027-02-01" }])).toEqual({ ok: true });
    expect((await read(p.id)).content!.targets).toEqual([{ metric: "win_rate", target: 25, by: "2027-02-01" }]);
    expect((await setPlanTargets(co, p.id, [{ metric: "nope", target: 1 }])).ok).toBe(false);
    expect((await setPlanTargets(other, p.id, [])).ok).toBe(false);
  });
});

describe("live time", () => {
  it("advisors log reviews and support on live Execute & Monitor plans", async () => {
    const p = await plan(co, "supported", "active");
    const diagnose = await plan(co, "plan", "delivered");
    const today = new Date().toISOString().slice(0, 10);
    expect(await logPlanSession(advisor, co, p.id, { kind: "support", minutes: 45, heldOn: today, note: "Pipeline review" })).toEqual({ ok: true });
    expect((await logPlanSession(founder, co, p.id, { kind: "support", minutes: 45, heldOn: today, note: "" })).ok).toBe(false);
    expect((await logPlanSession(advisor, co, diagnose.id, { kind: "support", minutes: 45, heldOn: today, note: "" })).ok).toBe(false);
    expect((await logPlanSession(advisor, co, p.id, { kind: "support", minutes: 2, heldOn: today, note: "" })).ok).toBe(false);
    expect((await logPlanSession(advisor, co, p.id, { kind: "review", minutes: 30, heldOn: "2999-01-01", note: "" })).ok).toBe(false);
    expect((await logPlanSession(advisor, other, p.id, { kind: "review", minutes: 30, heldOn: today, note: "" })).ok).toBe(false);
    expect((await planSessionsFor(p.id)).map((s) => [s.kind, s.minutes, s.note])).toEqual([["support", 45, "Pipeline review"]]);
  });
});
