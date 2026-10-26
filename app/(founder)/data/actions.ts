"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schema } from "@/lib/db";
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
import { updateDataItem, type ItemPatch, type UpdateResult } from "@/lib/data/readiness";
import { createAssessmentVersion, runAssessmentPipeline } from "@/lib/data/assessments";
import { founderContext } from "@/lib/data/founder-context";
import { track } from "@/lib/events";

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

/**
 * "Analyze my data": runs the assessment engine in the background for the active assessment,
 * with whatever has been shared so far (missing data is reported as gaps, never a blocker).
 * Also used to re-run with new data.
 */
export async function requestAssessment(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, company } = await founderCompany();
  const { active } = await founderContext();
  if (!active) return { ok: false, error: "Buy an assessment first." };
  const version = await createAssessmentVersion(company, active.def.id);
  if (!version) return { ok: false, error: "Your data is already being analyzed." };
  await track("analysis_requested", { userId: user.id, companyId: company.id, props: { use_case: active.def.id, version: version.version } });
  after(() => runAssessmentPipeline(version.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

