"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { assignCompany, listStaff } from "@/lib/data/companies";

const input = z.object({ companyId: z.uuid(), advisorId: z.uuid().optional() });

/** Advisors claim a company for themselves; admins may assign it to any advisor or admin. */
export async function claimCompany(formData: FormData): Promise<void> {
  const user = await requireRole(["advisor", "admin"]);
  const { companyId, advisorId } = input.parse({
    companyId: formData.get("companyId"),
    advisorId: formData.get("advisorId") || undefined,
  });

  let target = user.id;
  if (advisorId && advisorId !== user.id) {
    if (user.role !== "admin") return;
    const staff = await listStaff();
    if (!staff.some((s) => s.id === advisorId)) return;
    target = advisorId;
  }

  await assignCompany(companyId, target);
  revalidatePath("/advisor", "layout");
}
