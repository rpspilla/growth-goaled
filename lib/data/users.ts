import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { track } from "@/lib/events";

/** Companies where this person is the only member (deleting them would leave the company empty). */
export async function soleMemberCompanies(userId: string): Promise<{ id: string; name: string }[]> {
  const mine = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companyMembers).innerJoin(schema.companies, eq(schema.companies.id, schema.companyMembers.companyId)).where(eq(schema.companyMembers.userId, userId));
  if (!mine.length) return [];
  const shared = await db
    .select({ companyId: schema.companyMembers.companyId })
    .from(schema.companyMembers)
    .where(and(inArray(schema.companyMembers.companyId, mine.map((c) => c.id)), ne(schema.companyMembers.userId, userId)));
  const others = new Set(shared.map((s) => s.companyId));
  return mine.filter((c) => !others.has(c.id));
}

/**
 * An admin deletes a person: their account row and memberships go; invites they sent pass to the
 * admin; their work elsewhere keeps but loses the name. With `withCompanies`, companies they were
 * the only member of are deleted too (everything in them). Admins can't delete themselves.
 */
export async function deleteUser(admin: Pick<User, "id">, userId: string, opts: { withCompanies?: boolean } = {}): Promise<{ ok: true; companies: number } | { ok: false; error: string }> {
  if (userId === admin.id) return { ok: false, error: "You can't delete your own account." };
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!u) return { ok: false, error: "That person wasn't found." };
  const sole = opts.withCompanies ? await soleMemberCompanies(userId) : [];
  await db.update(schema.invites).set({ invitedBy: admin.id }).where(eq(schema.invites.invitedBy, userId));
  if (sole.length) await db.delete(schema.companies).where(inArray(schema.companies.id, sole.map((c) => c.id)));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await track("user_deleted", { userId: admin.id, props: { role: u.role, companies_deleted: sole.length } });
  return { ok: true, companies: sole.length };
}
