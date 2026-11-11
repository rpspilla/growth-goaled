/** The internal CRM's data: pipeline, contacts and companies, moves, timeline, follow-ups, drafts, import, summary (PGlite). */
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
import { addStage, addTask, boardCards, completeTask, contactProfile, createContact, crmSummary, deleteStage, followUps, getCompany, importContacts, logActivity, moveContact, pipeline, saveDraft, updateContact } from "@/lib/data/crm";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let ryan: User;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.crmEmails, schema.crmTasks, schema.crmActivities, schema.crmContactTags, schema.crmTags, schema.crmContacts, schema.crmCompanies, schema.crmStages, schema.crmPipelines, schema.users]) await db().delete(t);
  [ryan] = (await db().insert(schema.users).values({ email: "ryan@gg.test", authUserId: "r", role: "admin", name: "Ryan" }).returning()) as [User];
});

describe("crm", () => {
  it("starts with the eight default columns", async () => {
    const { stages } = await pipeline(ryan);
    expect(stages.map((s) => s.name)).toEqual(["New Prospects", "Researching", "Ready to Contact", "Contacted", "In Conversation", "Opportunity", "Customer / Partner", "Not Now / Archived"]);
    expect((await pipeline()).stages).toHaveLength(8);
  });

  it("adds contacts into New Prospects, shares a company between them, and refuses a duplicate email", async () => {
    const a = await createContact(ryan, { firstName: "Ada", lastName: "Lovelace", email: "Ada@Calc.io", companyName: "Calc", website: "calc.io", category: "Founder", source: "Referral" });
    const b = await createContact(ryan, { firstName: "Charles", email: "charles@calc.io", companyName: "calc" });
    expect(a.ok && b.ok).toBe(true);
    const dup = await createContact(ryan, { firstName: "Imposter", email: "ada@calc.io" });
    expect(dup).toMatchObject({ ok: false, error: "Ada Lovelace already has that email." });
    const cards = await boardCards();
    expect(cards).toHaveLength(2);
    const { stages } = await pipeline();
    expect(cards.every((c) => c.stageId === stages[0]!.id)).toBe(true);
    const company = cards[0]!.company!;
    expect((await getCompany(company.id))!.contacts).toHaveLength(2);
    expect(cards[0]!.owner).toEqual({ id: ryan.id, name: "Ryan" });
  });

  it("moves cards between and within columns, logging status changes", async () => {
    const { stages } = await pipeline(ryan);
    const ids: string[] = [];
    for (const n of ["A", "B", "C"]) {
      const r = await createContact(ryan, { firstName: n });
      if (r.ok) ids.push(r.id);
    }
    expect(await moveContact(ryan, ids[2]!, stages[0]!.id, ids[0]!)).toEqual({ ok: true });
    expect((await boardCards()).map((c) => c.name)).toEqual(["C", "A", "B"]);
    await moveContact(ryan, ids[0]!, stages[3]!.id, null);
    const moved = (await boardCards()).find((c) => c.id === ids[0]);
    expect(moved!.stageId).toBe(stages[3]!.id);
    const profile = (await contactProfile(ids[0]!))!;
    expect(profile.activities[0]).toMatchObject({ kind: "status_change", body: "Moved from New Prospects to Contacted" });
  });

  it("keeps a timeline and follow-ups, and knows who has no next action", async () => {
    const r = await createContact(ryan, { firstName: "Grace", email: "grace@navy.mil" });
    if (!r.ok) throw new Error();
    const other = await createContact(ryan, { firstName: "Idle" });
    expect(await logActivity(ryan, r.id, "call", "Intro call, keen on a pilot", "2026-11-01")).toEqual({ ok: true });
    expect((await contactProfile(r.id))!.contact.lastContactedAt?.toISOString().slice(0, 10)).toBe("2026-11-01");
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(await addTask(ryan, r.id, { title: "Send proposal", dueDate: yesterday })).toEqual({ ok: true });
    let due = await followUps(ryan.id);
    expect(due.overdue.map((t) => t.title)).toEqual(["Send proposal"]);
    expect(due.noNextAction.map((c) => c.name)).toEqual(["Idle"]);
    const card = (await boardCards({ followUp: "overdue" }))[0]!;
    expect(card).toMatchObject({ name: "Grace", followUp: "overdue", next: { title: "Send proposal", due: yesterday } });
    expect(await completeTask(ryan, due.overdue[0]!.taskId)).toEqual({ ok: true });
    due = await followUps(ryan.id);
    expect(due.overdue).toEqual([]);
    expect(due.noNextAction.map((c) => c.name).sort()).toEqual(["Grace", "Idle"]);
    expect(other.ok).toBe(true);
  });

  it("saves and edits email drafts, which never count as sent", async () => {
    const r = await createContact(ryan, { firstName: "Noemail" });
    if (!r.ok) throw new Error();
    expect(await saveDraft(ryan, r.id, null, { subject: "Hi", body: "x" })).toEqual({ ok: false, error: "Add the contact's email address first." });
    await updateContact(ryan, r.id, { firstName: "Noemail", email: "now@has.it" });
    const d = await saveDraft(ryan, r.id, null, { subject: "Intro", body: "Hello" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(await saveDraft(ryan, r.id, d.id, { subject: "Intro v2", body: "Hello again" })).toEqual({ ok: true, id: d.id });
    const p = (await contactProfile(r.id))!;
    expect(p.emails).toMatchObject([{ subject: "Intro v2", status: "draft", toEmail: "now@has.it", sentAt: null }]);
    expect(p.activities.some((a) => a.kind === "email_draft")).toBe(true);
  });

  it("imports CSV rows, skipping emails already in the CRM or repeated, matching companies", async () => {
    await createContact(ryan, { firstName: "Existing", email: "dup@x.io" });
    const r = await importContacts(ryan, [
      { firstName: "New", lastName: "One", email: "new@x.io", phone: null, jobTitle: null, company: "X", website: "x.io", linkedinUrl: null, location: null, category: "Seed", source: "linkedin", notes: null },
      { firstName: "Dup", lastName: null, email: "dup@x.io", phone: null, jobTitle: null, company: null, website: null, linkedinUrl: null, location: null, category: null, source: null, notes: null },
      { firstName: "Twice", lastName: null, email: "new@x.io", phone: null, jobTitle: null, company: null, website: null, linkedinUrl: null, location: null, category: null, source: null, notes: null },
      { firstName: "Also X", lastName: null, email: null, phone: null, jobTitle: null, company: "x", website: null, linkedinUrl: null, location: null, category: null, source: null, notes: null },
    ]);
    expect(r).toEqual({ added: 2, duplicates: ["dup@x.io", "new@x.io"], failed: 0 });
    const imported = (await boardCards({ q: "new@x.io" }))[0]!;
    expect(imported).toMatchObject({ category: "Founder", subcategory: "Seed" });
    const [row] = await db().select().from(schema.crmContacts).where(eq(schema.crmContacts.email, "new@x.io"));
    expect(row).toMatchObject({ source: "LinkedIn", emailVerified: false });
    expect((await getCompany(imported.company!.id))!.contacts).toHaveLength(2);
  });

  it("customises columns without losing contacts, and summarises by meaning", async () => {
    const { stages } = await pipeline(ryan);
    expect(await addStage("Pilot")).toEqual({ ok: true });
    const after = (await pipeline()).stages;
    expect(after.map((s) => s.name).slice(-2)).toEqual(["Pilot", "Not Now / Archived"]);
    const r = await createContact(ryan, { firstName: "Mover", stageId: stages[4]!.id });
    if (!r.ok) throw new Error();
    expect(await deleteStage(ryan, stages[4]!.id, stages[5]!.id)).toEqual({ ok: true });
    expect((await boardCards())[0]!.stageId).toBe(stages[5]!.id);
    await createContact(ryan, { firstName: "Won", stageId: stages[6]!.id });
    expect(await crmSummary()).toEqual({ total: 2, contacted: 2, conversations: 0, opportunities: 1, customers: 1 });
    expect(await crmSummary({ category: "Investor" })).toMatchObject({ total: 0 });
  });
});
