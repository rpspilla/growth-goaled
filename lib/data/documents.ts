import "server-only";
import { del, get, head } from "@vercel/blob";
import ExcelJS from "exceljs";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, FileProfile, SortSuggestion, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import { ACCEPTED_TYPES, DOC_TYPES, findConflicts, handlingFor, INBOX_FOLDER, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from "@/lib/documents";
import { AI_MODEL } from "@/lib/ai/config";
import { extractMetrics, ExtractionError, type ExtractionInput } from "@/lib/ai/extract";
import { parseCsv, profileSheets } from "@/lib/file-profile";
import { getItem, type CategoryId } from "@/lib/readiness";
import { classifyFile, ClassifyError, type ClassifyInput } from "@/lib/ai/classify";
import { mergeSuggestions, suggestFromColumns, suggestFromFilename } from "@/lib/sorting";
import { markItemsSupplied } from "./readiness";

type DocType = (typeof schema.docType.enumValues)[number];

/** Blob path prefix for a company's uploads; upload tokens are only issued under it. */
export const companyBlobPrefix = (companyId: string) => `companies/${companyId}/`;

// PDFs go to the model as base64, which must fit in one request.
const MAX_PDF_BYTES = 20 * 1024 * 1024;

export type RegisterInput = {
  pathname: string;
  docType: DocType;
  filename: string;
  /** Data Readiness category and the requirement items this file supports. */
  category?: CategoryId;
  itemKeys?: string[];
  /** SHA-256 of the file computed in the browser; used to reuse an existing record for the same file. */
  contentHash?: string;
};

/** Document type implied by a readiness category (used when uploading from the readiness checklist). */
export const DOC_TYPE_FOR_CATEGORY: Record<CategoryId, DocType> = {
  financial: "financial_model",
  customers: "customer_list",
  pipeline: "other",
  marketing: "gtm_plan",
  product: "other",
  team: "hiring_plan",
};

/**
 * Records an upload the founder finished, after checking the blob is theirs.
 * The same file uploaded again (same content hash) reuses the existing
 * record: the new blob is deleted and any new item links are added.
 */
export async function registerDocument(
  user: User,
  company: Company,
  input: RegisterInput,
): Promise<{ doc: typeof schema.documents.$inferSelect; duplicate: boolean }> {
  if (!input.pathname.startsWith(companyBlobPrefix(company.id))) throw new Error("That file doesn't belong to your company.");
  const inbox = input.pathname.startsWith(companyBlobPrefix(company.id) + INBOX_FOLDER);
  const blob = await head(input.pathname);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("File is too large.");
  // The inbox takes any file (unreadable formats are stored for the advisor); checklist uploads only readable ones.
  if (!inbox && !ACCEPTED_TYPES[blob.contentType]) throw new Error("That file type isn't supported.");

  const itemKeys = [...new Set(input.itemKeys ?? [])].filter((k) => getItem(k)?.category === input.category);
  const hash = input.contentHash && /^[a-f0-9]{64}$/.test(input.contentHash) ? input.contentHash : null;

  const findExisting = async () =>
    hash
      ? (
          await db
            .select()
            .from(schema.documents)
            .where(and(eq(schema.documents.companyId, company.id), eq(schema.documents.contentHash, hash)))
            .limit(1)
        )[0]
      : undefined;

  let duplicate = await findExisting();
  if (!duplicate) {
    const [inserted] = await db
      .insert(schema.documents)
      .values({
        companyId: company.id,
        docType: input.docType,
        blobUrl: blob.url,
        filename: input.filename.slice(0, 255),
        mime: blob.contentType,
        size: blob.size,
        status: "uploaded",
        uploadedBy: user.id,
        dataCategory: input.category ?? null,
        dataItemKeys: itemKeys,
        contentHash: hash,
        inbox,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      await markItemsSupplied(user, company, itemKeys);
      await track("document_uploaded", { userId: user.id, companyId: company.id, props: { docType: input.docType, mime: blob.contentType, category: input.category } });
      return { doc: inserted, duplicate: false };
    }
    duplicate = await findExisting(); // lost a race with an identical upload
    if (!duplicate) throw new Error("Upload failed. Try again.");
  }

  // Same file again: keep the original record, drop the new copy, add any new links.
  if (duplicate.blobUrl !== blob.url) await del(blob.url).catch(() => undefined);
  const mergedKeys = [...new Set([...duplicate.dataItemKeys, ...itemKeys])];
  const [updated] = await db
    .update(schema.documents)
    .set({ dataItemKeys: mergedKeys, dataCategory: duplicate.dataCategory ?? input.category ?? null })
    .where(eq(schema.documents.id, duplicate.id))
    .returning();
  await markItemsSupplied(user, company, itemKeys);
  return { doc: updated ?? duplicate, duplicate: true };
}

async function readBlob(url: string): Promise<Buffer> {
  const result = await get(url, { access: "private" });
  if (!result) throw new ExtractionError("The uploaded file could not be found.");
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

/** Each worksheet's rows, using each cell's displayed text. */
async function spreadsheetRows(bytes: Buffer): Promise<{ name: string; rows: string[][] }[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheets: { name: string; rows: string[][] }[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text ?? "");
      rows.push(cells);
    });
    sheets.push({ name: sheet.name, rows });
  });
  return sheets;
}

const toCsv = (sheets: { name: string; rows: string[][] }[]) => {
  const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return sheets
    .filter((s) => s.rows.length)
    .map((s) => `# Sheet: ${s.name}\n${s.rows.map((r) => r.map(quote).join(",")).join("\n")}`)
    .join("\n\n");
};

/** Extraction input plus, for tabular files, the sheets used to profile columns and dates. */
async function buildInput(
  doc: typeof schema.documents.$inferSelect,
): Promise<{ input: ExtractionInput; sheets: { name: string; rows: string[][] }[] | null }> {
  const docLabel = DOC_TYPES.find((d) => d.id === doc.docType)?.label ?? "Document";
  const kind = ACCEPTED_TYPES[doc.mime];
  const bytes = await readBlob(doc.blobUrl);
  if (kind === "pdf") {
    if (bytes.length > MAX_PDF_BYTES) throw new ExtractionError("PDFs can be up to 20 MB. Split or compress the file.");
    return { input: { kind: "pdf", base64: bytes.toString("base64"), filename: doc.filename, docLabel }, sheets: null };
  }
  if (kind === "image") {
    if (bytes.length > MAX_IMAGE_BYTES) throw new ExtractionError("Images can be up to 5 MB to be read automatically.");
    return { input: { kind: "image", base64: bytes.toString("base64"), mediaType: doc.mime as "image/png", filename: doc.filename, docLabel }, sheets: null };
  }
  if (kind === "xlsx") {
    const sheets = await spreadsheetRows(bytes);
    const text = toCsv(sheets);
    if (!text.trim()) throw new ExtractionError("The spreadsheet has no readable content.");
    return { input: { kind: "text", text, filename: doc.filename, docLabel }, sheets };
  }
  const text = bytes.toString("utf8");
  if (!text.trim()) throw new ExtractionError("The file has no readable content.");
  const sheets = doc.mime === "text/csv" ? [{ name: doc.filename, rows: parseCsv(text) }] : null;
  return { input: { kind: "text", text, filename: doc.filename, docLabel }, sheets };
}

/**
 * Extraction pipeline for one document: read the blob, run the extraction,
 * store proposed data points, and open register items for conflicts (>10%
 * from an earlier value for the same metric and period) and assumptions
 * (low confidence or computed values). Runs after the upload response.
 */
export async function processDocument(documentId: string): Promise<void> {
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId)).limit(1);
  if (!doc) return;

  // Formats we don't read automatically are kept and attached, but never reported as analysed.
  if (handlingFor(doc.mime) === "stored") {
    await db.update(schema.documents).set({ status: "stored", error: null }).where(eq(schema.documents.id, doc.id));
    return;
  }

  await db.update(schema.documents).set({ status: "analyzing", error: null }).where(eq(schema.documents.id, doc.id));
  const [run] = await db
    .insert(schema.agentRuns)
    .values({ documentId: doc.id, agent: "extract", model: AI_MODEL, status: "running" })
    .returning({ id: schema.agentRuns.id });
  const started = Date.now();

  try {
    const { input, sheets } = await buildInput(doc);
    // Column and date-range profile is computed in code, before (and independent of) the model.
    if (sheets) await db.update(schema.documents).set({ profile: profileSheets(sheets) }).where(eq(schema.documents.id, doc.id));
    const result = await extractMetrics(input);

    // Replace anything a previous run of this document proposed.
    await db.delete(schema.dataPoints).where(and(eq(schema.dataPoints.documentId, doc.id), eq(schema.dataPoints.status, "proposed")));

    const inserted = result.points.length
      ? await db
          .insert(schema.dataPoints)
          .values(
            result.points.map((p) => ({
              companyId: doc.companyId,
              metric: p.metric,
              value: p.value,
              unit: METRICS[p.metric].unit,
              rawText: p.raw_text.slice(0, 500),
              period: p.period,
              documentId: doc.id,
              page: p.page,
              confidence: p.confidence,
              status: "proposed" as const,
            })),
          )
          .returning()
      : [];

    // Everything already known about this company: intake answers (no document) and other documents' values.
    const earlier = await db
      .select()
      .from(schema.dataPoints)
      .where(
        and(
          eq(schema.dataPoints.companyId, doc.companyId),
          inArray(schema.dataPoints.status, ["accepted", "proposed"]),
          or(isNull(schema.dataPoints.documentId), ne(schema.dataPoints.documentId, doc.id)),
        ),
      );

    const conflicts = findConflicts(inserted, earlier);
    const assumptions = inserted.filter((p, i) => p.confidence === "low" || result.points[i]?.inferred);
    const fmt = (metric: string, value: number) => (METRICS[metric as MetricKey] ? formatMetric(metric as MetricKey, value) : String(value));
    const label = (metric: string) => METRICS[metric as MetricKey]?.label ?? metric;
    const describe = (d: { value: number; metric: string; period: string | null; documentId: string | null }) =>
      `${fmt(d.metric, d.value)}${d.period && d.period !== "Current" ? ` (${d.period})` : ""} ${d.documentId ? "in an uploaded document" : "in your company profile"}`;

    const items: (typeof schema.registerItems.$inferInsert)[] = [
      ...conflicts.map(({ point, other }) => ({
        companyId: doc.companyId,
        type: "conflict" as const,
        title: `Conflicting ${label(point.metric).toLowerCase()} data`,
        description: `${doc.filename} shows ${fmt(point.metric, point.value)}${point.period ? ` (${point.period})` : ""}, but we have ${describe(other)}. Which is right?`,
        dataPointIds: [other.id, point.id],
        owner: "founder" as const,
      })),
      ...assumptions.map((p) => ({
        companyId: doc.companyId,
        type: "assumption" as const,
        title: `Check: ${label(p.metric)} from ${doc.filename}`,
        description: `We read ${fmt(p.metric, p.value)}${p.period ? ` for ${p.period}` : ""} from “${p.rawText}”. Confirm or correct it.`,
        dataPointIds: [p.id],
        owner: "founder" as const,
      })),
    ];
    if (items.length) await db.insert(schema.registerItems).values(items);

    await db
      .update(schema.documents)
      .set({ status: "done", dataPointsFound: inserted.length, assumptionsFlagged: assumptions.length, error: null })
      .where(eq(schema.documents.id, doc.id));
    await db
      .update(schema.agentRuns)
      .set({
        status: "succeeded",
        model: result.model,
        output: { data_points: result.points },
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        durationMs: Date.now() - started,
      })
      .where(eq(schema.agentRuns.id, run!.id));
    await track("extraction_completed", {
      companyId: doc.companyId,
      props: { documentId: doc.id, dataPoints: inserted.length, conflicts: conflicts.length, assumptions: assumptions.length },
    });
  } catch (err) {
    const message = err instanceof ExtractionError ? err.message : "Analysis failed. Try again.";
    console.error(`[extract] Document ${doc.id} failed`, err);
    await db.update(schema.documents).set({ status: "failed", error: message }).where(eq(schema.documents.id, doc.id));
    await db
      .update(schema.agentRuns)
      .set({ status: "failed", error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - started })
      .where(eq(schema.agentRuns.id, run!.id));
  }
}

export type DocumentView = {
  id: string;
  docType: DocType;
  filename: string;
  status: "uploaded" | "analyzing" | "done" | "failed" | "stored";
  error: string | null;
  mime: string;
  size: number;
  category: CategoryId | null;
  itemKeys: string[];
  profile: FileProfile | null;
  dataPointsFound: number;
  assumptionsFlagged: number;
  createdAt: string;
  inbox: boolean;
  sortStatus: "sorting" | "sorted" | "failed" | null;
  sortSummary: string | null;
  suggestions: SortSuggestion[];
  sortReviewed: boolean;
  points: {
    id: string;
    label: string;
    value: string;
    period: string | null;
    page: number | null;
    rawText: string | null;
    confidence: string;
    status: "proposed" | "accepted" | "rejected";
  }[];
};

/** A company's documents with the data points extracted from each. */
export async function listDocuments(company: Company): Promise<DocumentView[]> {
  const docs = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.companyId, company.id))
    .orderBy(desc(schema.documents.createdAt));
  if (!docs.length) return [];
  const points = await db
    .select()
    .from(schema.dataPoints)
    .where(and(eq(schema.dataPoints.companyId, company.id), inArray(schema.dataPoints.documentId, docs.map((d) => d.id))));

  return docs.map((d) => ({
    id: d.id,
    docType: d.docType,
    filename: d.filename,
    status: d.status,
    error: d.error,
    mime: d.mime,
    size: d.size,
    category: d.dataCategory,
    itemKeys: d.dataItemKeys,
    profile: d.profile,
    dataPointsFound: d.dataPointsFound,
    assumptionsFlagged: d.assumptionsFlagged,
    createdAt: d.createdAt.toISOString(),
    inbox: d.inbox,
    sortStatus: d.sortStatus,
    sortSummary: d.sortSummary,
    suggestions: d.suggestions ?? [],
    sortReviewed: d.sortReviewedAt !== null,
    points: points
      .filter((p) => p.documentId === d.id)
      .map((p) => ({
        id: p.id,
        label: METRICS[p.metric as MetricKey]?.label ?? p.metric,
        value: METRICS[p.metric as MetricKey] ? formatMetric(p.metric as MetricKey, p.value) : String(p.value),
        period: p.period,
        page: p.page,
        rawText: p.rawText,
        confidence: p.confidence,
        status: p.status,
      })),
  }));
}

/** Founder accepts or rejects a value extracted from one of their documents. */
export async function reviewDataPoint(user: User, company: Company, dataPointId: string, decision: "accepted" | "rejected"): Promise<boolean> {
  const updated = await db
    .update(schema.dataPoints)
    .set({ status: decision, acceptedBy: decision === "accepted" ? user.id : null })
    .where(and(eq(schema.dataPoints.id, dataPointId), eq(schema.dataPoints.companyId, company.id)))
    .returning({ id: schema.dataPoints.id });
  return updated.length > 0;
}

/** Re-queues a failed document for extraction. Returns false if it isn't the company's or isn't failed. */
export async function resetFailedDocument(company: Company, documentId: string): Promise<boolean> {
  const updated = await db
    .update(schema.documents)
    .set({ status: "uploaded", error: null })
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.companyId, company.id), eq(schema.documents.status, "failed")))
    .returning({ id: schema.documents.id });
  return updated.length > 0;
}

// ---------------------------------------------------------------------------
// "Upload whatever you have": sorting files into the readiness checklist
// ---------------------------------------------------------------------------

/** Reads the file for the classifier; null when the format can't be read. */
async function classifyInputFor(doc: typeof schema.documents.$inferSelect): Promise<ClassifyInput | null> {
  const kind = handlingFor(doc.mime);
  if (kind === "stored") return null;
  const bytes = await readBlob(doc.blobUrl);
  if (kind === "pdf") return bytes.length > MAX_PDF_BYTES ? null : { kind: "pdf", filename: doc.filename, base64: bytes.toString("base64") };
  if (kind === "image") return bytes.length > MAX_IMAGE_BYTES ? null : { kind: "image", filename: doc.filename, base64: bytes.toString("base64"), mediaType: doc.mime as "image/png" };
  if (kind === "xlsx") return { kind: "sheets", filename: doc.filename, sheets: await spreadsheetRows(bytes) };
  const text = bytes.toString("utf8");
  return doc.mime === "text/csv" ? { kind: "sheets", filename: doc.filename, sheets: [{ name: doc.filename, rows: parseCsv(text) }] } : { kind: "text", filename: doc.filename, text };
}

/**
 * Suggests which readiness items a file covers (columns and file name in code,
 * content by the model). Nothing is linked until the founder confirms.
 */
export async function sortDocument(documentId: string, classify = classifyFile): Promise<void> {
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId)).limit(1);
  if (!doc) return;
  await db.update(schema.documents).set({ sortStatus: "sorting" }).where(eq(schema.documents.id, doc.id));
  const rules = mergeSuggestions(suggestFromColumns(doc.profile), suggestFromFilename(doc.filename));
  const finish = (sortStatus: "sorted" | "failed", sortSummary: string, suggestions: SortSuggestion[]) =>
    db.update(schema.documents).set({ sortStatus, sortSummary, suggestions }).where(eq(schema.documents.id, doc.id));

  let input: ClassifyInput | null;
  try {
    input = await classifyInputFor(doc);
  } catch {
    input = null;
  }
  if (!input) {
    await finish("sorted", "We can't read this format automatically, so it's kept for your advisor. Suggestions below are based on the file name.", rules);
    return;
  }

  const started = Date.now();
  const [run] = await db.insert(schema.agentRuns).values({ documentId: doc.id, agent: "sort", model: AI_MODEL, status: "running" }).returning({ id: schema.agentRuns.id });
  try {
    const { result, model, tokensIn, tokensOut } = await classify(input);
    const fromModel: SortSuggestion[] = result.sections.flatMap((s) =>
      s.items.map((i) => ({ itemKey: i.key, sheet: s.sheet, confidence: i.confidence, reason: i.reason.slice(0, 300), source: "ai" as const, status: "suggested" as const })),
    );
    // A file-name guess adds nothing once the content has been read.
    const suggestions = mergeSuggestions(suggestFromColumns(doc.profile), fromModel);
    await finish("sorted", result.summary.slice(0, 500), suggestions);
    await db.update(schema.agentRuns).set({ status: "succeeded", model, output: result, tokensIn, tokensOut, durationMs: Date.now() - started }).where(eq(schema.agentRuns.id, run!.id));
  } catch (err) {
    console.error(`[sort] Document ${doc.id} failed`, err);
    await finish("failed", "We couldn't sort this file automatically. Pick the items it covers below, or ask your advisor.", rules);
    await db
      .update(schema.agentRuns)
      .set({ status: "failed", error: err instanceof ClassifyError ? err.message : String(err), durationMs: Date.now() - started })
      .where(eq(schema.agentRuns.id, run!.id));
  }
}

/** Reads and extracts an inbox file, then sorts it. */
export async function processInboxDocument(documentId: string): Promise<void> {
  await processDocument(documentId);
  await sortDocument(documentId);
}

/**
 * Applies the founder's choice: accepted items are linked to the file and
 * marked supplied (unverified); the rest are dismissed. Extra items the founder
 * picked by hand can be added too.
 */
export async function applySuggestions(user: User, company: Company, documentId: string, acceptKeys: string[]): Promise<{ ok: true; linked: number } | { ok: false; error: string }> {
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.companyId, company.id)))
    .limit(1);
  if (!doc) return { ok: false, error: "File not found." };
  const accept = new Set(acceptKeys.filter((k) => getItem(k)));
  const current = doc.suggestions ?? [];
  const known = new Set(current.map((s) => s.itemKey));
  const suggestions: SortSuggestion[] = [
    ...current.map((s) => ({ ...s, status: accept.has(s.itemKey) ? ("accepted" as const) : ("dismissed" as const) })),
    ...[...accept].filter((k) => !known.has(k)).map((itemKey) => ({ itemKey, sheet: null, confidence: "high" as const, reason: "Picked by you", source: "filename" as const, status: "accepted" as const })),
  ];
  const keys = [...new Set([...doc.dataItemKeys, ...accept])];
  const categories = new Set(keys.map((k) => getItem(k)!.category));
  await db
    .update(schema.documents)
    .set({ suggestions, dataItemKeys: keys, dataCategory: categories.size === 1 ? [...categories][0]! : doc.dataCategory, sortReviewedAt: new Date() })
    .where(eq(schema.documents.id, doc.id));
  await markItemsSupplied(user, company, [...accept]);
  return { ok: true, linked: accept.size };
}
