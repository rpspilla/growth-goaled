"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getManagedCompany } from "@/lib/data/companies";
import { saveAdvisorSummary, setHealth } from "@/lib/data/portfolio";
import { updateDataItem, type UpdateResult } from "@/lib/data/readiness";

async function managed(companyId: string) {
  const user = await requireRole(["advisor", "admin"]);
  const id = z.uuid().safeParse(companyId);
  const company = id.success ? await getManagedCompany(user, id.data) : null;
  return company ? { user, company } : null;
}
const refresh = (id: string) => {
  revalidatePath(`/advisor/companies/${id}`);
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
    revalidatePath("/readiness", "layout");
  }
  return result;
}
