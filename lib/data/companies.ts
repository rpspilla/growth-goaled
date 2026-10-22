import "server-only";
import { asc, eq } from "drizzle-orm";
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
