"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import {
  applySuggestions,
  DOC_TYPE_FOR_CATEGORY,
  processDocument,
  processInboxDocument,
  registerDocument,
  importGoogleLink,
  removeDocument,
  resetSorting,
  type RemoveResult,
  resetFailedDocument,
  reviewDataPoint,
  sortDocument,
} from "@/lib/data/documents";
import { getReadiness, latestAssessment, markReadyForBenchmark, updateDataItem, type ItemPatch, type UpdateResult } from "@/lib/data/readiness";
import { summarizeGaps } from "@/lib/ai/readiness-summary";
import { readinessFacts } from "@/lib/readiness-facts";
import { createBenchmarkVersion, runBenchmarkPipeline } from "@/lib/data/deliverables";

/** Every action works on the signed-in founder's own company; the client never supplies a company id. */
async function founderCompany() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) throw new Error("Your company isn't set up yet.");
  return { user, company };
}

const refresh = () => revalidatePath("/data", "layout");

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

const inboxInput = z.object({
  pathname: z.string().min(1).max(1024),
  filename: z.string().min(1).max(255),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

/** "Upload whatever you have": registers an inbox file, then reads, extracts and sorts it after the response. */
export async function registerInboxUpload(input: z.infer<typeof inboxInput>): Promise<UploadResult> {
  const { user, company } = await founderCompany();
  const parsed = inboxInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };
  try {
    const { doc, duplicate } = await registerDocument(user, company, { ...parsed.data, docType: "other" });
    if (!duplicate) after(() => processInboxDocument(doc.id));
    else if (!doc.suggestions) after(() => sortDocument(doc.id));
    refresh();
    return { ok: true, duplicate };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
}

/** Imports a file from a Google link into the inbox; reading and sorting run after the response. */
export async function importFromLink(url: string): Promise<{ ok: true; duplicate: boolean; filename: string } | { ok: false; error: string }> {
  const { user, company } = await founderCompany();
  const raw = z.string().trim().min(1).max(2000).safeParse(url);
  if (!raw.success) return { ok: false, error: "Paste a link." };
  const result = await importGoogleLink(user, company, raw.data);
  if (!result.ok) return result;
  if (!result.duplicate) after(() => processInboxDocument(result.documentId));
  refresh();
  return { ok: true, duplicate: result.duplicate, filename: result.filename };
}

/** Confirms which checklist items an uploaded file covers. */
export async function confirmFileItems(documentId: string, itemKeys: string[]): Promise<{ ok: true; linked: number } | { ok: false; error: string }> {
  const { user, company } = await founderCompany();
  const result = await applySuggestions(user, company, z.uuid().parse(documentId), z.array(z.string().max(64)).max(80).parse(itemKeys));
  refresh();
  return result;
}

/** Removes an uploaded file and undoes what it added (see removeDocument). */
export async function removeFile(documentId: string): Promise<RemoveResult> {
  const { user, company } = await founderCompany();
  const id = z.uuid().safeParse(documentId);
  if (!id.success) return { ok: false, error: "File not found." };
  const result = await removeDocument(user, company, id.data);
  revalidatePath("/", "layout");
  return result;
}

export async function retryDocument(documentId: string): Promise<void> {
  const { company } = await founderCompany();
  const reset = await resetFailedDocument(company, z.uuid().parse(documentId));
  if (reset) after(() => (reset.inbox ? processInboxDocument(documentId) : processDocument(documentId)));
  refresh();
}

export async function resortFile(documentId: string): Promise<void> {
  const { company } = await founderCompany();
  if (await resetSorting(company, z.uuid().parse(documentId))) after(() => sortDocument(documentId));
  refresh();
}

export async function reviewPoint(dataPointId: string, decision: "accepted" | "rejected"): Promise<void> {
  const { user, company } = await founderCompany();
  await reviewDataPoint(user, company, z.uuid().parse(dataPointId), z.enum(["accepted", "rejected"]).parse(decision));
  refresh();
}

/** Hands the data to the advisor and starts drafting the Benchmark (nothing reaches the founder until it's published). */
export async function sendForBenchmark(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { company } = await founderCompany();
  const result = await markReadyForBenchmark(company);
  if (result.ok) {
    const version = await createBenchmarkVersion(company);
    if (version) after(() => runBenchmarkPipeline(version.id));
  }
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
