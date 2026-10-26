"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getManagedCompany } from "@/lib/data/companies";
import { saveAdvisorSummary, setHealth } from "@/lib/data/portfolio";
import { updateDataItem, type UpdateResult } from "@/lib/data/readiness";
import { activateWithoutPayment } from "@/lib/data/use-cases";
import { isUseCaseId } from "@/lib/use-cases";

async function managed(companyId: string) {
  const user = await requireRole(["advisor", "admin"]);
  const id = z.uuid().safeParse(companyId);
  const company = id.success ? await getManagedCompany(user, id.data) : null;
  return company ? { user, company } : null;
}
const refresh = (id: string) => {
  revalidatePath(`/advisor/companies/${id}`, "layout");
  revalidatePath("/advisor/portfolio");
};

export async function updateHealth(companyId: string, health: string): Promise<void> {
  const ctx = await managed(companyId);
  const h = z.enum(["good", "watch", "critical"]).nullable().parse(health || null);
  if (ctx && (await setHealth(ctx.user, ctx.company, h))) refresh(companyId);
}

export async function updateSummary(companyId: string, text: string): Promise<{ ok: boolean }> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false };
  const ok = await saveAdvisorSummary(ctx.user, ctx.company, z.string().max(4000).parse(text));
  refresh(companyId);
  return { ok };
}

/** Advisor review of a founder's data item: set quality (including Validated) or a follow-up request. */
export async function reviewItem(companyId: string, itemKey: string, patch: { quality?: "validated" | "unverified" | "estimated"; followUp?: string | null }): Promise<UpdateResult> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false, error: "Not found." };
  const result = await updateDataItem(ctx.user, ctx.company, z.string().max(64).parse(itemKey), patch);
  if (result.ok) {
    refresh(companyId);
    revalidatePath("/data", "layout");
  }
  return result;
}

/** Pilot activation without payment, recorded with who and why (HANDOFF §13.6). */
export async function activateForCompany(companyId: string, useCase: string, note: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false, error: "Not found." };
  if (!isUseCaseId(useCase)) return { ok: false, error: "Unknown use case." };
  const reason = z.string().trim().max(500).safeParse(note);
  if (!reason.success || !reason.data) return { ok: false, error: "Add a short note saying why (e.g. pilot, partner deal)." };
  await activateWithoutPayment(ctx.user, ctx.company, useCase, reason.data);
  refresh(companyId);
  revalidatePath("/", "layout");
  return { ok: true };
}
