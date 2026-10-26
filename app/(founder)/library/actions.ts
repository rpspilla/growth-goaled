"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { founderContext } from "@/lib/data/founder-context";
import { getIntakeAnswers, saveIntakeAnswer } from "@/lib/data/intake";
import { CheckoutError, createAssessmentCheckout } from "@/lib/data/payments";
import { getCompanyUseCase, saveObjectiveAnswer, type SaveAnswerResult } from "@/lib/data/use-cases";
import { track } from "@/lib/events";
import { displayValue, getField } from "@/lib/intake";
import { sellableUseCases } from "@/lib/pricing";
import { stripeConfigured } from "@/lib/stripe";
import { getUseCase, isUseCaseId, missingRequired, parseProfileFieldId, profileQuestions } from "@/lib/use-cases";

async function founderCompany() {
  const { user, company } = await founderContext();
  if (!company) throw new Error("Your company isn't set up yet.");
  return { user, company };
}

/**
 * Autosave for one questionnaire answer. Company-profile questions ("profile.section.field")
 * save through the intake, so the profile and its figures stay the single source.
 */
export async function saveAnswer(useCaseId: string, fieldId: string, value: string): Promise<SaveAnswerResult> {
  const { user, company } = await founderCompany();
  if (!isUseCaseId(useCaseId) || typeof fieldId !== "string" || typeof value !== "string") return { ok: false, error: "Unknown question." };
  const profile = parseProfileFieldId(fieldId);
  if (profile) {
    const useCase = getUseCase(useCaseId)!;
    if (!profileQuestions(useCase).some((q) => q.section === profile.section && q.field === profile.field)) return { ok: false, error: "Unknown question." };
    const result = await saveIntakeAnswer(user, company, profile.section, profile.field, value);
    if (!result.ok) return result;
    revalidatePath("/", "layout");
    const answers = await getIntakeAnswers(company);
    const field = getField(profile.section, profile.field)!;
    return { ok: true, value: displayValue(field, answers[`${profile.section}.${profile.field}`]) };
  }
  const result = await saveObjectiveAnswer(company, useCaseId, fieldId, value);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Records the questionnaire as submitted (it's already saved field by field) and opens the free Snapshot. */
export async function submitQuestionnaire(useCaseId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, company } = await founderCompany();
  const def = getUseCase(useCaseId);
  if (!def) return { ok: false, error: "Unknown use case." };
  const [row, answers] = await Promise.all([getCompanyUseCase(company.id, def.id), getIntakeAnswers(company)]);
  if (missingRequired(def, row?.objective, answers).length) return { ok: false, error: "Please answer the required questions first." };
  await track("objective_saved", { userId: user.id, companyId: company.id, props: { use_case: def.id, answers: Object.keys(row?.objective ?? {}).length } });
  return { ok: true };
}

/** Opens Stripe Checkout for the $499 assessment. Payment is confirmed server-side before anything unlocks. */
export async function startAssessmentCheckout(useCaseId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { user, company } = await founderCompany();
  const def = getUseCase(useCaseId);
  if (!def) return { ok: false, error: "Unknown use case." };
  if (!sellableUseCases().includes(def.id)) return { ok: false, error: "This assessment isn't available to buy yet." };
  const [row, answers] = await Promise.all([getCompanyUseCase(company.id, def.id), getIntakeAnswers(company)]);
  if (row?.activatedAt) return { ok: false, error: "You already have this assessment." };
  if (missingRequired(def, row?.objective, answers).length) return { ok: false, error: "Please answer the questionnaire first." };
  if (!stripeConfigured()) return { ok: false, error: "Payments aren't set up yet. Please try again later." };
  const h = await headers();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  try {
    return { ok: true, url: await createAssessmentCheckout(user, company, def.id, appUrl) };
  } catch (err) {
    if (err instanceof CheckoutError) return { ok: false, error: err.message };
    console.error("[stripe] Checkout failed", err);
    return { ok: false, error: "We couldn't start the payment. Please try again." };
  }
}
