"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { DOC_TYPE_FOR_CATEGORY, processDocument, registerDocument, resetFailedDocument, reviewDataPoint } from "@/lib/data/documents";
import { getReadiness, latestAssessment, markReadyForBenchmark, updateDataItem, type ItemPatch, type UpdateResult } from "@/lib/data/readiness";
import { summarizeGaps } from "@/lib/ai/readiness-summary";
import { readinessFacts } from "@/lib/readiness-facts";

/** Every action works on the signed-in founder's own company; the client never supplies a company id. */
async function founderCompany() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) throw new Error("Your company isn't set up yet.");
  return { user, company };
}

const refresh = () => revalidatePath("/readiness", "layout");

export async function updateItem(itemKey: string, patch: ItemPatch): Promise<UpdateResult> {
  const { user, company } = await founderCompany();
  const result = await updateDataItem(user, company, z.string().max(64).parse(itemKey), patch);
  if (result.ok) refresh();
  return result;
}

const registerInput = z.object({
  pathname: z.string().min(1).max(1024),
  filename: z.string().min(1).max(255),
  category: z.enum(schema.dataCategory.enumValues),
  itemKeys: z.array(z.string().max(64)).max(20),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export type UploadResult = { ok: true; duplicate: boolean } | { ok: false; error: string };

/** Called after the browser finishes uploading to Blob; analysis runs after the response. */
export async function registerUpload(input: z.infer<typeof registerInput>): Promise<UploadResult> {
  const { user, company } = await founderCompany();
  const parsed = registerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };
  try {
    const { doc, duplicate } = await registerDocument(user, company, { ...parsed.data, docType: DOC_TYPE_FOR_CATEGORY[parsed.data.category] });
    if (!duplicate) after(() => processDocument(doc.id));
    refresh();
    return { ok: true, duplicate };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
}

export async function retryDocument(documentId: string): Promise<void> {
  const { company } = await founderCompany();
  if (await resetFailedDocument(company, z.uuid().parse(documentId))) after(() => processDocument(documentId));
  refresh();
}

export async function reviewPoint(dataPointId: string, decision: "accepted" | "rejected"): Promise<void> {
  const { user, company } = await founderCompany();
  await reviewDataPoint(user, company, z.uuid().parse(dataPointId), z.enum(["accepted", "rejected"]).parse(decision));
  refresh();
}

export async function sendForBenchmark(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { company } = await founderCompany();
  const result = await markReadyForBenchmark(company);
  revalidatePath("/", "layout");
  return result;
}

export type SummaryResult = { ok: true } | { ok: false; error: string };

/** Saves the rule-based facts and an AI-written summary of them. At most one every two minutes. */
export async function generateGapSummary(): Promise<SummaryResult> {
  const { user, company } = await founderCompany();
  const last = await latestAssessment(company);
  if (last && Date.now() - last.createdAt.getTime() < 2 * 60_000) return { ok: false, error: "A summary was just generated. Try again in a couple of minutes." };

  const { assessment, items } = await getReadiness(company);
  const facts = readinessFacts(assessment, Object.fromEntries(items.map((i) => [i.itemKey, i.status])));
  try {
    const { summary, model, tokensIn, tokensOut } = await summarizeGaps(facts);
    await db.insert(schema.readinessAssessments).values({ companyId: company.id, facts, summary, model, tokensIn, tokensOut, createdBy: user.id });
  } catch (err) {
    console.error("[readiness] Gap summary failed", err);
    // Keep the facts even when the summary fails, so the record is auditable.
    await db.insert(schema.readinessAssessments).values({ companyId: company.id, facts, summary: null, createdBy: user.id });
    return { ok: false, error: "The summary couldn't be generated right now. The checks below are still up to date." };
  }
  refresh();
  return { ok: true };
}
