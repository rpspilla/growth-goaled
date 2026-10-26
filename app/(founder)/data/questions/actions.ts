"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { resolveRegisterItem, type ResolveResult } from "@/lib/data/registers";
import type { ResolveAction } from "@/lib/registers";

/** Resolves a question on the signed-in founder's own company. */
export async function resolveQuestion(itemId: string, action: ResolveAction): Promise<ResolveResult> {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) return { ok: false, error: "Your company isn't set up yet." };
  const id = z.uuid().safeParse(itemId);
  if (!id.success) return { ok: false, error: "That question wasn't found." };
  const result = await resolveRegisterItem(user, company, id.data, action);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
