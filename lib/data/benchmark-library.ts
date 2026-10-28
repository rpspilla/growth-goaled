import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import type { BenchmarkImportError, BenchmarkVersionEvent, Company, User } from "@/lib/db/schema";
import { isReference } from "@/lib/benchmark-library/reference";
import { compare, type BenchmarkComparison } from "@/lib/benchmark-library/compare";
import { previewCsv, type CsvField, type CsvPreview } from "@/lib/benchmark-library/csv";
import { DEFAULT_REVIEW_DAYS, isStale, matchBenchmark, type CandidateRecord, type CompanyProfile } from "@/lib/benchmark-library/match";
import { crossRecordIssues, dedupeKey, type RawRecord, type RecordInput, STAGES, validateRecord } from "@/lib/benchmark-library/records";
import { isMetricKey, METRICS, type MetricKey } from "@/lib/metrics";

/**
 * Benchmark Library: sources, datasets, versions and records. Every write is admin-only and
 * checked here (callers check too). Published versions are immutable: a change means a new
 * draft version, and reports keep the version and record ids they used.
 */

type Version = typeof schema.benchmarkDatasetVersions.$inferSelect;
type RecordRow = typeof schema.benchmarkRecords.$inferSelect;
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const isLibraryAdmin = (u: User) => u.role === "admin";
const denied = { ok: false as const, error: "Only administrators can change the Benchmark Library." };
const EDITABLE: Version["status"][] = ["draft", "validated"];
const event = (actor: User | null, action: string, note?: string): BenchmarkVersionEvent => ({ at: new Date().toISOString(), by: actor?.email ?? null, action, ...(note ? { note } : {}) });
const pushHistory = (e: BenchmarkVersionEvent) => sql`${schema.benchmarkDatasetVersions.history} || ${JSON.stringify([e])}::jsonb`;

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
export const sourceSchema = z.object({
  name: z.string().trim().min(2).max(200),
  publisher: opt(200),
  url: z.union([z.url().max(1000), z.literal("")]).optional().transform((v) => v || null),
  documentRef: opt(500),
  publishedOn: z.union([z.iso.date(), z.literal("")]).optional().transform((v) => v || null),
  collectionPeriod: opt(200),
  kind: z.enum(schema.benchmarkSourceKind.enumValues),
  attribution: opt(1000),
  licenceNote: opt(2000),
  allowCustomerDisplay: z.boolean(),
  allowDerived: z.boolean(),
  reliability: z.enum(schema.benchmarkReliability.enumValues),
  updateFrequency: opt(200),
  reviewIntervalDays: z.coerce.number().int().min(7).max(3650).optional().nullable(),
  consentReference: opt(500),
  minAggregationSize: z.coerce.number().int().min(5).max(100_000).optional().nullable(),
  notes: opt(4000),
  snapshotSource: z.boolean().optional(),
  standardReference: z.boolean().optional(),
});
export type SourceInput = z.infer<typeof sourceSchema>;

export async function listSources() {
  const sources = await db.select().from(schema.benchmarkSources).orderBy(asc(schema.benchmarkSources.name));
  const datasets = await db.select({ sourceId: schema.benchmarkDatasets.sourceId, n: count() }).from(schema.benchmarkDatasets).groupBy(schema.benchmarkDatasets.sourceId);
  return sources.map((s) => ({ ...s, datasets: datasets.find((d) => d.sourceId === s.id)?.n ?? 0 }));
}

export async function saveSource(actor: User, input: SourceInput, id?: string): Promise<Result<{ id: string }>> {
  if (!isLibraryAdmin(actor)) return denied;
  if (input.kind === "aggregated_customer" && (!input.consentReference || !input.minAggregationSize))
    return { ok: false, error: "Aggregated customer data needs a consent reference and a minimum aggregation size before it can be recorded." };
  const values = { ...input, reviewIntervalDays: input.reviewIntervalDays ?? null, minAggregationSize: input.minAggregationSize ?? null, snapshotSource: input.snapshotSource ?? false, standardReference: input.standardReference ?? false };
  if (id) {
    const [row] = await db.update(schema.benchmarkSources).set({ ...values, updatedAt: new Date() }).where(eq(schema.benchmarkSources.id, id)).returning({ id: schema.benchmarkSources.id });
    return row ? { ok: true, id: row.id } : { ok: false, error: "Source not found." };
  }
  // Legacy `type` stays meaningful for the Phase 1 cohort tool: internal research is "advisory".
  const [row] = await db
    .insert(schema.benchmarkSources)
    .values({ ...values, type: input.kind === "internal_research" ? "advisory" : "public", importedBy: actor.id })
    .returning({ id: schema.benchmarkSources.id });
  return { ok: true, id: row!.id };
}

export async function verifySource(actor: User, id: string): Promise<Result> {
  if (!isLibraryAdmin(actor)) return denied;
  const r = await db.update(schema.benchmarkSources).set({ lastVerifiedAt: new Date() }).where(eq(schema.benchmarkSources.id, id)).returning({ id: schema.benchmarkSources.id });
  return r.length ? { ok: true } : { ok: false, error: "Source not found." };
}

// ---------------------------------------------------------------------------
// Datasets and versions
// ---------------------------------------------------------------------------

export const datasetSchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: opt(2000),
  sourceId: z.uuid(),
  companyTypes: z.array(z.string().trim().min(1).max(80)).max(20),
  businessModels: z.array(z.string().trim().min(1).max(80)).max(20),
});
export type DatasetInput = z.infer<typeof datasetSchema>;

const nameTaken = (e: unknown) => String((e as { cause?: { message?: string } })?.cause?.message ?? (e as Error)?.message).includes("benchmark_datasets_name_idx");

export async function createDataset(actor: User, input: DatasetInput): Promise<Result<{ id: string; versionId: string }>> {
  if (!isLibraryAdmin(actor)) return denied;
  const [src] = await db.select({ id: schema.benchmarkSources.id }).from(schema.benchmarkSources).where(eq(schema.benchmarkSources.id, input.sourceId)).limit(1);
  if (!src) return { ok: false, error: "Choose a source." };
  try {
    const [d] = await db.insert(schema.benchmarkDatasets).values({ ...input, createdBy: actor.id }).returning({ id: schema.benchmarkDatasets.id });
    const [v] = await db
      .insert(schema.benchmarkDatasetVersions)
      .values({ datasetId: d!.id, version: 1, createdBy: actor.id, history: [event(actor, "created", "Version 1 started as a draft")] })
      .returning({ id: schema.benchmarkDatasetVersions.id });
    return { ok: true, id: d!.id, versionId: v!.id };
  } catch (e) {
    if (nameTaken(e)) return { ok: false, error: "A dataset with that name already exists." };
    throw e;
  }
}

export async function updateDataset(actor: User, id: string, input: DatasetInput): Promise<Result> {
  if (!isLibraryAdmin(actor)) return denied;
  try {
    const r = await db.update(schema.benchmarkDatasets).set({ ...input, updatedAt: new Date() }).where(eq(schema.benchmarkDatasets.id, id)).returning({ id: schema.benchmarkDatasets.id });
    return r.length ? { ok: true } : { ok: false, error: "Dataset not found." };
  } catch (e) {
    if (nameTaken(e)) return { ok: false, error: "A dataset with that name already exists." };
    throw e;
  }
}

/** Archiving stops new matches; reports that used it keep their copy and record ids. */
export async function archiveDataset(actor: User, id: string): Promise<Result> {
  if (!isLibraryAdmin(actor)) return denied;
  const r = await db.update(schema.benchmarkDatasets).set({ archivedAt: new Date() }).where(and(eq(schema.benchmarkDatasets.id, id), isNull(schema.benchmarkDatasets.archivedAt))).returning({ id: schema.benchmarkDatasets.id });
  if (!r.length) return { ok: false, error: "Dataset not found or already archived." };
  await db
    .update(schema.benchmarkDatasetVersions)
    .set({ status: "archived", archivedAt: new Date(), history: pushHistory(event(actor, "archived", "Dataset archived")) })
    .where(and(eq(schema.benchmarkDatasetVersions.datasetId, id), ne(schema.benchmarkDatasetVersions.status, "archived")));
  return { ok: true };
}

async function versionWithDataset(versionId: string) {
  const [row] = await db
    .select({ version: schema.benchmarkDatasetVersions, dataset: schema.benchmarkDatasets, source: schema.benchmarkSources })
    .from(schema.benchmarkDatasetVersions)
    .innerJoin(schema.benchmarkDatasets, eq(schema.benchmarkDatasets.id, schema.benchmarkDatasetVersions.datasetId))
    .innerJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkDatasets.sourceId))
    .where(eq(schema.benchmarkDatasetVersions.id, versionId))
    .limit(1);
  return row ?? null;
}

/** The dataset's open draft (draft or validated), creating one from the latest version's records if needed. */
export async function openDraft(actor: User, datasetId: string): Promise<Result<{ versionId: string; created: boolean }>> {
  if (!isLibraryAdmin(actor)) return denied;
  const versions = await db.select().from(schema.benchmarkDatasetVersions).where(eq(schema.benchmarkDatasetVersions.datasetId, datasetId)).orderBy(desc(schema.benchmarkDatasetVersions.version));
  const [d] = await db.select().from(schema.benchmarkDatasets).where(eq(schema.benchmarkDatasets.id, datasetId)).limit(1);
  if (!d) return { ok: false, error: "Dataset not found." };
  if (d.archivedAt) return { ok: false, error: "This dataset is archived." };
  const open = versions.find((v) => EDITABLE.includes(v.status));
  if (open) return { ok: true, versionId: open.id, created: false };
  const from = versions.find((v) => v.status === "published") ?? versions[0];
  const [v] = await db
    .insert(schema.benchmarkDatasetVersions)
    .values({ datasetId, version: (versions[0]?.version ?? 0) + 1, createdBy: actor.id, history: [event(actor, "created", from ? `Draft copied from version ${from.version}` : "Draft started")] })
    .returning();
  if (from) {
    const rows = await db.select().from(schema.benchmarkRecords).where(eq(schema.benchmarkRecords.versionId, from.id));
    // Copies keep everything but their identity and timestamps.
    const copy = (r: RecordRow) => {
      const c: Partial<RecordRow> = { ...r, versionId: v!.id };
      delete c.id;
      delete c.createdAt;
      delete c.updatedAt;
      return c as typeof schema.benchmarkRecords.$inferInsert;
    };
    if (rows.length) await db.insert(schema.benchmarkRecords).values(rows.map(copy));
  }
  return { ok: true, versionId: v!.id, created: true };
}

export function toRaw(r: RecordRow): RawRecord {
  const s = (v: number | string | null) => (v === null ? "" : String(v));
  return {
    metric: r.metric,
    displayName: r.displayName,
    definition: r.definition,
    definitionMatches: r.definitionMatches ? "yes" : "no",
    unit: r.unit,
    valueType: r.valueType,
    statistic: r.statistic,
    percentile: s(r.percentile),
    value: s(r.value),
    valueLow: s(r.valueLow),
    valueHigh: s(r.valueHigh),
    stages: r.stages.join(";"),
    arrMin: s(r.arrMin),
    arrMax: s(r.arrMax),
    industry: s(r.industry),
    businessModel: s(r.businessModel),
    pricingModel: s(r.pricingModel),
    customerSegment: s(r.customerSegment),
    acvMin: s(r.acvMin),
    acvMax: s(r.acvMax),
    geography: s(r.geography),
    foundedFrom: s(r.foundedFrom),
    foundedTo: s(r.foundedTo),
    period: r.period,
    periodBasis: r.periodBasis,
    cohortDefinition: s(r.cohortDefinition),
    sampleSize: s(r.sampleSize),
    methodology: s(r.methodology),
    limitations: s(r.limitations),
  };
}

export type VersionIssue = { recordId: string | null; severity: "error" | "warning"; message: string };

/** Everything wrong with a version: per record, across records, and the source's governance rules. */
export async function versionIssues(versionId: string): Promise<VersionIssue[]> {
  const ctx = await versionWithDataset(versionId);
  if (!ctx) return [{ recordId: null, severity: "error", message: "Version not found." }];
  const rows = await db.select().from(schema.benchmarkRecords).where(eq(schema.benchmarkRecords.versionId, versionId));
  const out: VersionIssue[] = [];
  if (!rows.length) out.push({ recordId: null, severity: "error", message: "The version has no records." });
  const valid: (RecordInput & { ref: string })[] = [];
  for (const r of rows) {
    const { record, issues } = validateRecord(toRaw(r));
    for (const i of issues) out.push({ recordId: r.id, severity: i.severity, message: i.message });
    if (record) valid.push({ ...record, ref: r.id });
  }
  for (const c of crossRecordIssues(valid)) out.push({ recordId: c.ref, severity: "error", message: c.message });
  const s = ctx.source;
  if (s.reliability === "unreliable") out.push({ recordId: null, severity: "error", message: "The source is marked unreliable; change its status before publishing." });
  if (!s.allowCustomerDisplay) out.push({ recordId: null, severity: "warning", message: "The source's licence isn't marked as allowing customer display, so these values won't appear in customer reports." });
  if (s.kind === "aggregated_customer") {
    if (!s.consentReference || !s.minAggregationSize) out.push({ recordId: null, severity: "error", message: "Aggregated customer data needs a consent reference and minimum aggregation size on the source." });
    else for (const r of rows) if (r.sampleSize === null || r.sampleSize < s.minAggregationSize) out.push({ recordId: r.id, severity: "error", message: `Aggregated customer data needs at least ${s.minAggregationSize} companies per cohort (re-identification safeguard).` });
  }
  return out;
}

export async function validateVersion(actor: User, versionId: string): Promise<Result<{ issues: VersionIssue[] }>> {
  if (!isLibraryAdmin(actor)) return denied;
  const ctx = await versionWithDataset(versionId);
  if (!ctx || !EDITABLE.includes(ctx.version.status)) return { ok: false, error: "Only draft versions can be validated." };
  const issues = await versionIssues(versionId);
  const errors = issues.filter((i) => i.severity === "error").length;
  await db
    .update(schema.benchmarkDatasetVersions)
    .set({ status: errors ? "draft" : "validated", history: pushHistory(event(actor, errors ? "validation failed" : "validated", errors ? `${errors} error(s)` : `${issues.length} warning(s)`)) })
    .where(eq(schema.benchmarkDatasetVersions.id, versionId));
  return errors ? { ok: false, error: `${errors} ${errors === 1 ? "problem needs" : "problems need"} fixing before this version can be validated.` } : { ok: true, issues };
}

/** Publishes a validated version; the previously published one is archived (reports keep their copy). */
export async function publishVersion(actor: User, versionId: string, effectiveDate: string | null): Promise<Result> {
  if (!isLibraryAdmin(actor)) return denied;
  const ctx = await versionWithDataset(versionId);
  if (!ctx) return { ok: false, error: "Version not found." };
  if (ctx.dataset.archivedAt) return { ok: false, error: "The dataset is archived." };
  if (ctx.version.status !== "validated") return { ok: false, error: "Validate the version before publishing it." };
  const issues = await versionIssues(versionId);
  if (issues.some((i) => i.severity === "error")) return { ok: false, error: "The version has validation errors; validate it again." };
  const now = new Date();
  await db
    .update(schema.benchmarkDatasetVersions)
    .set({ status: "archived", archivedAt: now, history: pushHistory(event(actor, "superseded", `Replaced by version ${ctx.version.version}`)) })
    .where(and(eq(schema.benchmarkDatasetVersions.datasetId, ctx.dataset.id), eq(schema.benchmarkDatasetVersions.status, "published")));
  await db
    .update(schema.benchmarkDatasetVersions)
    .set({ status: "published", publishedAt: now, publishedBy: actor.id, effectiveDate: effectiveDate ?? ctx.version.effectiveDate, publishedOn: ctx.source.publishedOn, history: pushHistory(event(actor, "published")) })
    .where(eq(schema.benchmarkDatasetVersions.id, versionId));
  return { ok: true };
}

export async function archiveVersion(actor: User, versionId: string): Promise<Result> {
  if (!isLibraryAdmin(actor)) return denied;
  const r = await db
    .update(schema.benchmarkDatasetVersions)
    .set({ status: "archived", archivedAt: new Date(), history: pushHistory(event(actor, "archived")) })
    .where(and(eq(schema.benchmarkDatasetVersions.id, versionId), ne(schema.benchmarkDatasetVersions.status, "archived")))
    .returning({ id: schema.benchmarkDatasetVersions.id });
  return r.length ? { ok: true } : { ok: false, error: "Version not found or already archived." };
}

/** Records that an admin reviewed a published version and it's still current (resets the stale flag). */
export async function markReviewed(actor: User, versionId: string, note: string | null): Promise<Result> {
  if (!isLibraryAdmin(actor)) return denied;
  const r = await db
    .update(schema.benchmarkDatasetVersions)
    .set({ lastReviewedAt: new Date(), reviewedBy: actor.id, history: pushHistory(event(actor, "reviewed", note ?? undefined)) })
    .where(eq(schema.benchmarkDatasetVersions.id, versionId))
    .returning({ id: schema.benchmarkDatasetVersions.id });
  return r.length ? { ok: true } : { ok: false, error: "Version not found." };
}

// ---------------------------------------------------------------------------
// Records (drafts only)
// ---------------------------------------------------------------------------

const recordValues = (r: RecordInput) => ({ ...r, dedupeKey: dedupeKey(r) });

async function editableVersion(versionId: string) {
  const ctx = await versionWithDataset(versionId);
  if (!ctx) return { error: "Version not found." };
  if (!EDITABLE.includes(ctx.version.status)) return { error: "Published and archived versions can't be changed. Start a new draft version." };
  return { ctx };
}

/** Any edit sends a validated version back to draft. */
const backToDraft = (actor: User, versionId: string, what: string) =>
  db.update(schema.benchmarkDatasetVersions).set({ status: "draft", updatedAt: new Date(), history: pushHistory(event(actor, what)) }).where(eq(schema.benchmarkDatasetVersions.id, versionId));

export async function addRecord(actor: User, versionId: string, raw: RawRecord): Promise<Result<{ id: string }> & { issues?: { field?: string; message: string }[] }> {
  if (!isLibraryAdmin(actor)) return denied;
  const v = await editableVersion(versionId);
  if ("error" in v) return { ok: false, error: v.error! };
  const { record, issues } = validateRecord(raw);
  if (!record) return { ok: false, error: "Fix the highlighted fields.", issues: issues.filter((i) => i.severity === "error") };
  const [dup] = await db.select({ id: schema.benchmarkRecords.id }).from(schema.benchmarkRecords).where(and(eq(schema.benchmarkRecords.versionId, versionId), eq(schema.benchmarkRecords.dedupeKey, dedupeKey(record)))).limit(1);
  if (dup) return { ok: false, error: "This version already has a record for the same metric, statistic, cohort and period." };
  const [row] = await db.insert(schema.benchmarkRecords).values({ ...recordValues(record), versionId, createdBy: actor.id }).returning({ id: schema.benchmarkRecords.id });
  await backToDraft(actor, versionId, `record added (${record.metric})`);
  return { ok: true, id: row!.id };
}

export async function updateRecord(actor: User, recordId: string, raw: RawRecord): Promise<Result & { issues?: { field?: string; message: string }[] }> {
  if (!isLibraryAdmin(actor)) return denied;
  const [existing] = await db.select().from(schema.benchmarkRecords).where(eq(schema.benchmarkRecords.id, recordId)).limit(1);
  if (!existing) return { ok: false, error: "Record not found." };
  const v = await editableVersion(existing.versionId);
  if ("error" in v) return { ok: false, error: v.error! };
  const { record, issues } = validateRecord(raw);
  if (!record) return { ok: false, error: "Fix the highlighted fields.", issues: issues.filter((i) => i.severity === "error") };
  const [dup] = await db
    .select({ id: schema.benchmarkRecords.id })
    .from(schema.benchmarkRecords)
    .where(and(eq(schema.benchmarkRecords.versionId, existing.versionId), eq(schema.benchmarkRecords.dedupeKey, dedupeKey(record)), ne(schema.benchmarkRecords.id, recordId)))
    .limit(1);
  if (dup) return { ok: false, error: "Another record in this version has the same metric, statistic, cohort and period." };
  await db.update(schema.benchmarkRecords).set({ ...recordValues(record), updatedAt: new Date() }).where(eq(schema.benchmarkRecords.id, recordId));
  await backToDraft(actor, existing.versionId, `record edited (${record.metric})`);
  return { ok: true };
}

export async function deleteRecord(actor: User, recordId: string): Promise<Result> {
  if (!isLibraryAdmin(actor)) return denied;
  const [existing] = await db.select().from(schema.benchmarkRecords).where(eq(schema.benchmarkRecords.id, recordId)).limit(1);
  if (!existing) return { ok: false, error: "Record not found." };
  const v = await editableVersion(existing.versionId);
  if ("error" in v) return { ok: false, error: v.error! };
  await db.delete(schema.benchmarkRecords).where(eq(schema.benchmarkRecords.id, recordId));
  await backToDraft(actor, existing.versionId, `record removed (${existing.metric})`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CSV import: preview, then commit to the dataset's draft
// ---------------------------------------------------------------------------

export const MAX_IMPORT_BYTES = 1_000_000;
export type ImportFile = { filename: string; text: string };
export type StoreFile = (path: string, text: string) => Promise<string | null>;

/** Rejects anything that isn't a small text CSV before it's parsed. */
export function checkImportFile(filename: string, bytes: number, text: string): string | null {
  if (!/\.csv$/i.test(filename)) return "Upload a .csv file.";
  if (bytes === 0) return "The file is empty.";
  if (bytes > MAX_IMPORT_BYTES) return "CSV files can be up to 1 MB.";
  if (text.includes("\u0000")) return "That doesn't look like a text CSV file.";
  return null;
}

async function existingKeys(datasetId: string): Promise<Set<string>> {
  const [draft] = await db
    .select({ id: schema.benchmarkDatasetVersions.id })
    .from(schema.benchmarkDatasetVersions)
    .where(and(eq(schema.benchmarkDatasetVersions.datasetId, datasetId), inArray(schema.benchmarkDatasetVersions.status, EDITABLE)))
    .limit(1);
  const [pub] = draft
    ? [undefined]
    : await db
        .select({ id: schema.benchmarkDatasetVersions.id })
        .from(schema.benchmarkDatasetVersions)
        .where(and(eq(schema.benchmarkDatasetVersions.datasetId, datasetId), eq(schema.benchmarkDatasetVersions.status, "published")))
        .limit(1);
  const target = draft?.id ?? pub?.id;
  if (!target) return new Set();
  const rows = await db.select({ k: schema.benchmarkRecords.dedupeKey }).from(schema.benchmarkRecords).where(eq(schema.benchmarkRecords.versionId, target));
  return new Set(rows.map((r) => r.k));
}

export async function previewImport(actor: User, datasetId: string, text: string, map?: Partial<Record<CsvField, number>>): Promise<Result<{ preview: CsvPreview }>> {
  if (!isLibraryAdmin(actor)) return denied;
  return { ok: true, preview: previewCsv(text, map, await existingKeys(datasetId)) };
}

/**
 * Saves the accepted rows to the dataset's draft (a new draft copied from the published version
 * if there isn't one), skips rows already there, and logs the import, including failed ones.
 */
export async function commitImport(actor: User, datasetId: string, file: ImportFile, map: Partial<Record<CsvField, number>> | undefined, store?: StoreFile): Promise<Result<{ importId: string; versionId: string; accepted: number }>> {
  if (!isLibraryAdmin(actor)) return denied;
  const draft = await openDraft(actor, datasetId);
  if (!draft.ok) return draft;
  const preview = previewCsv(file.text, map, await existingKeys(datasetId));
  const hash = createHash("sha256").update(file.text).digest("hex");
  const accepted = preview.rows.filter((r) => r.status === "accepted");
  const errors: BenchmarkImportError[] = [
    ...preview.fileErrors.map((message) => ({ line: 1, message })),
    ...preview.rows.flatMap((r) => r.issues.filter((i) => i.severity === "error").map((i) => ({ line: r.line, field: i.field, message: i.message }))),
  ];
  const failed = preview.fileErrors.length > 0 || accepted.length === 0;
  let blobUrl: string | null = null;
  if (store) {
    try {
      blobUrl = await store(`benchmarks/imports/${datasetId}/${hash.slice(0, 16)}.csv`, file.text);
    } catch (e) {
      console.error("[benchmark-import] Could not store the file", e);
    }
  }
  const [imp] = await db
    .insert(schema.benchmarkImports)
    .values({
      datasetId,
      versionId: failed ? null : draft.versionId,
      filename: file.filename.slice(0, 255),
      blobUrl,
      contentHash: hash,
      columnMap: Object.fromEntries(Object.entries(preview.map).map(([k, v]) => [k, preview.header[v!] ?? String(v)])),
      status: failed ? "failed" : "committed",
      rowsTotal: preview.counts.total,
      rowsAccepted: failed ? 0 : accepted.length,
      rowsRejected: preview.counts.rejected,
      rowsSkipped: preview.counts.skipped,
      errors: errors.slice(0, 500),
      importedBy: actor.id,
    })
    .returning({ id: schema.benchmarkImports.id });
  if (failed) return { ok: false, error: preview.fileErrors[0] ?? "No rows could be imported. Fix the errors listed and try again." };
  await db
    .insert(schema.benchmarkRecords)
    .values(accepted.map((r) => ({ ...recordValues(r.record!), versionId: draft.versionId, importId: imp!.id, createdBy: actor.id })))
    .onConflictDoNothing();
  await backToDraft(actor, draft.versionId, `imported ${accepted.length} record(s) from ${file.filename}`);
  return { ok: true, importId: imp!.id, versionId: draft.versionId, accepted: accepted.length };
}

// ---------------------------------------------------------------------------
// Reading the library (advisors and admins)
// ---------------------------------------------------------------------------

export type DatasetFilters = { q?: string; source?: string; metric?: string; stage?: string; arr?: number; model?: string; period?: string; status?: string; sort?: "name" | "updated" | "reviewed" | "usage" };

export async function listDatasets(f: DatasetFilters = {}) {
  const [datasets, versions, records, usages] = await Promise.all([
    db.select({ d: schema.benchmarkDatasets, source: schema.benchmarkSources }).from(schema.benchmarkDatasets).innerJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkDatasets.sourceId)),
    db.select().from(schema.benchmarkDatasetVersions),
    db
      .select({
        versionId: schema.benchmarkRecords.versionId,
        metric: schema.benchmarkRecords.metric,
        stages: schema.benchmarkRecords.stages,
        arrMin: schema.benchmarkRecords.arrMin,
        arrMax: schema.benchmarkRecords.arrMax,
        businessModel: schema.benchmarkRecords.businessModel,
        period: schema.benchmarkRecords.period,
      })
      .from(schema.benchmarkRecords),
    db
      .select({ versionId: schema.benchmarkUsages.versionId, n: sql<number>`count(distinct ${schema.benchmarkUsages.deliverableId})`.mapWith(Number) })
      .from(schema.benchmarkUsages)
      .groupBy(schema.benchmarkUsages.versionId),
  ]);
  const now = new Date();
  const rows = datasets.map(({ d, source }) => {
    const vs = versions.filter((v) => v.datasetId === d.id).sort((a, b) => b.version - a.version);
    const published = vs.find((v) => v.status === "published") ?? null;
    const draft = vs.find((v) => EDITABLE.includes(v.status)) ?? null;
    const current = published ?? draft ?? vs[0] ?? null;
    const recs = records.filter((r) => r.versionId === current?.id);
    const reviewedAt = published ? new Date(Math.max(published.publishedAt?.getTime() ?? 0, published.lastReviewedAt?.getTime() ?? 0)) : null;
    const status = d.archivedAt ? "archived" : published ? "published" : (draft?.status ?? "draft");
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      source: { id: source.id, name: source.name, publisher: source.publisher, kind: source.kind },
      status,
      publishedVersion: published?.version ?? null,
      draftVersion: draft ? { version: draft.version, status: draft.status } : null,
      records: recs.length,
      metrics: [...new Set(recs.map((r) => r.metric))].sort(),
      stages: [...new Set(recs.flatMap((r) => r.stages))],
      periods: [...new Set(recs.map((r) => r.period))],
      models: [...new Set([...d.businessModels, ...recs.map((r) => r.businessModel).filter((m): m is string => Boolean(m))])],
      arrRanges: recs.map((r) => [r.arrMin, r.arrMax] as const),
      updatedAt: new Date(Math.max(d.updatedAt.getTime(), ...vs.map((v) => v.updatedAt.getTime()))),
      reviewedAt,
      stale: published ? isStale({ reviewedAt, source: { reviewIntervalDays: source.reviewIntervalDays } as CandidateRecord["source"] }, now) : false,
      usage: vs.reduce((n, v) => n + (usages.find((u) => u.versionId === v.id)?.n ?? 0), 0),
    };
  });
  const q = f.q?.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!q || [r.name, r.description, r.source.name, r.source.publisher, ...r.metrics].some((x) => x?.toLowerCase().includes(q))) &&
      (!f.source || r.source.id === f.source) &&
      (!f.metric || r.metrics.includes(f.metric)) &&
      (!f.stage || r.stages.includes(f.stage) || r.stages.length === 0) &&
      (f.arr === undefined || r.arrRanges.some(([lo, hi]) => (lo ?? 0) <= f.arr! && f.arr! <= (hi ?? Number.POSITIVE_INFINITY))) &&
      (!f.model || r.models.some((m) => m.toLowerCase().includes(f.model!.toLowerCase()))) &&
      (!f.period || r.periods.some((p) => p.toLowerCase().includes(f.period!.toLowerCase()))) &&
      (!f.status || r.status === f.status),
  );
  const sort = f.sort ?? "updated";
  return filtered.sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : sort === "usage" ? b.usage - a.usage : sort === "reviewed" ? (a.reviewedAt?.getTime() ?? 0) - (b.reviewedAt?.getTime() ?? 0) : b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}
export type DatasetRow = Awaited<ReturnType<typeof listDatasets>>[number];

export async function getDataset(id: string) {
  const [row] = await db
    .select({ d: schema.benchmarkDatasets, source: schema.benchmarkSources, creator: schema.users.email })
    .from(schema.benchmarkDatasets)
    .innerJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkDatasets.sourceId))
    .leftJoin(schema.users, eq(schema.users.id, schema.benchmarkDatasets.createdBy))
    .where(eq(schema.benchmarkDatasets.id, id))
    .limit(1);
  if (!row) return null;
  const [versions, imports, usage] = await Promise.all([
    db.select().from(schema.benchmarkDatasetVersions).where(eq(schema.benchmarkDatasetVersions.datasetId, id)).orderBy(desc(schema.benchmarkDatasetVersions.version)),
    db
      .select({ i: schema.benchmarkImports, by: schema.users.email })
      .from(schema.benchmarkImports)
      .leftJoin(schema.users, eq(schema.users.id, schema.benchmarkImports.importedBy))
      .where(eq(schema.benchmarkImports.datasetId, id))
      .orderBy(desc(schema.benchmarkImports.createdAt)),
    datasetUsage(id),
  ]);
  return { dataset: row.d, source: row.source, createdBy: row.creator, versions, imports: imports.map(({ i, by }) => ({ ...i, by })), usage };
}

export async function listRecords(versionId: string) {
  return db.select().from(schema.benchmarkRecords).where(eq(schema.benchmarkRecords.versionId, versionId)).orderBy(asc(schema.benchmarkRecords.metric), asc(schema.benchmarkRecords.period), asc(schema.benchmarkRecords.statistic), asc(schema.benchmarkRecords.percentile));
}

/** Which reports used a dataset: one row per report, with the version and metrics it used. */
export async function datasetUsage(datasetId: string) {
  const rows = await db
    .select({ u: schema.benchmarkUsages, version: schema.benchmarkDatasetVersions.version, company: schema.companies.name, deliverable: schema.deliverables })
    .from(schema.benchmarkUsages)
    .innerJoin(schema.benchmarkDatasetVersions, eq(schema.benchmarkDatasetVersions.id, schema.benchmarkUsages.versionId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.benchmarkUsages.companyId))
    .innerJoin(schema.deliverables, eq(schema.deliverables.id, schema.benchmarkUsages.deliverableId))
    .where(eq(schema.benchmarkDatasetVersions.datasetId, datasetId))
    .orderBy(desc(schema.benchmarkUsages.createdAt));
  const byReport = new Map<string, { deliverableId: string; companyId: string; company: string; useCase: string | null; reportVersion: number; datasetVersion: number; metrics: string[]; at: Date }>();
  for (const r of rows) {
    const e = byReport.get(r.u.deliverableId) ?? { deliverableId: r.u.deliverableId, companyId: r.u.companyId, company: r.company, useCase: r.deliverable.useCase, reportVersion: r.deliverable.version, datasetVersion: r.version, metrics: [], at: r.u.createdAt };
    if (!e.metrics.includes(r.u.metric)) e.metrics.push(r.u.metric);
    byReport.set(r.u.deliverableId, e);
  }
  return [...byReport.values()];
}

// ---------------------------------------------------------------------------
// Retrieval for assessments
// ---------------------------------------------------------------------------

/** Published, non-archived records for these metrics, with their source and version. */
export async function loadCandidates(metrics: string[]): Promise<CandidateRecord[]> {
  if (!metrics.length) return [];
  const rows = await db
    .select({ r: schema.benchmarkRecords, v: schema.benchmarkDatasetVersions, d: schema.benchmarkDatasets, s: schema.benchmarkSources })
    .from(schema.benchmarkRecords)
    .innerJoin(schema.benchmarkDatasetVersions, eq(schema.benchmarkDatasetVersions.id, schema.benchmarkRecords.versionId))
    .innerJoin(schema.benchmarkDatasets, eq(schema.benchmarkDatasets.id, schema.benchmarkDatasetVersions.datasetId))
    .innerJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkDatasets.sourceId))
    .where(and(inArray(schema.benchmarkRecords.metric, metrics), eq(schema.benchmarkDatasetVersions.status, "published"), isNull(schema.benchmarkDatasets.archivedAt)));
  return rows.map(({ r, v, d, s }) => toCandidate(r, v, d, s));
}

function toCandidate(r: RecordRow, v: Version, d: typeof schema.benchmarkDatasets.$inferSelect, s: typeof schema.benchmarkSources.$inferSelect): CandidateRecord {
  const { record } = validateRecord(toRaw(r));
  const times = [v.publishedAt, v.lastReviewedAt].filter((t): t is Date => Boolean(t)).map((t) => t.getTime());
  return {
    ...(record ?? (toRaw(r) as unknown as RecordInput)),
    id: r.id,
    versionId: v.id,
    version: v.version,
    datasetId: d.id,
    datasetName: d.name,
    reviewedAt: times.length ? new Date(Math.max(...times)) : null,
    source: {
      id: s.id,
      name: s.name,
      publisher: s.publisher,
      url: s.url,
      documentRef: s.documentRef,
      publishedOn: s.publishedOn,
      attribution: s.attribution,
      kind: s.kind,
      reliability: s.reliability,
      allowCustomerDisplay: s.allowCustomerDisplay,
      allowDerived: s.allowDerived,
      reviewIntervalDays: s.reviewIntervalDays,
      snapshotSource: s.snapshotSource,
      standardReference: s.standardReference,
    },
  };
}

export type CompanyFigure = { metric: MetricKey; value: number; period: string | null; origin: string };

export function companyProfile(company: Pick<Company, "stage" | "arr" | "revenueBand" | "industry" | "primarySegment"> & { foundedYear?: number | null }, figures: CompanyFigure[]): CompanyProfile {
  const fig = (m: MetricKey) => figures.find((f) => f.metric === m)?.value ?? null;
  return { stage: company.stage, arr: fig("arr") ?? company.arr ?? null, revenueBand: company.revenueBand, industry: company.industry, segment: company.primarySegment, acv: fig("acv"), foundedYear: company.foundedYear ?? null };
}

export type BenchmarkResult = { comparisons: BenchmarkComparison[]; missing: { metric: MetricKey; label: string; reason: string }[] };

/**
 * The comparisons a company's report can show. Sample companies are never benchmarked against
 * the library (it's real data); everything comes from published versions only.
 */
export async function benchmarkCompany(company: Pick<Company, "id" | "isSample" | "stage" | "arr" | "revenueBand" | "industry" | "primarySegment"> & { foundedYear?: number | null }, figures: CompanyFigure[]): Promise<BenchmarkResult> {
  const comparable = figures.filter((f) => Number.isFinite(f.value));
  if (company.isSample || !comparable.length) return { comparisons: [], missing: [] };
  const [candidates, overrides] = await Promise.all([
    loadCandidates(comparable.map((f) => f.metric)),
    db.select().from(schema.benchmarkOverrides).where(eq(schema.benchmarkOverrides.companyId, company.id)),
  ]);
  const profile = companyProfile(company, figures);
  // Growth Goaled's standard reference is a last resort: matched only when nothing else fits, and labelled an assumption.
  const real = candidates.filter((r) => !isReference(r));
  const reference = candidates.filter(isReference);
  const out: BenchmarkResult = { comparisons: [], missing: [] };
  for (const f of comparable) {
    const o = overrides.find((x) => x.metric === f.metric);
    const m = matchBenchmark(f.metric, profile, real, o ? { recordId: o.recordId, reason: o.reason } : undefined);
    if (m.status === "matched") {
      out.comparisons.push(compare(f, m));
      continue;
    }
    const fallback = o?.recordId === null ? null : matchBenchmark(f.metric, profile, reference, undefined);
    if (fallback?.status === "matched") out.comparisons.push(compare(f, fallback, { assumption: m.reason }));
    else out.missing.push({ metric: f.metric, label: METRICS[f.metric].label, reason: m.reason });
  }
  return out;
}

/** Links a report to the records it used, for usage counts and audit. */
export async function recordUsage(deliverableId: string, companyId: string, comparisons: BenchmarkComparison[]) {
  const values = comparisons.flatMap((c) =>
    c.benchmark.stats.map((s) => ({ deliverableId, companyId, recordId: s.recordId, versionId: c.benchmark.dataset.versionId, metric: c.metric, selection: c.selection, quality: c.quality })),
  );
  if (values.length) await db.insert(schema.benchmarkUsages).values(values).onConflictDoNothing();
}

/**
 * Re-derives a saved comparison from the records it cites, to prove a report can be reproduced
 * exactly from the version it used (even after newer versions are published).
 */
export async function reproduceComparison(saved: BenchmarkComparison): Promise<{ ok: boolean; differences: string[] }> {
  const ids = saved.benchmark.stats.map((s) => s.recordId);
  const rows = await db
    .select({ r: schema.benchmarkRecords, v: schema.benchmarkDatasetVersions, d: schema.benchmarkDatasets, s: schema.benchmarkSources })
    .from(schema.benchmarkRecords)
    .innerJoin(schema.benchmarkDatasetVersions, eq(schema.benchmarkDatasetVersions.id, schema.benchmarkRecords.versionId))
    .innerJoin(schema.benchmarkDatasets, eq(schema.benchmarkDatasets.id, schema.benchmarkDatasetVersions.datasetId))
    .innerJoin(schema.benchmarkSources, eq(schema.benchmarkSources.id, schema.benchmarkDatasets.sourceId))
    .where(inArray(schema.benchmarkRecords.id, ids));
  if (rows.length !== ids.length) return { ok: false, differences: ["Some records the report used no longer exist."] };
  const records = rows.map(({ r, v, d, s }) => toCandidate(r, v, d, s));
  const again = compare({ metric: saved.metric, value: saved.observed.value, period: saved.observed.period, origin: saved.observed.origin }, {
    status: "matched",
    metric: saved.metric,
    quality: saved.quality,
    selection: saved.selection,
    records,
    matchedOn: [],
    caveats: [],
    alternatives: [],
  });
  const differences: string[] = [];
  const key = (s: { recordId: string; value: number | null; low: number | null; high: number | null }) => `${s.recordId}:${s.value}:${s.low}:${s.high}`;
  if (again.benchmark.stats.map(key).sort().join() !== saved.benchmark.stats.map(key).sort().join()) differences.push("Benchmark values differ.");
  if (again.derived?.difference !== saved.derived?.difference) differences.push("The derived difference differs.");
  if (again.benchmark.dataset.versionId !== saved.benchmark.dataset.versionId) differences.push("The dataset version differs.");
  return { ok: differences.length === 0, differences };
}

// ---------------------------------------------------------------------------
// Advisor overrides (per company, within the advisor's own companies)
// ---------------------------------------------------------------------------

export async function listOverrides(companyId: string) {
  return db.select().from(schema.benchmarkOverrides).where(eq(schema.benchmarkOverrides.companyId, companyId));
}

/** recordId null means "don't benchmark this metric for this company". The caller checks the advisor manages the company. */
export async function setOverride(actor: User, company: Pick<Company, "id">, metric: string, recordId: string | null, reason: string): Promise<Result> {
  if (actor.role !== "advisor" && actor.role !== "admin") return { ok: false, error: "Not allowed." };
  if (!isMetricKey(metric)) return { ok: false, error: "Unknown metric." };
  if (reason.trim().length < 5) return { ok: false, error: "Say why (at least a few words): it's kept with the report." };
  if (recordId) {
    const [c] = await loadCandidates([metric]).then((cs) => cs.filter((x) => x.id === recordId));
    if (!c) return { ok: false, error: "Choose a published benchmark record for this metric." };
  }
  await db
    .insert(schema.benchmarkOverrides)
    .values({ companyId: company.id, metric, recordId, reason: reason.trim().slice(0, 1000), setBy: actor.id })
    .onConflictDoUpdate({ target: [schema.benchmarkOverrides.companyId, schema.benchmarkOverrides.metric], set: { recordId, reason: reason.trim().slice(0, 1000), setBy: actor.id, updatedAt: new Date() } });
  return { ok: true };
}

export async function clearOverride(actor: User, company: Pick<Company, "id">, metric: string): Promise<Result> {
  if (actor.role !== "advisor" && actor.role !== "admin") return { ok: false, error: "Not allowed." };
  await db.delete(schema.benchmarkOverrides).where(and(eq(schema.benchmarkOverrides.companyId, company.id), eq(schema.benchmarkOverrides.metric, metric)));
  return { ok: true };
}

/** A company's latest usable figure per metric (confirmed, or calculated in code), for benchmark choices. */
export async function companyFigures(companyId: string, metrics: readonly MetricKey[]): Promise<CompanyFigure[]> {
  if (!metrics.length) return [];
  const points = await db
    .select()
    .from(schema.dataPoints)
    .where(and(eq(schema.dataPoints.companyId, companyId), inArray(schema.dataPoints.metric, [...metrics]), ne(schema.dataPoints.status, "rejected")))
    .orderBy(desc(schema.dataPoints.updatedAt));
  const out = new Map<MetricKey, CompanyFigure>();
  for (const p of points.sort((a, b) => Number(b.status === "accepted") - Number(a.status === "accepted"))) {
    if (isMetricKey(p.metric) && !out.has(p.metric) && (p.status === "accepted" || p.origin === "calculated")) out.set(p.metric, { metric: p.metric, value: p.value, period: p.period, origin: p.origin });
  }
  return [...out.values()];
}

/** For the advisor's company page: per metric, the automatic match and every published option with why it fits or not. */
export async function benchmarkOptions(company: Company, figures: CompanyFigure[]) {
  const candidates = await loadCandidates(figures.map((f) => f.metric));
  const overrides = await listOverrides(company.id);
  const profile = companyProfile(company, figures);
  return figures.map((f) => {
    const auto = matchBenchmark(f.metric, profile, candidates, undefined);
    const o = overrides.find((x) => x.metric === f.metric);
    const excluded = auto.status === "none" ? auto.excluded : [];
    const options = candidates
      .filter((c) => c.metric === f.metric && (c.statistic === "median" || c.statistic === "mean" || c.statistic === "range" || (c.statistic === "percentile" && c.percentile === 50)))
      .map((c) => ({ recordId: c.id, label: `${c.datasetName} v${c.version} · ${c.period} · ${c.stages.join("/") || "all stages"}`, excludedBecause: excluded.find((e) => e.recordId === c.id)?.reason ?? null }));
    return { metric: f.metric, label: METRICS[f.metric].label, auto, override: o ?? null, options };
  });
}

// ---------------------------------------------------------------------------
// Coverage and quality overview
// ---------------------------------------------------------------------------

/** Metrics the assessments compare most often; coverage gaps are reported against these. */
export const CORE_METRICS: MetricKey[] = ["arr_growth", "nrr", "grr", "win_rate", "sales_cycle_days", "acv", "cac_payback_months", "gross_margin", "burn_multiple", "magic_number"];

export async function libraryOverview() {
  const [datasets, sources, versions, published, pending, topUsed] = await Promise.all([
    listDatasets(),
    db.select({ id: schema.benchmarkSources.id, name: schema.benchmarkSources.name, kind: schema.benchmarkSources.kind, reviewIntervalDays: schema.benchmarkSources.reviewIntervalDays }).from(schema.benchmarkSources),
    db.select().from(schema.benchmarkDatasetVersions),
    db
      .select({ metric: schema.benchmarkRecords.metric, stages: schema.benchmarkRecords.stages, datasetId: schema.benchmarkDatasetVersions.datasetId })
      .from(schema.benchmarkRecords)
      .innerJoin(schema.benchmarkDatasetVersions, eq(schema.benchmarkDatasetVersions.id, schema.benchmarkRecords.versionId))
      .innerJoin(schema.benchmarkDatasets, eq(schema.benchmarkDatasets.id, schema.benchmarkDatasetVersions.datasetId))
      .where(and(eq(schema.benchmarkDatasetVersions.status, "published"), isNull(schema.benchmarkDatasets.archivedAt))),
    db
      .select({ n: count() })
      .from(schema.benchmarkRecords)
      .innerJoin(schema.benchmarkDatasetVersions, eq(schema.benchmarkDatasetVersions.id, schema.benchmarkRecords.versionId))
      .where(inArray(schema.benchmarkDatasetVersions.status, EDITABLE)),
    db
      .select({ datasetId: schema.benchmarkDatasets.id, name: schema.benchmarkDatasets.name, n: sql<number>`count(distinct ${schema.benchmarkUsages.deliverableId})`.mapWith(Number) })
      .from(schema.benchmarkUsages)
      .innerJoin(schema.benchmarkDatasetVersions, eq(schema.benchmarkDatasetVersions.id, schema.benchmarkUsages.versionId))
      .innerJoin(schema.benchmarkDatasets, eq(schema.benchmarkDatasets.id, schema.benchmarkDatasetVersions.datasetId))
      .groupBy(schema.benchmarkDatasets.id, schema.benchmarkDatasets.name)
      .orderBy(desc(sql`count(distinct ${schema.benchmarkUsages.deliverableId})`))
      .limit(5),
  ]);
  const live = datasets.filter((d) => d.status === "published");
  const usedSources = new Set(live.map((d) => d.source.id));
  // Coverage: for each core metric, the stages with no published cohort (a cohort without stages covers all).
  const gaps = CORE_METRICS.map((metric) => {
    const rs = published.filter((p) => p.metric === metric);
    const broad = rs.some((r) => r.stages.length === 0);
    const missingStages = rs.length === 0 ? [...STAGES] : broad ? [] : STAGES.filter((s) => !rs.some((r) => r.stages.includes(s)));
    return { metric, label: METRICS[metric].label, records: rs.length, missingStages, broadOnly: broad && rs.every((r) => r.stages.length === 0) };
  }).filter((g) => g.missingStages.length || g.broadOnly);
  const drafts = versions.filter((v) => EDITABLE.includes(v.status));
  const issueCounts = await Promise.all(drafts.map(async (v) => ({ versionId: v.id, datasetId: v.datasetId, errors: (await versionIssues(v.id)).filter((i) => i.severity === "error").length })));
  return {
    publishedDatasets: live.length,
    publishedMetrics: new Set(published.map((p) => p.metric)).size,
    publishedRecords: published.length,
    sources: sources.filter((s) => usedSources.has(s.id)).map((s) => s.name),
    gaps,
    awaitingReview: { records: pending[0]?.n ?? 0, versions: drafts.length },
    stale: live.filter((d) => d.stale).map((d) => ({ id: d.id, name: d.name, reviewedAt: d.reviewedAt })),
    withErrors: issueCounts.filter((i) => i.errors > 0).map((i) => ({ ...i, name: datasets.find((d) => d.id === i.datasetId)?.name ?? "" })),
    topUsed,
    defaultReviewDays: DEFAULT_REVIEW_DAYS,
  };
}
