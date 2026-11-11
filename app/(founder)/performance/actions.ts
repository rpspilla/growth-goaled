"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { addBusinessUpdate } from "@/lib/data/business-metrics";
import { getFounderCompany } from "@/lib/data/companies";

export type UpdateState = { ok?: boolean; error?: string };

const num = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.replace(/[$,%\s]/g, "") : "";
  return s ? Number(s) : null;
};

/** This month's figures typed in: kept with today's date so the change shows on Performance. */
export async function addBusinessUpdateAction(_prev: UpdateState, formData: FormData): Promise<UpdateState> {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) return { error: "Your company isn't set up yet." };
  const r = await addBusinessUpdate(user, company, { period: String(formData.get("period") ?? ""), mrr: num(formData.get("mrr")), retention: num(formData.get("retention")) });
  if (!r.ok) return { error: r.error };
  revalidatePath("/performance");
  revalidatePath("/overview");
  return { ok: true };
}
