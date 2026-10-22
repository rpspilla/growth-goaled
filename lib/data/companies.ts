import "server-only";
import { and, asc, desc, eq, inArray, isNull, like, not } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";

/** The company a founder belongs to (first by membership date), or null before one is created. */
export async function getFounderCompany(user: User): Promise<Company | null> {
  const [row] = await db
    .select({ company: schema.companies })
    .from(schema.companyMembers)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.companyMembers.companyId))
    .where(eq(schema.companyMembers.userId, user.id))
    .orderBy(asc(schema.companyMembers.createdAt))
    .limit(1);
  return row?.company ?? null;
}

export type UnassignedCompany = {
  id: string;
  name: string;
  website: string | null;
  revenueBand: Company["revenueBand"];
  createdAt: Date;
  founderName: string | null;
  founderEmail: string | null;
};

/** Self-signed-up companies waiting for an advisor (never the sample company). Staff only. */
export async function listUnassignedCompanies(): Promise<UnassignedCompany[]> {
  const rows = await db
    .select({ company: schema.companies, founder: schema.users })
    .from(schema.companies)
    .leftJoin(
      schema.companyMembers,
      and(eq(schema.companyMembers.companyId, schema.companies.id), eq(schema.companyMembers.memberRole, "owner")),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(and(isNull(schema.companies.advisorId), eq(schema.companies.isSample, false)))
    .orderBy(desc(schema.companies.createdAt));

  // One row per company even if it somehow has several owners
  const seen = new Set<string>();
  return rows.flatMap(({ company, founder }) => {
    if (seen.has(company.id)) return [];
    seen.add(company.id);
    return [
      {
        id: company.id,
        name: company.name,
        website: company.website,
        revenueBand: company.revenueBand,
        createdAt: company.createdAt,
        founderName: founder?.name ?? null,
        founderEmail: founder?.email ?? null,
      },
    ];
  });
}

/** People a company can be assigned to. */
export async function listStaff(): Promise<Pick<User, "id" | "name" | "email" | "role">[]> {
  return db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role })
    .from(schema.users)
    .where(and(inArray(schema.users.role, ["advisor", "admin"]), not(like(schema.users.authUserId, "seed:%"))))
    .orderBy(asc(schema.users.name));
}

/**
 * Assigns an unassigned company. Only succeeds while it is still unassigned,
 * so two advisors claiming at once can't both win.
 */
export async function assignCompany(companyId: string, advisorId: string): Promise<boolean> {
  const updated = await db
    .update(schema.companies)
    .set({ advisorId })
    .where(and(eq(schema.companies.id, companyId), isNull(schema.companies.advisorId), eq(schema.companies.isSample, false)))
    .returning({ id: schema.companies.id });
  return updated.length > 0;
}

/** Companies an advisor manages (admins: every company). */
export async function listManagedCompanies(actor: User): Promise<Company[]> {
  return db
    .select()
    .from(schema.companies)
    .where(actor.role === "admin" ? undefined : eq(schema.companies.advisorId, actor.id))
    .orderBy(asc(schema.companies.name));
}
