import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { isOverdue } from "@/lib/plan-tracking";
import { stepStatus } from "@/lib/plan-board";
import { askFor, type DataRequest } from "@/lib/plan-requests";

/** One of the plan's top priorities: what it is, where it stands, and what the founder does next. */
export type Priority = { action: string; status: "todo" | "doing"; due: string | null; overdue: boolean; next: string };
export type PlanProgress = { done: number; total: number; overdue: number; next: string | null; priorities: Priority[] };
export type CurrentPlan = {
  /** What the plan is called: the advisor's name for it, else the plan's conversation. */
  name: string;
  /** The written action plan behind it, when there is one. */
  plan: { id: string; conversationId: string; status: string; href: string } | null;
  progress: PlanProgress | null;
};

const today = () => new Date().toISOString().slice(0, 10);

/** Milestones done out of all of them, how many are late, and the next one to do. */
type Step = { action: string; done?: boolean; due?: string; status?: "todo" | "doing" | "done"; assignee?: "us" | "gg"; request?: Pick<DataRequest, "fields"> };
export function planProgress(content: { days30: Step[]; days60: Step[]; days90: Step[] } | null, on = today()): PlanProgress | null {
  if (!content) return null;
  const steps = [...content.days30, ...content.days60, ...content.days90].map((s) => ({ ...s, done: stepStatus(s) === "done" }));
  if (!steps.length) return null;
  // The next thing to do: something already under way, else the first not started.
  const next = steps.find((s) => stepStatus(s) === "doing") ?? steps.find((s) => !s.done);
  return { done: steps.filter((s) => s.done).length, total: steps.length, overdue: steps.filter((s) => isOverdue(s, on)).length, next: next?.action ?? null, priorities: topPriorities(steps, on) };
}

/**
 * The founder's top priorities, from the plan as it stands: what's under way first, then what's
 * next in plan order (overdue first within each), leaving out what's done and what Growth Goaled
 * took on. Each says what the founder does next, in the plan's own words.
 */
export function topPriorities(steps: Step[], on = today(), n = 3): Priority[] {
  const open = steps
    .map((s, i) => ({ s, i, status: stepStatus(s), overdue: isOverdue(s, on) }))
    .filter((x) => x.status !== "done" && x.s.assignee !== "gg");
  const rank = (x: (typeof open)[number]) => (x.status === "doing" ? 0 : 2) + (x.overdue ? 0 : 1);
  return open
    .sort((a, b) => rank(a) - rank(b) || a.i - b.i)
    .slice(0, n)
    .map(({ s, status, overdue }) => ({
      action: s.action,
      status: status as "todo" | "doing",
      due: s.due ?? null,
      overdue,
      // A founder input says exactly what to enter; older milestones say how to move them along.
      next: s.request?.fields.length ? askFor(s.request) : status === "doing" ? "Finish it, then move it to Complete" : "Start it: move it to In progress",
    }));
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
