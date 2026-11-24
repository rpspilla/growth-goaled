"use server";

import { requireRole } from "@/lib/auth/session";
import { founderContext } from "@/lib/data/founder-context";
import { BETA_QUESTIONS, saveBetaFeedback } from "@/lib/data/chat";

/** Rally Beta: the founder's feedback on Rally itself. */
export async function betaFeedbackAction(_prev: { ok: boolean; error?: string } | null, f: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(["founder"]);
  const { user, company } = await founderContext();
  const answers = Object.fromEntries(Object.keys(BETA_QUESTIONS).map((k) => [k, String(f.get(k) ?? "")]));
  return saveBetaFeedback(user, company, answers, String(f.get("source") ?? "page"));
}
