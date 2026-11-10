import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { getManagedCompany, listFounderCompanies } from "./companies";

const TIER: Record<string, string> = { plan: "Diagnose", supported: "Execute & Monitor" };
const PLAN_STATUS: Record<string, string> = {
  collecting: "Gathering inputs",
  drafting: "Being drafted",
  in_review: "With an advisor for review",
  delivered: "Delivered",
  active: "Active",
  cancelled: "Cancelled",
};

export type LibraryPlan = { id: string; conversationId: string; title: string; tier: string; status: string; date: Date };
export type LibraryFile = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  status: "uploaded" | "analyzing" | "done" | "failed" | "stored";
  date: Date;
  /** Where it was shared: a conversation, or the data step. */
  conversation: { id: string; title: string } | null;
  sourceUrl: string | null;
};

/**
 * Everything a company has on file, for its Documents page (founders and advisors see the same):
 * action plans first, then every file shared, newest first in each.
 */
export async function companyDocumentLibrary(companyId: string): Promise<{ plans: LibraryPlan[]; files: LibraryFile[] }> {
  const [plans, docs, shared] = await Promise.all([
    db
      .select({ plan: schema.actionPlans, title: schema.conversations.title })
      .from(schema.actionPlans)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.actionPlans.conversationId))
      .where(and(eq(schema.actionPlans.companyId, companyId), ne(schema.actionPlans.status, "pending_payment")))
      .orderBy(desc(schema.actionPlans.createdAt)),
    db.select().from(schema.documents).where(eq(schema.documents.companyId, companyId)).orderBy(desc(schema.documents.createdAt)),
    db
      .select({ conversationId: schema.conversations.id, title: schema.conversations.title, documentIds: schema.conversationMessages.documentIds })
      .from(schema.conversationMessages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.conversationMessages.conversationId))
      .where(eq(schema.conversations.companyId, companyId)),
  ]);
  const where = new Map<string, { id: string; title: string }>();
  for (const m of shared) for (const d of m.documentIds ?? []) if (!where.has(d)) where.set(d, { id: m.conversationId, title: m.title });
  return {
    plans: plans.map(({ plan, title }) => ({
      id: plan.id,
      conversationId: plan.conversationId,
      title,
      tier: TIER[plan.tier] ?? plan.tier,
      status: PLAN_STATUS[plan.status] ?? plan.status,
      date: plan.approvedAt ?? plan.submittedAt ?? plan.createdAt,
    })),
    files: docs.map((d) => ({
      id: d.id,
      filename: d.filename,
      mime: d.mime,
      size: d.size,
      status: d.status,
      date: d.createdAt,
      conversation: where.get(d.id) ?? null,
      sourceUrl: d.sourceUrl,
    })),
  };
}

/** A file the user may open: their own company's (founders and members) or one they manage (advisors, admins). */
export async function documentForUser(user: User, documentId: string) {
  if (!/^[0-9a-f-]{36}$/.test(documentId)) return null;
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId)).limit(1);
  if (!doc) return null;
  if (user.role === "founder") return (await listFounderCompanies(user)).some((c) => c.id === doc.companyId) ? doc : null;
  return (await getManagedCompany(user, doc.companyId)) ? doc : null;
}
