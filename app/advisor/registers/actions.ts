"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getManagedCompany } from "@/lib/data/companies";
import { createRegisterItem, registerItemCompanyId, reopenRegisterItem, resolveRegisterItem, type ResolveResult } from "@/lib/data/registers";
import { newRegisterItemSchema, type ResolveAction } from "@/lib/registers";

/** Loads the item's company only if the signed-in advisor manages it. */
async function managedItemCompany(itemId: string) {
  const user = await requireRole(["advisor", "admin"]);
  const id = z.uuid().safeParse(itemId);
  if (!id.success) return null;
  const companyId = await registerItemCompanyId(id.data);
  const company = companyId ? await getManagedCompany(user, companyId) : null;
  return company ? { user, company, itemId: id.data } : null;
}

const refresh = () => revalidatePath("/", "layout");

export async function resolveAsAdvisor(itemId: string, action: ResolveAction): Promise<ResolveResult> {
  const ctx = await managedItemCompany(itemId);
  if (!ctx) return { ok: false, error: "That item wasn't found." };
  const result = await resolveRegisterItem(ctx.user, ctx.company, ctx.itemId, action);
  if (result.ok) refresh();
  return result;
}

export async function reopenItem(itemId: string): Promise<void> {
  const ctx = await managedItemCompany(itemId);
  if (ctx && (await reopenRegisterItem(ctx.user, ctx.company, ctx.itemId))) refresh();
}

export type CreateState = { ok: boolean; error?: string } | null;

export async function createItem(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const user = await requireRole(["advisor", "admin"]);
  const companyId = z.uuid().safeParse(formData.get("companyId"));
  const company = companyId.success ? await getManagedCompany(user, companyId.data) : null;
  if (!company) return { ok: false, error: "Choose one of your companies." };
  const parsed = newRegisterItemSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    owner: formData.get("owner"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  await createRegisterItem(user, company, parsed.data);
  refresh();
  return { ok: true };
}
