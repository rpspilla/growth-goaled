"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { founderContext } from "@/lib/data/founder-context";
import { answerPlanInput, commitPlan, PLAN_STATUSES, updatePlanAction, type PlanResult } from "@/lib/data/plan";
import { processInboxDocument, registerDocument } from "@/lib/data/documents";
import { after } from "next/server";

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

/** A plan input answered by typing the values it names. */
export async function answerPlanInputAction(actionId: string, values: Record<string, string>): Promise<PlanResult> {
  const { user, company } = await founderCompany();
  const id = z.uuid().safeParse(actionId);
  const v = z.record(z.string().max(60), z.string().max(500)).safeParse(values);
  if (!id.success || !v.success) return { ok: false, error: "That answer isn't valid." };
  const result = await answerPlanInput(user, company, id.data, { values: v.data });
  if (result.ok) revalidatePath("/progress");
  return result;
}

/** A plan input answered with a file uploaded to the company's folder: registered, read and sorted like any upload. */
export async function answerPlanInputFileAction(actionId: string, file: { pathname: string; filename: string; contentHash?: string }): Promise<PlanResult> {
  const { user, company } = await founderCompany();
  const id = z.uuid().safeParse(actionId);
  const f = z.object({ pathname: z.string().min(1).max(1024), filename: z.string().min(1).max(255), contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).safeParse(file);
  if (!id.success || !f.success) return { ok: false, error: "That file isn't valid." };
  let doc;
  try {
    const registered = await registerDocument(user, company, { ...f.data, docType: "other" });
    doc = registered.doc;
    if (!registered.duplicate) after(() => processInboxDocument(registered.doc.id));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
  const result = await answerPlanInput(user, company, id.data, { documentId: doc.id, filename: doc.filename });
  if (result.ok) revalidatePath("/progress");
  return result;
}
