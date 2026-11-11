"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { founderContext } from "@/lib/data/founder-context";
import { headers } from "next/headers";
import { commitPlan, PLAN_STATUSES, sendPlanAssignments, setPlanActionAssignee, updatePlanAction, type PlanResult } from "@/lib/data/plan";

/** The signed-in founder and their company (plans are only ever read or changed within it). */
async function founderCompany() {
  const { user, company } = await founderContext();
  if (!company) throw new Error("No company yet.");
  return { user, company };
}

/** "Commit to this plan": the brief's actions become tracked on Progress. */
export async function commitPlanAction(deliverableId: string): Promise<PlanResult> {
  const { user, company } = await founderCompany();
  const id = z.uuid().safeParse(deliverableId);
  if (!id.success) return { ok: false, error: "That brief isn't available." };
  const result = await commitPlan(user, company, id.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Status (and an optional note) on one plan action. */
export async function updatePlanActionAction(actionId: string, status: string, note: string | null): Promise<PlanResult> {
  const { user, company } = await founderCompany();
  const id = z.uuid().safeParse(actionId);
  const s = z.enum(PLAN_STATUSES).safeParse(status);
  if (!id.success || !s.success) return { ok: false, error: "That update isn't valid." };
  const result = await updatePlanAction(user, company, id.data, s.data, typeof note === "string" ? note : null);
  if (result.ok) revalidatePath("/progress");
  return result;
}

/** Who does one action: "founder" (the founder's team) or "growth_goaled". */
export async function planAssigneeAction(actionId: string, assignee: string): Promise<PlanResult> {
  const { user, company } = await founderCompany();
  const id = z.uuid().safeParse(actionId);
  const a = z.enum(["founder", "growth_goaled"]).safeParse(assignee);
  if (!id.success || !a.success) return { ok: false, error: "That choice isn't valid." };
  const result = await setPlanActionAssignee(user, company, id.data, a.data);
  if (result.ok) revalidatePath("/progress");
  return result;
}

/** Sends the who-does-what split to the advisor for review. */
export async function sendPlanAssignmentsAction(): Promise<PlanResult> {
  const { user, company } = await founderCompany();
  const { active } = await founderContext();
  if (!active) return { ok: false, error: "There's no plan to send yet." };
  const h = await headers();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const result = await sendPlanAssignments(user, company, active.def.id, appUrl);
  if (result.ok) revalidatePath("/progress");
  return result.ok ? { ok: true } : result;
}
