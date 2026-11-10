/** Several people on one company: invites by founders and advisors, accepting as a member, removing (PGlite; email stubbed). */
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
import { acceptInvite } from "@/lib/data/invites";
import { cancelTeammateInvite, companyPeople, inviteTeammate, removeTeammate } from "@/lib/data/team";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let owner: User, outsider: User, advisor: User, otherAdvisor: User;
let co: Company, other: Company;
const token = (link: string) => link.split("/invite/")[1]!;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.invites, schema.companyMembers, schema.events, schema.companies, schema.users]) await db().delete(t);
  [owner, outsider, advisor, otherAdvisor] = (await db()
    .insert(schema.users)
    .values([
      { email: "owner@co.test", authUserId: "o", role: "founder", name: "Olive" },
      { email: "out@else.test", authUserId: "x", role: "founder" },
      { email: "a@gg.test", authUserId: "a", role: "advisor", name: "Ada" },
      { email: "b@gg.test", authUserId: "b", role: "advisor" },
    ])
    .returning()) as [User, User, User, User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Team Co", advisorId: advisor.id }, { name: "Else Co" }]).returning()) as [Company, Company];
  await db().insert(schema.companyMembers).values([{ companyId: co.id, userId: owner.id, memberRole: "owner" }, { companyId: other.id, userId: outsider.id, memberRole: "owner" }]);
  h.emails.length = 0;
});

async function join(email: string, by: User = owner) {
  const r = await inviteTeammate(by, co.id, email);
  if (!r.ok) throw new Error(r.error);
  const [u] = await db().insert(schema.users).values({ email, authUserId: `auth:${email}`, role: "founder" }).returning();
  expect(await acceptInvite(u!, token(r.link!))).toEqual({ ok: true });
  return u!;
}

describe("inviting teammates", () => {
  it("a founder invites a teammate, who joins as a member and sees the same company", async () => {
    const r = await inviteTeammate(owner, co.id, " Sam@Co.test ");
    expect(r).toMatchObject({ ok: true, emailed: true });
    expect(h.emails[0]).toMatchObject({ to: "sam@co.test", subject: "Olive invited you to Team Co on Growth Goaled" });
    const [u] = await db().insert(schema.users).values({ email: "sam@co.test", authUserId: "s", role: "founder" }).returning();
    expect(await acceptInvite(u!, token(r.ok ? r.link! : ""))).toEqual({ ok: true });
    const people = await companyPeople(co.id);
    expect(people.members.map((m) => [m.email, m.role])).toEqual([["owner@co.test", "owner"], ["sam@co.test", "member"]]);
    expect(people.invites).toEqual([]);
  });

  it("refuses advisors' emails, people already in, people in another company, duplicates and outsiders", async () => {
    expect((await inviteTeammate(owner, co.id, "a@gg.test")).ok).toBe(false);
    expect(await inviteTeammate(owner, co.id, "owner@co.test")).toEqual({ ok: false, error: "They already have access." });
    expect(await inviteTeammate(owner, co.id, "out@else.test")).toEqual({ ok: false, error: "That person already belongs to another company on Growth Goaled." });
    expect((await inviteTeammate(owner, co.id, "new@co.test")).ok).toBe(true);
    expect((await inviteTeammate(owner, co.id, "new@co.test")).ok).toBe(false);
    expect(await inviteTeammate(outsider, co.id, "x@co.test")).toEqual({ ok: false, error: "Company not found." });
    expect(await inviteTeammate(otherAdvisor, co.id, "x@co.test")).toEqual({ ok: false, error: "Company not found." });
  });

  it("the company's advisor can invite into it; invites can be cancelled", async () => {
    const r = await inviteTeammate(advisor, co.id, "cofounder@co.test");
    expect(r.ok).toBe(true);
    const [inv] = await db().select().from(schema.invites).where(eq(schema.invites.email, "cofounder@co.test"));
    expect(inv!.memberRole).toBe("member");
    expect(await cancelTeammateInvite(owner, co.id, inv!.id)).toEqual({ ok: true });
    expect((await cancelTeammateInvite(owner, co.id, inv!.id)).ok).toBe(false);
  });
});

describe("removing people", () => {
  it("owners and the advisor remove members; members can't; the last owner and yourself stay", async () => {
    const sam = await join("sam@co.test");
    const kim = await join("kim@co.test");
    expect(await removeTeammate(sam, co.id, kim.id)).toEqual({ ok: false, error: "Only an owner can remove people." });
    expect(await removeTeammate(owner, co.id, owner.id)).toEqual({ ok: false, error: "You can't remove yourself." });
    expect(await removeTeammate(advisor, co.id, owner.id)).toEqual({ ok: false, error: "A company needs at least one owner." });
    expect(await removeTeammate(owner, co.id, sam.id)).toEqual({ ok: true });
    expect(await removeTeammate(advisor, co.id, kim.id)).toEqual({ ok: true });
    expect((await companyPeople(co.id)).members.map((m) => m.email)).toEqual(["owner@co.test"]);
  });
});
