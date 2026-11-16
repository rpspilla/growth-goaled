import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { founderContext } from "@/lib/data/founder-context";

/**
 * Where the old founder Results and Action plan pages now land (Founder View redesign): the growth
 * project they belonged to, else Growth Projects.
 */
export async function activeProjectPath(): Promise<string> {
  const { company, active } = await founderContext();
  if (company && active) {
    const [p] = await db.select({ id: schema.growthProjects.id }).from(schema.growthProjects).where(and(eq(schema.growthProjects.companyId, company.id), eq(schema.growthProjects.companyUseCaseId, active.id))).limit(1);
    if (p) return `/projects/${p.id}`;
  }
  return "/projects";
}
