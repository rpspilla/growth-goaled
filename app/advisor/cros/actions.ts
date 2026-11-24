"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { parseTags, PHILOSOPHY_FIELDS, STYLE_FIELDS } from "@/lib/cro";
import { decideConflict, detectConflicts, removeCroPhoto, saveCroProfile, setCroPhoto, saveIntelligence, setCroProfileAdmin, setIntelligenceStatus, setStance, type ProfileInput, type RecordInput, type Result } from "@/lib/data/cro";
import { after } from "next/server";

// The CRO network is run by Growth Goaled staff (advisors and admins); what each may change is checked in lib/data/cro.
const staff = () => requireRole(["advisor", "admin"]);
const uuid = (v: unknown) => z.uuid().safeParse(v).success;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const list = (f: FormData, k: string) => parseTags(str(f, k), false);

function refresh() {
  revalidatePath("/advisor/cros", "layout");
  revalidatePath("/advisor/intelligence", "layout");
  revalidatePath("/cros", "layout");
  revalidatePath("/network", "layout");
}

function profileFrom(f: FormData): ProfileInput {
  return {
    name: str(f, "name"),
    headline: str(f, "headline"),
    bio: str(f, "bio"),
    linkedinUrl: str(f, "linkedinUrl"),
    accomplishments: str(f, "accomplishments"),
    industries: list(f, "industries"),
    stages: list(f, "stages"),
    companyTypes: list(f, "companyTypes"),
    functions: list(f, "functions"),
    expertise: list(f, "expertise"),
    websiteUrl: str(f, "websiteUrl"),
    availableForAdvisory: f.get("availableForAdvisory") === "on",
    philosophy: Object.fromEntries(Object.keys(PHILOSOPHY_FIELDS).map((k) => [k, str(f, `philosophy.${k}`)])),
    style: Object.fromEntries(Object.keys(STYLE_FIELDS).map((k) => [k, str(f, `style.${k}`)])),
  };
}

/** A new CRO profile (admins); opens it to fill in. */
export async function createCroAction(_prev: Result | null, f: FormData): Promise<Result> {
  const user = await staff();
  const r = await saveCroProfile(user, null, { name: str(f, "name"), headline: str(f, "headline") });
  if (!r.ok) return r;
  refresh();
  redirect(`/advisor/cros/${r.id}`);
}

export async function saveCroAction(croId: string, _prev: Result | null, f: FormData): Promise<Result> {
  const user = await staff();
  if (!uuid(croId)) return { ok: false, error: "That CRO wasn't found." };
  const r = await saveCroProfile(user, croId, profileFrom(f));
  if (r.ok) refresh();
  return r.ok ? { ok: true } : r;
}

export async function croAdminAction(croId: string, _prev: Result | null, f: FormData): Promise<Result> {
  const user = await staff();
  if (!uuid(croId)) return { ok: false, error: "That CRO wasn't found." };
  const login = str(f, "userId");
  const r = await setCroProfileAdmin(user, croId, { status: str(f, "status") === "published" ? "published" : "draft", inCollective: f.get("inCollective") === "on", userId: uuid(login) ? login : null });
  if (r.ok) refresh();
  return r;
}

function recordFrom(f: FormData): RecordInput {
  const cro = str(f, "primaryCroId");
  const classification = str(f, "classification");
  return {
    type: str(f, "type"),
    category: str(f, "category"),
    title: str(f, "title"),
    content: str(f, "content"),
    tags: list(f, "tags"),
    stages: list(f, "stages"),
    industries: list(f, "industries"),
    companyTypes: list(f, "companyTypes"),
    expertise: list(f, "expertise"),
    primaryCroId: uuid(cro) ? cro : null,
    classification: classification === "collective" || classification === "multi" ? classification : "individual",
    coAuthorIds: f.getAll("coAuthorIds").map(String).filter(uuid),
    source: str(f, "source"),
    evidence: (["opinion", "experience", "case_evidence", "data"].includes(str(f, "evidence")) ? str(f, "evidence") : "opinion") as RecordInput["evidence"],
    relatedIds: f.getAll("relatedIds").map(String).filter(uuid),
    modes: f.getAll("modes").map(String).filter((m): m is "individual" | "collective" => m === "individual" || m === "collective"),
  };
}

export async function createRecordAction(_prev: Result | null, f: FormData): Promise<Result> {
  const user = await staff();
  const r = await saveIntelligence(user, null, recordFrom(f));
  if (!r.ok) return r;
  refresh();
  redirect(`/advisor/intelligence/${r.id}`);
}

export async function saveRecordAction(recordId: string, _prev: Result | null, f: FormData): Promise<Result> {
  const user = await staff();
  if (!uuid(recordId)) return { ok: false, error: "That record wasn't found." };
  const r = await saveIntelligence(user, recordId, recordFrom(f));
  if (r.ok) refresh();
  return r.ok ? { ok: true } : r;
}

export async function recordStatusAction(recordId: string, status: "draft" | "submitted" | "validated" | "rejected" | "retired"): Promise<Result> {
  const user = await staff();
  if (!uuid(recordId)) return { ok: false, error: "That record wasn't found." };
  const r = await setIntelligenceStatus(user, recordId, status);
  if (r.ok) refresh();
  // A newly validated record: look for other CROs' records that give opposing guidance.
  if (r.ok && status === "validated") after(() => detectConflicts(recordId).catch((err) => console.error("[cro] Conflict check failed", err)));
  return r;
}

export async function stanceAction(recordId: string, _prev: Result | null, f: FormData): Promise<Result> {
  const user = await staff();
  if (!uuid(recordId)) return { ok: false, error: "That record wasn't found." };
  const s = str(f, "stance");
  const r = await setStance(user, recordId, s === "endorses" || s === "disputes" ? s : null, str(f, "note"));
  if (r.ok) refresh();
  return r;
}

export type ImportState = { error?: string; summary?: Omit<Extract<import("@/lib/data/workbook-import").ImportResult, { ok: true }>, "ok"> } | null;

/** Import a CRO Training Workbook (.csv or .xlsx): scenarios become attributed Scenario records, submitted for review. */
export async function importWorkbookAction(_prev: ImportState, f: FormData): Promise<ImportState> {
  const user = await staff();
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the workbook file." };
  const respondent = str(f, "respondentCroId");
  const { importWorkbook, workbookRows } = await import("@/lib/data/workbook-import");
  const { WorkbookError } = await import("@/lib/workbook");
  let rows: string[][];
  try {
    rows = await workbookRows(file.name, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof WorkbookError) return { error: err.message };
    console.error("[workbook] Read failed", err);
    return { error: "That file couldn't be read. Save it as .csv or .xlsx and try again." };
  }
  const result = await importWorkbook(user, { filename: file.name, rows, respondentCroId: uuid(respondent) ? respondent : null });
  if (!result.ok) return { error: result.error };
  refresh();
  return { summary: { scenarios: result.scenarios, created: result.created, updated: result.updated, unchanged: result.unchanged, unanswered: result.unanswered, skippedNames: result.skippedNames, recordIds: result.recordIds } };
}

/** Validate an import's submitted records at once (never the author's own, unless an admin). */
export async function validateImportedAction(recordIds: string[]): Promise<{ validated: number; refused: number }> {
  const user = await staff();
  const { validateImported } = await import("@/lib/data/workbook-import");
  const ids = Array.isArray(recordIds) ? recordIds.filter(uuid) : [];
  const result = await validateImported(user, ids);
  refresh();
  after(async () => {
    for (const id of ids) await detectConflicts(id).catch((err) => console.error("[cro] Conflict check failed", err));
  });
  return result;
}

/** Confirm a flagged conflict (the Collective names the disagreement) or dismiss it. */
export async function decideConflictAction(conflictId: string, decision: "confirmed" | "dismissed"): Promise<Result> {
  const user = await staff();
  if (!uuid(conflictId) || (decision !== "confirmed" && decision !== "dismissed")) return { ok: false, error: "That conflict wasn't found." };
  const r = await decideConflict(user, conflictId, decision);
  if (r.ok) refresh();
  return r;
}

/** Upload (or replace) a CRO's profile photo; the browser has already resized it. */
export async function uploadCroPhotoAction(croId: string, f: FormData): Promise<Result<{ url: string }>> {
  const user = await staff();
  if (!uuid(croId)) return { ok: false, error: "That CRO wasn't found." };
  const file = f.get("photo");
  if (!(file instanceof File)) return { ok: false, error: "Choose a photo." };
  const r = await setCroPhoto(user, croId, new Uint8Array(await file.arrayBuffer()));
  if (r.ok) refresh();
  return r;
}

export async function removeCroPhotoAction(croId: string): Promise<Result> {
  const user = await staff();
  if (!uuid(croId)) return { ok: false, error: "That CRO wasn't found." };
  const r = await removeCroPhoto(user, croId);
  if (r.ok) refresh();
  return r;
}
