"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getManagedCompany } from "@/lib/data/companies";
import { saveAdvisorSummary, setHealth } from "@/lib/data/portfolio";
import { updateDataItem, type UpdateResult } from "@/lib/data/readiness";
import { activateWithoutPayment } from "@/lib/data/use-cases";
import { approveAssessment } from "@/lib/data/assessments";
import { getDeliverable } from "@/lib/data/deliverables";
import { isComingSoon, isUseCaseId } from "@/lib/use-cases";
import { clearOverride, setOverride } from "@/lib/data/benchmark-library";
import { chooseFigure, enterFigure, type FigureResult } from "@/lib/data/figures";
import { parseFigure } from "@/lib/figures";
import { isMetricKey } from "@/lib/metrics";

async function managed(companyId: string) {
  const user = await requireRole(["advisor", "admin"]);
  const id = z.uuid().safeParse(companyId);
  const company = id.success ? await getManagedCompany(user, id.data) : null;
  return company ? { user, company } : null;
}
const refresh = (id: string) => {
  revalidatePath(`/advisor/companies/${id}`, "layout");
  revalidatePath("/advisor/portfolio");
};

export async function updateHealth(companyId: string, health: string): Promise<void> {
  const ctx = await managed(companyId);
  const h = z.enum(["good", "watch", "critical"]).nullable().parse(health || null);
  if (ctx && (await setHealth(ctx.user, ctx.company, h))) refresh(companyId);
}

export async function updateSummary(companyId: string, text: string): Promise<{ ok: boolean }> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false };
  const ok = await saveAdvisorSummary(ctx.user, ctx.company, z.string().max(4000).parse(text));
  refresh(companyId);
  return { ok };
}

/** Advisor review of a founder's data item: set quality (including Validated) or a follow-up request. */
export async function reviewItem(companyId: string, itemKey: string, patch: { quality?: "validated" | "unverified" | "estimated"; followUp?: string | null }): Promise<UpdateResult> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false, error: "Not found." };
  const result = await updateDataItem(ctx.user, ctx.company, z.string().max(64).parse(itemKey), patch);
  if (result.ok) {
    refresh(companyId);
    revalidatePath("/data", "layout");
  }
  return result;
}

/** Pilot activation without payment, recorded with who and why (HANDOFF §13.6). */
export async function activateForCompany(companyId: string, useCase: string, note: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false, error: "Not found." };
  if (!isUseCaseId(useCase)) return { ok: false, error: "Unknown use case." };
  if (isComingSoon(useCase)) return { ok: false, error: "This question is coming soon and can't be granted yet." };
  const reason = z.string().trim().max(500).safeParse(note);
  if (!reason.success || !reason.data) return { ok: false, error: "Add a short note saying why (e.g. pilot, partner deal)." };
  await activateWithoutPayment(ctx.user, ctx.company, useCase, reason.data);
  refresh(companyId);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Marks the founder's assessment version reviewed; the founder sees "Reviewed by …". */
export async function approveAssessmentAction(companyId: string, deliverableId: string, comment: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false, error: "Not found." };
  const id = z.uuid().safeParse(deliverableId);
  const d = id.success ? await getDeliverable(id.data) : null;
  if (!d || d.companyId !== ctx.company.id) return { ok: false, error: "Not found." };
  const ok = await approveAssessment(ctx.user, d.id, z.string().max(2000).parse(comment));
  if (!ok) return { ok: false, error: "This version can't be marked reviewed." };
  refresh(companyId);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * An advisor's benchmark choice for one metric of one of their companies: "auto" (the matching
 * service decides), "none" (don't benchmark it), or a published record id. Used from the next brief on.
 */
export async function setBenchmarkChoice(companyId: string, metric: string, choice: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false, error: "Not allowed." };
  const r =
    choice === "auto"
      ? await clearOverride(ctx.user, ctx.company, metric)
      : await setOverride(ctx.user, ctx.company, metric, choice === "none" ? null : z.uuid().parse(choice), z.string().max(1000).parse(reason));
  if (r.ok) refresh(companyId);
  return r;
}

/** The advisor settles a figure that disagrees across sources (founders aren't asked; see lib/figures.ts figureRank). */
export async function chooseFigureForCompany(companyId: string, metric: string, dataPointId: string): Promise<FigureResult> {
  const ctx = await managed(companyId);
  const id = z.uuid().safeParse(dataPointId);
  if (!ctx || !id.success || !isMetricKey(metric)) return { ok: false, error: "That figure isn't available." };
  const result = await chooseFigure(ctx.user, ctx.company, metric, id.data);
  if (result.ok) refresh(companyId);
  return result;
}

export async function enterFigureForCompany(companyId: string, metric: string, raw: string): Promise<FigureResult> {
  const ctx = await managed(companyId);
  if (!ctx || !isMetricKey(metric)) return { ok: false, error: "That figure isn't available." };
  const value = typeof raw === "string" ? parseFigure(raw) : null;
  if (value === null) return { ok: false, error: "Enter a number, e.g. 4,200,000 or 94." };
  const result = await enterFigure(ctx.user, ctx.company, metric, value);
  if (result.ok) refresh(companyId);
  return result;
}
