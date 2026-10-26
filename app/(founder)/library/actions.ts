"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { founderContext } from "@/lib/data/founder-context";
import { createUseCaseCheckout } from "@/lib/data/payments";
import { getCompanyUseCase, saveObjectiveAnswer, type SaveAnswerResult } from "@/lib/data/use-cases";
import { track } from "@/lib/events";
import { stripeConfigured } from "@/lib/stripe";
import { getUseCase, isUseCaseId, missingRequired } from "@/lib/use-cases";

async function founderCompany() {
  const { user, company } = await founderContext();
  if (!company) throw new Error("Your company isn't set up yet.");
  return { user, company };
}

/** Autosave for one objective answer. */
export async function saveAnswer(useCaseId: string, fieldId: string, value: string): Promise<SaveAnswerResult> {
  const { company } = await founderCompany();
  if (!isUseCaseId(useCaseId) || typeof fieldId !== "string" || typeof value !== "string") return { ok: false, error: "Unknown question." };
  const result = await saveObjectiveAnswer(company, useCaseId, fieldId, value);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Submits the objective and opens Stripe Checkout for this use case. */
export async function startUseCaseCheckout(useCaseId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { user, company } = await founderCompany();
  const def = getUseCase(useCaseId);
  if (!def) return { ok: false, error: "Unknown use case." };
  const row = await getCompanyUseCase(company.id, def.id);
  if (row?.activatedAt) return { ok: false, error: "This use case is already active." };
  const missing = missingRequired(def, row?.objective);
  if (missing.length) return { ok: false, error: `Please answer: ${missing.map((f) => f.label).join("; ")}` };
  await track("objective_saved", { userId: user.id, companyId: company.id, props: { use_case: def.id, answers: Object.keys(row?.objective ?? {}).length } });
  if (!stripeConfigured()) return { ok: false, error: "Payments aren't set up yet. Please try again later." };
  const h = await headers();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  try {
    return { ok: true, url: await createUseCaseCheckout(user, company, def.id, appUrl) };
  } catch (err) {
    console.error("[stripe] Checkout failed", err);
    return { ok: false, error: "We couldn't start the payment. Please try again." };
  }
}
