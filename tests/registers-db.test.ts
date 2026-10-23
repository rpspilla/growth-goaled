/** Questions and registers against a real Postgres (PGlite) with the committed migrations. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { closeWithNote, createRegisterItem, listRegisterItems, reopenRegisterItem, resolveRegisterItem } from "@/lib/data/registers";
import { getManagedCompany } from "@/lib/data/companies";
import { describeResolution } from "@/lib/registers";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;

let acme: Company;
let globex: Company;
let founder: User;
let advisor: User;
let otherAdvisor: User;
let admin: User;

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
  [founder, advisor, otherAdvisor, admin] = (await db()
    .insert(schema.users)
    .values([
      { email: "maya@acme.test", authUserId: "a1", role: "founder" },
      { email: "ana@gg.test", authUserId: "a2", role: "advisor" },
      { email: "ben@gg.test", authUserId: "a3", role: "advisor" },
      { email: "root@gg.test", authUserId: "a4", role: "admin" },
    ])
    .returning()) as [User, User, User, User];
  [acme, globex] = (await db()
    .insert(schema.companies)
    .values([{ name: "Acme", advisorId: advisor.id }, { name: "Globex" }])
    .returning()) as [Company, Company];
});

async function point(company: Company, value: number, extra: Partial<typeof schema.dataPoints.$inferInsert> = {}) {
  const [p] = await db()
    .insert(schema.dataPoints)
    .values({ companyId: company.id, metric: "sales_cycle_days", value, unit: "days", confidence: "high", status: "accepted", ...extra })
    .returning();
  return p!;
}

async function item(company: Company, values: Partial<typeof schema.registerItems.$inferInsert>) {
  const [i] = await db()
    .insert(schema.registerItems)
    .values({ companyId: company.id, type: "question", title: "Q", owner: "founder", ...values })
    .returning();
  return i!;
}

const statusOf = async (ids: string[]) =>
  Object.fromEntries((await db().select().from(schema.dataPoints).where(inArray(schema.dataPoints.id, ids))).map((p) => [p.id, p.status]));

describe("resolving conflicts", () => {
  it("keeps the chosen value and sets the other aside", async () => {
    const intake = await point(acme, 94, { rawText: "Intake: Sales cycle", period: "Current" });
    const [doc] = await db().insert(schema.documents).values({ companyId: acme.id, docType: "board_deck", blobUrl: "x", filename: "Board deck Q2.pdf", mime: "application/pdf", size: 1 }).returning();
    const deck = await point(acme, 62, { status: "proposed", documentId: doc!.id, period: "Q2 2026" });
    const conflict = await item(acme, { type: "conflict", title: "Conflicting sales cycle data", dataPointIds: [intake.id, deck.id] });

    const [view] = await listRegisterItems([acme.id]);
    expect(view!.points.map((p) => p.source)).toEqual(["Your company profile", "Board deck Q2.pdf"]);

    expect(await resolveRegisterItem(founder, acme, conflict.id, { kind: "choose", dataPointId: deck.id })).toEqual({ ok: true });
    expect(await statusOf([intake.id, deck.id])).toEqual({ [intake.id]: "rejected", [deck.id]: "accepted" });
    const [after] = await listRegisterItems([acme.id]);
    expect(after!.status).toBe("resolved");
    expect(describeResolution(after!.resolution)).toBe("Kept 62d (Q2 2026)");
    const events = await db().select().from(schema.events).where(eq(schema.events.name, "register_item_resolved"));
    expect(events).toHaveLength(1);
  });

  it("refuses a value that isn't part of the conflict", async () => {
    const a = await point(acme, 94);
    const b = await point(acme, 62);
    const stray = await point(acme, 10);
    const conflict = await item(acme, { type: "conflict", dataPointIds: [a.id, b.id] });
    expect((await resolveRegisterItem(founder, acme, conflict.id, { kind: "choose", dataPointId: stray.id })).ok).toBe(false);
  });

  it("can replace both values with a corrected figure", async () => {
    const a = await point(acme, 94);
    const b = await point(acme, 62, { status: "proposed" });
    const conflict = await item(acme, { type: "conflict", dataPointIds: [a.id, b.id] });
    expect((await resolveRegisterItem(founder, acme, conflict.id, { kind: "value", value: 80 })).ok).toBe(true);
    const [row] = await db().select().from(schema.registerItems).where(eq(schema.registerItems.id, conflict.id));
    expect(row!.dataPointIds).toHaveLength(3);
    const created = row!.dataPointIds[2]!;
    expect(await statusOf(row!.dataPointIds)).toEqual({ [a.id]: "rejected", [b.id]: "rejected", [created]: "accepted" });
    const [p] = await db().select().from(schema.dataPoints).where(eq(schema.dataPoints.id, created));
    expect(p).toMatchObject({ value: 80, metric: "sales_cycle_days", acceptedBy: founder.id, documentId: null });
  });
});

describe("other answers", () => {
  it("confirms an assumption", async () => {
    const p = await point(acme, 120, { status: "proposed", confidence: "low" });
    const a = await item(acme, { type: "assumption", dataPointIds: [p.id] });
    expect((await resolveRegisterItem(founder, acme, a.id, { kind: "confirm" })).ok).toBe(true);
    expect((await statusOf([p.id]))[p.id]).toBe("accepted");
  });

  it("only takes a number when there's a figure to correct", async () => {
    const missing = await item(acme, { type: "missing", title: "Gross margin not provided" });
    expect(await resolveRegisterItem(founder, acme, missing.id, { kind: "value", value: 70 })).toMatchObject({ ok: false });
    expect((await resolveRegisterItem(founder, acme, missing.id, { kind: "answer", text: "About 72%, per our Q3 model" })).ok).toBe(true);
  });

  it("links only the company's own files", async () => {
    const [theirs] = await db().insert(schema.documents).values({ companyId: globex.id, docType: "other", blobUrl: "y", filename: "globex.pdf", mime: "application/pdf", size: 1 }).returning();
    const [ours] = await db().insert(schema.documents).values({ companyId: acme.id, docType: "other", blobUrl: "z", filename: "model.xlsx", mime: "x", size: 1 }).returning();
    const q = await item(acme, { type: "missing" });
    expect((await resolveRegisterItem(founder, acme, q.id, { kind: "document", documentId: theirs!.id })).ok).toBe(false);
    expect((await resolveRegisterItem(founder, acme, q.id, { kind: "document", documentId: ours!.id })).ok).toBe(true);
    expect(describeResolution((await listRegisterItems([acme.id]))[0]!.resolution)).toBe("Use uploaded file model.xlsx");
  });

  it("marks unknown and won't close an item twice", async () => {
    const q = await item(acme, {});
    expect((await resolveRegisterItem(founder, acme, q.id, { kind: "unknown", note: "We don't track it" })).ok).toBe(true);
    expect((await listRegisterItems([acme.id]))[0]!.status).toBe("unknown");
    expect(await resolveRegisterItem(founder, acme, q.id, { kind: "answer", text: "x" })).toEqual({ ok: false, error: expect.stringMatching(/closed/) });
  });
});

describe("access", () => {
  it("keeps founders to their own company's founder-owned items", async () => {
    const internal = await item(acme, { owner: "advisor" });
    const theirs = await item(globex, {});
    expect((await resolveRegisterItem(founder, acme, internal.id, { kind: "answer", text: "x" })).ok).toBe(false);
    expect((await resolveRegisterItem(founder, acme, theirs.id, { kind: "answer", text: "x" })).ok).toBe(false);
    expect(await listRegisterItems([acme.id], { owner: "founder" })).toHaveLength(0);
    expect((await listRegisterItems([globex.id]))[0]!.status).toBe("open");
  });

  it("never shows another company's values through an item", async () => {
    const foreign = await point(globex, 30);
    await item(acme, { type: "conflict", dataPointIds: [foreign.id] });
    expect((await listRegisterItems([acme.id]))[0]!.points).toEqual([]);
  });

  it("lets staff create, close, reopen and resolve advisor items", async () => {
    expect(await createRegisterItem(founder, acme, { type: "question", title: "Nope", owner: "founder" })).toBeNull();
    const created = await createRegisterItem(advisor, acme, { type: "follow_up", title: "Send Q3 board deck", owner: "founder" });
    expect((await listRegisterItems([acme.id], { owner: "founder", status: "open" })).map((i) => i.title)).toEqual(["Send Q3 board deck"]);
    expect(await closeWithNote(advisor, acme, created!.id, "Received by email")).toBe(true);
    expect(await reopenRegisterItem(founder, acme, created!.id)).toBe(false);
    expect(await reopenRegisterItem(advisor, acme, created!.id)).toBe(true);
    const internal = await item(acme, { owner: "advisor" });
    expect((await resolveRegisterItem(advisor, acme, internal.id, { kind: "answer", text: "Checked" })).ok).toBe(true);
  });

  it("gives advisors only the companies assigned to them", async () => {
    expect((await getManagedCompany(advisor, acme.id))?.id).toBe(acme.id);
    expect(await getManagedCompany(otherAdvisor, acme.id)).toBeNull();
    expect(await getManagedCompany(advisor, globex.id)).toBeNull();
    expect((await getManagedCompany(admin, globex.id))?.id).toBe(globex.id);
    expect(await getManagedCompany(founder, acme.id)).toBeNull();
  });
});
