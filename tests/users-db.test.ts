/** Admins delete people from the Users screen (PGlite). */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { deleteUser, soleMemberCompanies } from "@/lib/data/users";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

describe("deleting a user", () => {
  it("removes them, hands their invites to the admin, and deletes their solo company only when asked", async () => {
    const [admin, solo, pair1, pair2, inviter] = (await db()
      .insert(schema.users)
      .values([
        { email: "admin@gg.test", authUserId: "a", role: "admin" },
        { email: "solo@x.test", authUserId: "s", role: "founder" },
        { email: "p1@y.test", authUserId: "p1", role: "founder" },
        { email: "p2@y.test", authUserId: "p2", role: "founder" },
        { email: "adv@gg.test", authUserId: "i", role: "advisor" },
      ])
      .returning()) as User[];
    const [soloCo, shared] = (await db().insert(schema.companies).values([{ name: "Solo Co" }, { name: "Shared Co" }]).returning()) as [Company, Company];
    await db().insert(schema.companyMembers).values([
      { companyId: soloCo.id, userId: solo!.id },
      { companyId: shared.id, userId: pair1!.id },
      { companyId: shared.id, userId: pair2!.id },
    ]);
    await db().insert(schema.invites).values({ email: "new@z.test", companyId: shared.id, invitedBy: inviter!.id, tokenHash: "h", expiresAt: new Date(Date.now() + 86_400_000) });

    expect(await deleteUser(admin!, admin!.id)).toEqual({ ok: false, error: "You can't delete your own account." });
    expect(await soleMemberCompanies(solo!.id)).toEqual([{ id: soloCo.id, name: "Solo Co" }]);
    expect(await soleMemberCompanies(pair1!.id)).toEqual([]);

    // Someone who sent invites can be deleted; the invites pass to the admin.
    expect(await deleteUser(admin!, inviter!.id)).toEqual({ ok: true, companies: 0 });
    const [invite] = await db().select().from(schema.invites);
    expect(invite!.invitedBy).toBe(admin!.id);

    // Without the option, their company stays (empty); with it, it goes.
    expect(await deleteUser(admin!, pair1!.id, { withCompanies: true })).toEqual({ ok: true, companies: 0 });
    expect(await db().select().from(schema.companies).where(eq(schema.companies.id, shared.id))).toHaveLength(1);
    expect(await deleteUser(admin!, solo!.id, { withCompanies: true })).toEqual({ ok: true, companies: 1 });
    expect(await db().select().from(schema.companies).where(eq(schema.companies.id, soloCo.id))).toEqual([]);
    expect((await db().select().from(schema.users)).map((u) => u.email).sort()).toEqual(["admin@gg.test", "p2@y.test"]);
  });
});
