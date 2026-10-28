"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import type { CsvField, CsvPreview } from "@/lib/benchmark-library/csv";
import type { RawRecord } from "@/lib/benchmark-library/records";
import {
  addRecord,
  archiveDataset,
  archiveVersion,
  checkImportFile,
  commitImport,
  createDataset,
  datasetSchema,
  deleteRecord,
  markReviewed,
  openDraft,
  previewImport,
  publishVersion,
  saveSource,
  sourceSchema,
  updateDataset,
  updateRecord,
  validateVersion,
  verifySource,
  type Result,
} from "@/lib/data/benchmark-library";

/** Library management is for administrators only; every action checks the role itself. */
const refresh = (datasetId?: string) => {
  revalidatePath("/advisor/benchmark-library");
  if (datasetId) revalidatePath(`/advisor/benchmark-library/${datasetId}`);
};
const uuid = (v: unknown) => z.uuid().parse(v);
const list = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const first = (e: z.ZodError) => { const i = e.issues[0]; return i ? `${i.path.join(".") || "Field"}: ${i.message}` : "Check the fields."; };

export async function saveSourceAction(_prev: Result<{ id?: string }> | null, fd: FormData): Promise<Result<{ id?: string }>> {
  const admin = await requireRole(["admin"]);
  const s = (k: string) => String(fd.get(k) ?? "");
  const parsed = sourceSchema.safeParse({
    name: s("name"),
    publisher: s("publisher"),
    url: s("url").trim(),
    documentRef: s("documentRef"),
    publishedOn: s("publishedOn"),
    collectionPeriod: s("collectionPeriod"),
    kind: s("kind"),
    attribution: s("attribution"),
    licenceNote: s("licenceNote"),
    allowCustomerDisplay: fd.get("allowCustomerDisplay") === "on",
    allowDerived: fd.get("allowDerived") === "on",
    snapshotSource: fd.get("snapshotSource") === "on",
    standardReference: fd.get("standardReference") === "on",
    reliability: s("reliability"),
    updateFrequency: s("updateFrequency"),
    reviewIntervalDays: s("reviewIntervalDays").trim() || null,
    consentReference: s("consentReference"),
    minAggregationSize: s("minAggregationSize").trim() || null,
    notes: s("notes"),
  });
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const id = z.uuid().safeParse(fd.get("id"));
  const r = await saveSource(admin, parsed.data, id.success ? id.data : undefined);
  refresh();
  revalidatePath("/advisor/benchmark-library/sources");
  return r;
}

export async function verifySourceAction(id: string): Promise<Result> {
  const admin = await requireRole(["admin"]);
  const r = await verifySource(admin, uuid(id));
  revalidatePath("/advisor/benchmark-library/sources");
  return r;
}

export async function saveDatasetAction(_prev: Result<{ id?: string }> | null, fd: FormData): Promise<Result<{ id?: string }>> {
  const admin = await requireRole(["admin"]);
  const parsed = datasetSchema.safeParse({
    name: fd.get("name"),
    description: String(fd.get("description") ?? ""),
    sourceId: fd.get("sourceId"),
    companyTypes: list(fd.get("companyTypes")),
    businessModels: list(fd.get("businessModels")),
  });
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const id = z.uuid().safeParse(fd.get("id"));
  if (id.success) {
    const r = await updateDataset(admin, id.data, parsed.data);
    refresh(id.data);
    return r.ok ? { ok: true, id: id.data } : r;
  }
  const r = await createDataset(admin, parsed.data);
  refresh();
  return r.ok ? { ok: true, id: r.id } : r;
}

export async function archiveDatasetAction(datasetId: string): Promise<Result> {
  const admin = await requireRole(["admin"]);
  const r = await archiveDataset(admin, uuid(datasetId));
  refresh(datasetId);
  return r;
}

export async function openDraftAction(datasetId: string): Promise<Result<{ versionId?: string }>> {
  const admin = await requireRole(["admin"]);
  const r = await openDraft(admin, uuid(datasetId));
  refresh(datasetId);
  return r;
}

export async function versionAction(datasetId: string, versionId: string, action: "validate" | "publish" | "archive" | "review", extra?: string): Promise<Result & { issues?: unknown }> {
  const admin = await requireRole(["admin"]);
  const v = uuid(versionId);
  const r =
    action === "validate"
      ? await validateVersion(admin, v)
      : action === "publish"
        ? await publishVersion(admin, v, z.iso.date().safeParse(extra).success ? extra! : null)
        : action === "archive"
          ? await archiveVersion(admin, v)
          : await markReviewed(admin, v, extra?.trim().slice(0, 500) || null);
  refresh(uuid(datasetId));
  return r;
}

const rawSchema = z.record(z.string(), z.string().max(4000)) as z.ZodType<RawRecord>;

export async function saveRecordAction(datasetId: string, target: { versionId?: string; recordId?: string }, raw: RawRecord): Promise<Result & { issues?: { field?: string; message: string }[] }> {
  const admin = await requireRole(["admin"]);
  const data = rawSchema.parse(raw);
  const r = target.recordId ? await updateRecord(admin, uuid(target.recordId), data) : await addRecord(admin, uuid(target.versionId), data);
  refresh(uuid(datasetId));
  return r;
}

export async function deleteRecordAction(datasetId: string, recordId: string): Promise<Result> {
  const admin = await requireRole(["admin"]);
  const r = await deleteRecord(admin, uuid(recordId));
  refresh(uuid(datasetId));
  return r;
}

const mapSchema = z.record(z.string(), z.number().int().min(0).max(200)).optional() as z.ZodType<Partial<Record<CsvField, number>> | undefined>;

async function readFile(fd: FormData): Promise<{ filename: string; text: string } | { error: string }> {
  const file = fd.get("file");
  if (!(file instanceof File)) return { error: "Choose a CSV file." };
  const text = await file.text();
  const problem = checkImportFile(file.name, file.size, text);
  return problem ? { error: problem } : { filename: file.name, text };
}

/** Step 1 of an import: read and validate, change nothing. */
export async function previewImportAction(datasetId: string, fd: FormData): Promise<Result<{ preview?: CsvPreview }>> {
  const admin = await requireRole(["admin"]);
  const f = await readFile(fd);
  if ("error" in f) return { ok: false, error: f.error };
  const map = fd.get("map") ? mapSchema.parse(JSON.parse(String(fd.get("map")))) : undefined;
  return previewImport(admin, uuid(datasetId), f.text, map);
}

/** Step 2: saves accepted rows to the dataset's draft and logs the import (stored privately in Blob when configured). */
export async function commitImportAction(datasetId: string, fd: FormData): Promise<Result<{ accepted?: number; versionId?: string }>> {
  const admin = await requireRole(["admin"]);
  const f = await readFile(fd);
  if ("error" in f) return { ok: false, error: f.error };
  const map = fd.get("map") ? mapSchema.parse(JSON.parse(String(fd.get("map")))) : undefined;
  const store = process.env.BLOB_READ_WRITE_TOKEN
    ? async (path: string, text: string) => (await put(path, text, { access: "private", contentType: "text/csv", addRandomSuffix: true })).url
    : undefined;
  const r = await commitImport(admin, uuid(datasetId), f, map, store);
  refresh(datasetId);
  return r;
}
