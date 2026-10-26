import "server-only";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import type { UseCaseId } from "@/lib/use-cases";

/** Records a founder's interest in an advisory session. One open request per company and use case a week. */
export async function createAdvisoryRequest(user: User, company: Pick<Company, "id">, useCase: UseCaseId | null, message: string): Promise<{ created: boolean }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [recent] = await db
    .select({ id: schema.advisoryRequests.id })
    .from(schema.advisoryRequests)
    .where(
      and(
        eq(schema.advisoryRequests.companyId, company.id),
        useCase ? eq(schema.advisoryRequests.useCase, useCase) : undefined,
        eq(schema.advisoryRequests.status, "new"),
        gt(schema.advisoryRequests.createdAt, weekAgo),
      ),
    )
    .limit(1);
  if (recent) return { created: false };
  await db.insert(schema.advisoryRequests).values({ companyId: company.id, userId: user.id, useCase, message: message.trim() || null });
  await track("advisory_requested", { userId: user.id, companyId: company.id, props: { use_case: useCase } });
  return { created: true };
}

export async function listAdvisoryRequests(companyIds: readonly string[]) {
  if (!companyIds.length) return [];
  return db
    .select()
    .from(schema.advisoryRequests)
    .where(inArray(schema.advisoryRequests.companyId, [...companyIds]))
    .orderBy(desc(schema.advisoryRequests.createdAt));
}
