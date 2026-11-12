"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { FIELD_KINDS } from "@/lib/plan-requests";
import { canViewCompany } from "@/lib/access";
import { requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { approvePlan, logPlanSession, postAdvisorMessage, requestPlanUpdate, resendPlanEmail, setPlanTargets, setStepStatus, updateStep, writePlan, type PlanResult } from "@/lib/data/action-plans";

/** The signed-in advisor or admin, and the plan's company if they may see it. */
async function staffPlan(planId: string) {
  const user = await requireRole(["advisor", "admin"]);
  const id = z.uuid().safeParse(planId);
  if (!id.success) return null;
  const [row] = await db
    .select({ plan: schema.actionPlans, company: schema.companies })
    .from(schema.actionPlans)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.actionPlans.companyId))
    .where(eq(schema.actionPlans.id, id.data))
    .limit(1);
  if (!row || !canViewCompany(user, row.company, [])) return null;
  return { user, ...row };
}

const field = z.object({ key: z.string().max(60), label: z.string().max(120), kind: z.enum(FIELD_KINDS), hint: z.string().max(200).optional(), metric: z.string().max(60).optional(), optional: z.boolean().optional(), defaultValue: z.string().max(60).optional(), defaultLabel: z.string().max(200).optional() });
const answer = z.object({ values: z.record(z.string(), z.string().max(500)), documentId: z.string().optional(), filename: z.string().optional(), at: z.string(), by: z.string() });
const request = z.object({ fields: z.array(field).max(8), columns: z.array(z.string().max(80)).max(12), answer: answer.optional() });
const step = z.object({ action: z.string().max(500), owner: z.string().max(120), measure: z.string().max(300), done: z.boolean().optional(), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), status: z.enum(["todo", "doing", "done"]).optional(), assignee: z.enum(["us", "gg"]).optional(), request: request.optional() });
const contentSchema = z.object({
  goal: z.string().max(500),
  summary: z.string().max(2000),
  days30: z.array(step).max(10),
  days60: z.array(step).max(10),
  days90: z.array(step).max(10),
  risks: z.array(z.string().max(300)).max(10),
  assumptions: z.array(z.string().max(300)).max(10),
  tools: z.array(z.object({ name: z.string().max(120), category: z.string().max(60), why: z.string().max(400) })).max(8).optional(),
  targets: z.array(z.object({ metric: z.string().max(60), target: z.number(), by: z.string().nullable().optional() })).max(6).optional(),
  advisorTasks: z.array(z.object({ action: z.string().max(500), why: z.string().max(500).optional(), status: z.enum(["todo", "doing", "done"]).optional() })).max(12).optional(),
});

/** Approve a $499 plan (with the advisor's edits): it's delivered to the founder and they're emailed. */
export async function approvePlanAction(planId: string, content: unknown, note: string | null): Promise<PlanResult> {
  const ctx = await staffPlan(planId);
  if (!ctx) return { ok: false, error: "Plan not found." };
  const parsed = contentSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: "Check the plan's fields." };
  const h = await headers();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const result = await approvePlan(ctx.user, ctx.company, ctx.plan.id, parsed.data, typeof note === "string" ? note : null, appUrl);
  revalidatePath("/advisor", "layout");
  return result;
}

/** Re-draft a plan from its conversation (a failed or out-of-date draft). Runs after the response. */
export async function redraftPlanAction(planId: string): Promise<PlanResult> {
  const ctx = await staffPlan(planId);
  if (!ctx) return { ok: false, error: "Plan not found." };
  if (ctx.plan.tier === "plan") {
    if (ctx.plan.status !== "in_review") return { ok: false, error: "Only a plan in review can be re-drafted." };
    await db.update(schema.actionPlans).set({ status: "drafting" }).where(eq(schema.actionPlans.id, ctx.plan.id));
  } else {
    const ok = await requestPlanUpdate(ctx.company, ctx.plan.id);
    if (!ok.ok) return ok;
  }
  after(() => writePlan(ctx.plan.id));
  revalidatePath(`/advisor/plans/${ctx.plan.id}`);
  return { ok: true };
}

/** The advisor's message in a supported plan's conversation. */
export async function advisorMessageAction(planId: string, text: string): Promise<PlanResult> {
  const ctx = await staffPlan(planId);
  if (!ctx) return { ok: false, error: "Plan not found." };
  if (typeof text !== "string") return { ok: false, error: "Type a message first." };
  const result = await postAdvisorMessage(ctx.user, ctx.company.id, ctx.plan.conversationId, text);
  revalidatePath(`/advisor/plans/${ctx.plan.id}`);
  return result;
}

export async function advisorStepAction(planId: string, period: string, index: number, status: string): Promise<PlanResult> {
  const ctx = await staffPlan(planId);
  if (!ctx) return { ok: false, error: "Plan not found." };
  const p = z.enum(["days30", "days60", "days90"]).safeParse(period);
  const st = z.enum(["todo", "doing", "done"]).safeParse(status);
  if (!p.success || !st.success || !Number.isInteger(index) || index < 0) return { ok: false, error: "That change isn't valid." };
  const result = await setStepStatus(ctx.company, ctx.plan.id, p.data, index, st.data, { staff: true });
  revalidatePath(`/advisor/plans/${ctx.plan.id}`);
  return result;
}

/** Re-sends the founder's "your action plan is ready" email for a delivered plan. */
export async function resendPlanEmailAction(planId: string): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const ctx = await staffPlan(planId);
  if (!ctx) return { ok: false, error: "Plan not found." };
  const h = await headers();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return resendPlanEmail(ctx.user, ctx.company, ctx.plan.id, appUrl);
}

/** Execute & Monitor: a milestone's owner and deadline, from the advisor's side. */
export async function advisorStepDetailsAction(planId: string, period: string, index: number, owner: string, due: string | null): Promise<PlanResult> {
  const ctx = await staffPlan(planId);
  if (!ctx) return { ok: false, error: "Plan not found." };
  const p = z.enum(["days30", "days60", "days90"]).safeParse(period);
  if (!p.success || !Number.isInteger(index) || index < 0 || typeof owner !== "string") return { ok: false, error: "That change isn't valid." };
  const result = await updateStep(ctx.company, ctx.plan.id, p.data, index, { owner, due: typeof due === "string" && due ? due : null });
  revalidatePath(`/advisor/plans/${ctx.plan.id}`);
  return result;
}

export async function advisorTargetsAction(planId: string, targets: unknown): Promise<PlanResult> {
  const ctx = await staffPlan(planId);
  if (!ctx) return { ok: false, error: "Plan not found." };
  const result = await setPlanTargets(ctx.company, ctx.plan.id, targets);
  revalidatePath(`/advisor/plans/${ctx.plan.id}`);
  return result;
}

/** Logs a monthly review or live support on an Execute & Monitor plan. */
export async function logSessionAction(planId: string, kind: string, minutes: number, heldOn: string, note: string): Promise<PlanResult> {
  const ctx = await staffPlan(planId);
  if (!ctx) return { ok: false, error: "Plan not found." };
  const k = z.enum(["review", "support"]).safeParse(kind);
  if (!k.success || typeof heldOn !== "string" || typeof note !== "string") return { ok: false, error: "That entry isn't valid." };
  const result = await logPlanSession(ctx.user, ctx.company, ctx.plan.id, { kind: k.data, minutes: Math.round(Number(minutes)), heldOn, note });
  revalidatePath(`/advisor/plans/${ctx.plan.id}`);
  return result;
}
