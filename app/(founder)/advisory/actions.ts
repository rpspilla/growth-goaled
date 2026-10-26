"use server";

import { z } from "zod";
import { createAdvisoryRequest } from "@/lib/data/advisory";
import { founderContext } from "@/lib/data/founder-context";
import { isUseCaseId } from "@/lib/use-cases";

async function founderCompany() {
  const { user, company } = await founderContext();
  if (!company) throw new Error("Your company isn't set up yet.");
  return { user, company };
}

/** "Talk to us about a session": records the request for the team to follow up. No payment is taken here. */
export async function requestAdvisory(useCase: string, message: string): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const { user, company } = await founderCompany();
  const text = z.string().max(2000).safeParse(message);
  if (!text.success) return { ok: false, error: "Please keep it under 2,000 characters." };
  const { created } = await createAdvisoryRequest(user, company, isUseCaseId(useCase) ? useCase : null, text.data);
  return { ok: true, created };
}
