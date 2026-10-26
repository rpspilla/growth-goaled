"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { saveIntakeAnswer, type SaveResult } from "@/lib/data/intake";

/** Autosave for one intake field. The company always comes from the signed-in founder, never the client. */
export async function saveIntakeField(sectionId: string, fieldId: string, raw: string): Promise<SaveResult> {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) return { ok: false, error: "Your company isn't set up yet." };
  const result = await saveIntakeAnswer(user, company, sectionId, fieldId, raw.slice(0, 4000));
  if (result.ok && result.phaseAdvanced) revalidatePath("/", "layout");
  return result;
}
