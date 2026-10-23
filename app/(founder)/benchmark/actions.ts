"use server";

import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { track } from "@/lib/events";

/** Analytics only: a founder opened the Source Trail for a claim. */
export async function sourceTrailOpened(claimKey: string): Promise<void> {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (company) await track("source_trail_opened", { userId: user.id, companyId: company.id, props: { claimKey: claimKey.slice(0, 80), type: "benchmark" } });
}
