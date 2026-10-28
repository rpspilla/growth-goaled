import "server-only";
import { and, asc, desc, eq, inArray, isNull, like, not } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { COMPANY_COOKIE } from "@/lib/multi-company";
import type { Company, User } from "@/lib/db/schema";

/** Every company a founder belongs to, oldest membership first. */
export async function listFounderCompanies(user: Pick<User, "id">): Promise<Company[]> {
  const rows = await db
    .select({ company: schema.companies })
    .from(schema.companyMembers)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.companyMembers.companyId))
    .where(eq(schema.companyMembers.userId, user.id))
    .orderBy(asc(schema.companyMembers.createdAt));
  return rows.map((r) => r.company);
}

/** The company picked in the switcher (a cookie), if this request has one. Outside a request there is none. */
async function preferredCompanyId(): Promise<string | undefined> {
  try {
    return (await cookies()).get(COMPANY_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

/**
 * The company a founder is working on: the one picked in the switcher when they're a member of
 * it, else their first. Null before one is created. The cookie is only a preference: membership
 * is always checked here, so every page and action stays scoped to the founder's own companies.
 */
export async function getFounderCompany(user: User): Promise<Company | null> {
  const companies = await listFounderCompanies(user);
  const preferred = companies.length > 1 ? await preferredCompanyId() : undefined;
  return companies.find((c) => c.id === preferred) ?? companies[0] ?? null;
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

/** A company the advisor manages (admins: any company), or null. */
export async function getManagedCompany(actor: User, companyId: string): Promise<Company | null> {
  if (actor.role !== "advisor" && actor.role !== "admin") return null;
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
  if (!company) return null;
  return actor.role === "admin" || company.advisorId === actor.id ? company : null;
}
