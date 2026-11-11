import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { isOverdue } from "@/lib/plan-tracking";

export type PlanProgress = { done: number; total: number; overdue: number; next: string | null };
export type CurrentPlan = {
  /** What the plan is called: the advisor's name for it, else the plan's conversation. */
  name: string;
  /** The written action plan behind it, when there is one. */
  plan: { id: string; conversationId: string; status: string; href: string } | null;
  progress: PlanProgress | null;
};

const today = () => new Date().toISOString().slice(0, 10);

/** Milestones done out of all of them, how many are late, and the next one to do. */
export function planProgress(content: { days30: { action: string; done?: boolean; due?: string }[]; days60: { action: string; done?: boolean; due?: string }[]; days90: { action: string; done?: boolean; due?: string }[] } | null, on = today()): PlanProgress | null {
  if (!content) return null;
  const steps = [...content.days30, ...content.days60, ...content.days90];
  if (!steps.length) return null;
  return { done: steps.filter((s) => s.done).length, total: steps.length, overdue: steps.filter((s) => isOverdue(s, on)).length, next: steps.find((s) => !s.done)?.action ?? null };
}

/** The plan the company is working on with its advisor, or null when there isn't one yet. */
export async function currentPlan(company: Pick<Company, "id" | "currentPlan">): Promise<CurrentPlan | null> {
  const [row] = await db
    .select({ plan: schema.actionPlans, title: schema.conversations.title })
    .from(schema.actionPlans)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.actionPlans.conversationId))
    .where(and(eq(schema.actionPlans.companyId, company.id), inArray(schema.actionPlans.status, ["drafting", "in_review", "delivered", "active"])))
    .orderBy(desc(schema.actionPlans.updatedAt))
    .limit(1);
  const name = company.currentPlan?.trim() || row?.title;
  if (!name) return null;
  return {
    name,
    plan: row ? { id: row.plan.id, conversationId: row.plan.conversationId, status: row.plan.status, href: `/chat/${row.plan.conversationId}#your-plan` } : null,
    progress: row ? planProgress(row.plan.content) : null,
  };
}
