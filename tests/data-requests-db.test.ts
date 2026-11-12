/** Advisor data requests (emailed with an upload link, answered by the next file) and typed-in business updates (PGlite; email stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, emails: [] as { to: string; subject: string; text: string }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/email", async (original) => {
  const actual = await original<typeof import("@/lib/email")>();
  return { ...actual, sendEmail: async (m: { to: string; subject: string; text: string }) => (h.emails.push(m), { sent: true }) };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { answerDataRequests, createDataRequest, deleteDataRequest, listDataRequests, setCurrentPlan } from "@/lib/data/data-requests";
import { addBusinessUpdate, businessMetrics, clearBusinessUpdate, setBusinessUpdateDate } from "@/lib/data/business-metrics";
import { currentPlan } from "@/lib/data/current-plan";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User, teammate: User, advisor: User;
let co: Company;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  h.emails.length = 0;
  for (const t of [schema.dataRequests, schema.dataPoints, schema.companyMembers, schema.events, schema.companies, schema.invites, schema.users]) await db().delete(t);
  [founder, teammate, advisor] = (await db()
    .insert(schema.users)
    .values([
      { email: "f@co.test", authUserId: "f", role: "founder", name: "Fran" },
      { email: "t@co.test", authUserId: "t", role: "founder" },
      { email: "a@gg.test", authUserId: "a", role: "advisor", name: "Ryan" },
    ])
    .returning()) as [User, User, User];
  [co] = (await db().insert(schema.companies).values({ name: "FastenHealth", advisorId: advisor.id }).returning()) as [Company];
  await db().insert(schema.companyMembers).values([
    { companyId: co.id, userId: founder.id, memberRole: "owner" },
    { companyId: co.id, userId: teammate.id, memberRole: "member" },
  ]);
});

describe("data requests", () => {
  it("emails everyone at the company a link straight to the upload page", async () => {
    const r = await createDataRequest(advisor, co, { items: ["Retention or churn figures"], message: "For Thursday's review" }, "https://app.test");
    expect(r).toEqual({ ok: true, emailed: 2, recipients: 2 });
    expect(h.emails.map((e) => e.to).sort()).toEqual(["f@co.test", "t@co.test"]);
    expect(h.emails[0]!.subject).toBe("Ryan asked FastenHealth for an update");
    const [req] = await listDataRequests(co.id, { open: true });
    expect(h.emails[0]!.text).toContain(`https://app.test/sign-in?next=${encodeURIComponent(`/performance?request=${req!.id}#upload`)}`);
    expect(h.emails[0]!.text).toContain("Retention or churn figures");
  });

  it("can be deleted one at a time or all at once, only within the company", async () => {
    await createDataRequest(advisor, co, { items: ["Pipeline or CRM export"], message: null }, "https://app.test");
    await createDataRequest(advisor, co, { items: ["Updated financial model"], message: null }, "https://app.test");
    const [first] = await listDataRequests(co.id);
    const [stranger] = (await db().insert(schema.companies).values({ name: "Stranger" }).returning()) as [Company];
    expect(await deleteDataRequest(stranger, first!.id)).toBe(0);
    expect(await deleteDataRequest(co, first!.id)).toBe(1);
    expect(await listDataRequests(co.id)).toHaveLength(1);
    expect(await deleteDataRequest(co, "all")).toBe(1);
    expect(await listDataRequests(co.id)).toEqual([]);
  });

  it("needs something to ask for", async () => {
    expect(await createDataRequest(advisor, co, { items: [" "], message: "" }, "https://app.test")).toEqual({ ok: false, error: "Say what you need: tick an item or write a note." });
  });

  it("is answered by the next file, and the advisor hears about it", async () => {
    await createDataRequest(advisor, co, { items: ["Pipeline or CRM export"], message: null }, "https://app.test");
    h.emails.length = 0;
    expect(await answerDataRequests(founder, co, "pipeline.csv", "https://app.test")).toBe(1);
    expect(await listDataRequests(co.id, { open: true })).toEqual([]);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]).toMatchObject({ to: "a@gg.test", subject: "FastenHealth shared an update" });
    expect(h.emails[0]!.text).toContain(`https://app.test/advisor/companies/${co.id}/documents`);
    // Nothing open: no email.
    expect(await answerDataRequests(founder, co, "more.csv", "https://app.test")).toBe(0);
    expect(h.emails).toHaveLength(1);
  });
});

describe("current plan", () => {
  it("is the advisor's name for it, and nothing until there is one", async () => {
    expect(await currentPlan(co)).toBeNull();
    await setCurrentPlan(co, "  Sales Hiring ");
    const [fresh] = await db().select().from(schema.companies).where(eq(schema.companies.id, co.id));
    expect(await currentPlan(fresh!)).toEqual({ name: "Sales Hiring", plan: null, progress: null });
  });
});

describe("typed-in business updates", () => {
  it("keeps revenue as ARR, works out growth from the month before, and dates every update", async () => {
    expect(await addBusinessUpdate(founder, co, { period: "2026-09", mrr: 80_000, retention: null })).toEqual({ ok: true });
    expect(await addBusinessUpdate(founder, co, { period: "2026-10", mrr: 86_000, retention: 104 })).toEqual({ ok: true });
    const m = await businessMetrics(co);
    expect(m.latest.revenue).toMatchObject({ value: 1_032_000, period: "2026-10", previous: { value: 960_000 } });
    expect(m.latest.growth).toMatchObject({ value: 7.5 });
    expect(m.latest.retention).toMatchObject({ value: 104 });
    expect(m.updates.length).toBeGreaterThanOrEqual(1);
  });

  it("lets the advisor clear one update, or all of them", async () => {
    await addBusinessUpdate(founder, co, { period: "2026-09", mrr: 80_000, retention: null });
    await new Promise((r) => setTimeout(r, 5));
    await addBusinessUpdate(founder, co, { period: "2026-10", mrr: 86_000, retention: 104 });
    const before = await businessMetrics(co);
    expect(before.updates).toHaveLength(2);
    expect(await clearBusinessUpdate(advisor, co, before.updates[0]!.key)).toBe(3);
    const after = await businessMetrics(co);
    expect(after.latest.revenue).toMatchObject({ value: 960_000 });
    expect(after.latest.retention).toBeNull();
    expect(await clearBusinessUpdate(advisor, co, "all")).toBe(1);
    expect((await businessMetrics(co)).updates).toEqual([]);
    expect(await clearBusinessUpdate(advisor, co, "nonsense")).toBe(0);
  });

  it("lets an admin change the date an update was entered", async () => {
    await addBusinessUpdate(founder, co, { period: "2026-09", mrr: 80_000, retention: null });
    await new Promise((r) => setTimeout(r, 5));
    await addBusinessUpdate(founder, co, { period: "2026-10", mrr: 86_000, retention: 104 });
    const [latest, earlier] = (await businessMetrics(co)).updates;
    expect(await setBusinessUpdateDate(co, earlier!.key, "2026-10-01")).toEqual({ ok: true });
    expect(await setBusinessUpdateDate(co, latest!.key, "2026-11-02")).toEqual({ ok: true });
    const m = await businessMetrics(co);
    expect(m.updates.map((u) => u.at.toISOString().slice(0, 10))).toEqual(["2026-11-02", "2026-10-01"]);
    expect(m.latest.revenue).toMatchObject({ value: 1_032_000, previous: { value: 960_000 } });
    expect(m.latest.revenue!.previous!.at.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(await setBusinessUpdateDate(co, m.updates[0]!.key, "2999-01-01")).toEqual({ ok: false, error: "The date can't be in the future." });
    expect(await setBusinessUpdateDate(co, m.updates[0]!.key, "not a date")).toEqual({ ok: false, error: "Pick a valid date." });
    expect(await setBusinessUpdateDate(co, "all", "2026-10-01")).toEqual({ ok: false, error: "Pick one update." });
    const [stranger] = (await db().insert(schema.companies).values({ name: "Elsewhere" }).returning()) as [Company];
    expect(await setBusinessUpdateDate(stranger, m.updates[0]!.key, "2026-10-01")).toEqual({ ok: false, error: "That update wasn't found." });
  });

  it("checks what's typed", async () => {
    expect(await addBusinessUpdate(founder, co, { period: "2026-13", mrr: 1, retention: null })).toMatchObject({ ok: false });
    expect(await addBusinessUpdate(founder, co, { period: "2026-10", mrr: null, retention: null })).toMatchObject({ ok: false });
    expect(await addBusinessUpdate(founder, co, { period: "2026-10", mrr: null, retention: 900 })).toMatchObject({ ok: false });
  });
});
