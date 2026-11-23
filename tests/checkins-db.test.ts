/** Weekly check-in and commitment outcomes: what's due, the email, sending once a week, opting out, and the CRO seeing outcomes (PGlite). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, sent: [] as { to: string; subject: string; text: string; html: string }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  sendEmail: async (m: { to: string; subject: string; text: string; html: string }) => (h.sent.push(m), { sent: true }),
}));

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { chatContext } from "@/lib/chat/context";
import { checkinEmail, checkinItems, checkinMessage, dueCheckins, sendWeeklyCheckins } from "@/lib/data/checkins";
import { companyCommitments, rescheduleCommitment, setCommitmentOutcome, setCommitmentStatus } from "@/lib/data/commitments";
import { createProject, today } from "@/lib/data/projects";
import { unsubscribeToken, validUnsubscribe } from "@/lib/data/reminders";
import { addDays } from "@/lib/weeks";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User;
let other: User;
let co: Company;
let sample: Company;
let project: string;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
  process.env.CRON_SECRET = "test-secret";
}, 60_000);

const on = today();
async function commit(title: string, dueOn: string | null, company = co, projectId = project) {
  const [c] = await db().insert(schema.commitments).values({ companyId: company.id, projectId, title, owner: "Fran", dueOn }).returning();
  return c!;
}

beforeEach(async () => {
  for (const t of [schema.commitments, schema.growthProjects, schema.companyMembers, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder, other] = (await db().insert(schema.users).values([{ email: "fran@co.test", authUserId: "fran", role: "founder", name: "Fran Founder" }, { email: "sam@co.test", authUserId: "sam", role: "founder" }]).returning()) as [User, User];
  [co, sample] = (await db().insert(schema.companies).values([{ name: "Check Co" }, { name: "Sample Co", isSample: true }]).returning()) as [Company, Company];
  await db().insert(schema.companyMembers).values([{ companyId: co.id, userId: founder.id }, { companyId: co.id, userId: other.id }, { companyId: sample.id, userId: founder.id }]);
  const p = await createProject(founder, co, { name: "First AE hire", startedOn: on });
  if (!p.ok) throw new Error(p.error);
  project = p.id;
  h.sent.length = 0;
});

describe("outcomes and new dates", () => {
  it("record how a closed commitment went, and move an open one's date (never into the past)", async () => {
    const c = await commit("Write the AE scorecard", addDays(on, -3));
    expect(await setCommitmentOutcome(founder, co, c.id, "worked", "Agreed in one meeting")).toEqual({ ok: false, error: "Mark it done or dropped first." });
    expect(await rescheduleCommitment(founder, co, c.id, addDays(on, -1))).toEqual({ ok: false, error: "Pick today or a later date." });
    expect(await rescheduleCommitment(founder, co, c.id, "soon")).toEqual({ ok: false, error: "Pick a valid date." });
    expect(await rescheduleCommitment(founder, co, c.id, addDays(on, 4))).toEqual({ ok: true });
    expect((await companyCommitments(co))[0]!.dueOn).toBe(addDays(on, 4));
    await setCommitmentStatus(founder, co, c.id, "done");
    expect(await rescheduleCommitment(founder, co, c.id, addDays(on, 5))).toEqual({ ok: false, error: "That commitment wasn't found." });
    expect(await setCommitmentOutcome(founder, sample, c.id, "worked", null)).toEqual({ ok: false, error: "That commitment wasn't found." });
    expect(await setCommitmentOutcome(founder, co, c.id, "partly", "  Agreed, but the comp part is still open  ")).toEqual({ ok: true });
    expect((await companyCommitments(co))[0]).toMatchObject({ outcome: "partly", outcomeNote: "Agreed, but the comp part is still open" });
  });

  it("show in the CRO's context, with the founder's note", async () => {
    const c = await commit("Book three AE interviews", on);
    await setCommitmentStatus(founder, co, c.id, "done");
    await setCommitmentOutcome(founder, co, c.id, "didnt", "Two candidates dropped out");
    const ctx = await chatContext(co, { compensation: false });
    expect(ctx.work.commitments).toEqual([expect.objectContaining({ title: "Book three AE interviews", status: "done", outcome: "Didn't work", outcome_note: "Two candidates dropped out" })]);
  });
});

describe("the weekly check-in", () => {
  it("covers what slipped, what's due in the next 7 days, and what's done without an outcome", async () => {
    await commit("Slipped", addDays(on, -2));
    await commit("Due Friday", addDays(on, 4));
    await commit("Next month", addDays(on, 30));
    await commit("Undated", null);
    const done = await commit("Finished", addDays(on, -1));
    await setCommitmentStatus(founder, co, done.id, "done");
    const told = await commit("Finished and told", addDays(on, -1));
    await setCommitmentStatus(founder, co, told.id, "done");
    await setCommitmentOutcome(founder, co, told.id, "worked", null);
    const items = await checkinItems(co, on);
    expect(items.overdue.map((c) => c.title)).toEqual(["Slipped"]);
    expect(items.dueThisWeek.map((c) => c.title)).toEqual(["Due Friday"]);
    expect(items.needsOutcome.map((c) => c.title)).toEqual(["Finished"]);
    const told2 = (await companyCommitments(co)).find((c) => c.title === "Finished and told")!;
    expect(checkinMessage(items, [told2])).toBe("Weekly check-in.\n- Done: Finished and told (worked)\n- Overdue: Slipped\n- Due this week: Due Friday\nWhat should I focus on this week?");
  });

  it("emails each founder once a week, never sample companies or those who opted out", async () => {
    await commit("Slipped", addDays(on, -2));
    const sp = await createProject(founder, sample, { name: "Sample project", startedOn: on });
    if (!sp.ok) throw new Error(sp.error);
    await commit("Sample slipped", addDays(on, -2), sample, sp.id);
    await db().insert(schema.events).values({ name: "weekly_checkin_unsubscribed", userId: other.id });

    const due = await dueCheckins();
    expect(due.map((d) => [d.company.name, d.to.map((t) => t.email)])).toEqual([["Check Co", ["fran@co.test"]]]);
    expect(await sendWeeklyCheckins()).toEqual({ due: 1, sent: 1, failed: [] });
    expect(h.sent[0]).toMatchObject({ to: "fran@co.test", subject: "Check Co: 1 commitment slipped. 2-minute check-in" });
    expect(h.sent[0]!.text).toContain("Hi Fran,");
    expect(h.sent[0]!.text).toContain("- Slipped (Fran, was due");
    expect(h.sent[0]!.text).toContain("/checkin");
    expect(h.sent[0]!.html).toContain("Do your check-in");
    // The unsubscribe link is signed for the weekly email only.
    const link = new URL(h.sent[0]!.text.match(/Stop these weekly emails: (\S+)/)![1]!);
    expect(link.searchParams.get("k")).toBe("weekly");
    expect(validUnsubscribe(founder.id, link.searchParams.get("t")!, "weekly-checkin")).toBe(true);
    expect(validUnsubscribe(founder.id, link.searchParams.get("t")!)).toBe(false);
    expect(unsubscribeToken(founder.id, "weekly-checkin")).not.toBe(unsubscribeToken(founder.id));
    // Not again until next week.
    expect(await sendWeeklyCheckins()).toEqual({ due: 0, sent: 0, failed: [] });
    expect(await sendWeeklyCheckins(new Date(Date.now() + 7 * 86_400_000))).toMatchObject({ due: 1 });
    const [ev] = await db().select().from(schema.events).where(eq(schema.events.name, "weekly_checkin_sent")).limit(1);
    expect(ev).toMatchObject({ companyId: co.id, props: { recipients: 1, overdue: 1, due: 0 } });
  });

  it("sends nothing when there's nothing to check in on", async () => {
    await commit("Next month", addDays(on, 30));
    expect(await dueCheckins()).toEqual([]);
  });

  it("says nothing slipped in the subject when nothing did", () => {
    const c = { id: "x", title: "Due Friday", owner: "Fran", dueOn: "2026-11-27" } as never;
    const email = checkinEmail({ company: { name: "Co" }, items: { overdue: [], dueThisWeek: [c], needsOutcome: [] }, appUrl: "https://app.test", unsubscribeUrl: "https://app.test/u", name: null });
    expect(email.subject).toBe("Co: your weekly check-in");
    expect(email.text).not.toContain("Hi ");
    expect(email.text).toContain("Due this week:\n- Due Friday (Fran, by Fri, Nov 27)");
  });
});
