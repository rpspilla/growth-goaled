import "server-only";
import { get, head } from "@vercel/blob";
import ExcelJS from "exceljs";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import { ACCEPTED_TYPES, DOC_TYPES, findConflicts, MAX_UPLOAD_BYTES } from "@/lib/documents";
import { AI_MODEL } from "@/lib/ai/config";
import { extractMetrics, ExtractionError, type ExtractionInput } from "@/lib/ai/extract";

type DocType = (typeof schema.docType.enumValues)[number];

/** Blob path prefix for a company's uploads; upload tokens are only issued under it. */
export const companyBlobPrefix = (companyId: string) => `companies/${companyId}/`;

// PDFs go to the model as base64, which must fit in one request.
const MAX_PDF_BYTES = 20 * 1024 * 1024;

export type RegisterInput = { pathname: string; docType: DocType; filename: string };

/** Records an upload the founder finished, after checking the blob is theirs. */
export async function registerDocument(user: User, company: Company, input: RegisterInput) {
  if (!input.pathname.startsWith(companyBlobPrefix(company.id))) throw new Error("That file doesn't belong to your company.");
  const blob = await head(input.pathname);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("File is too large.");
  if (!ACCEPTED_TYPES[blob.contentType]) throw new Error("That file type isn't supported.");

  const [doc] = await db
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
    })
    .returning();
  await track("document_uploaded", { userId: user.id, companyId: company.id, props: { docType: input.docType, mime: blob.contentType } });
  return doc!;
}

async function readBlob(url: string): Promise<Buffer> {
  const result = await get(url, { access: "private" });
  if (!result) throw new ExtractionError("The uploaded file could not be found.");
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

/** One CSV block per worksheet, using each cell's displayed text. */
async function spreadsheetToCsv(bytes: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const sheets: string[] = [];
  workbook.eachSheet((sheet) => {
    const lines: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(quote(row.getCell(c).text ?? ""));
      lines.push(cells.join(","));
    });
    if (lines.length) sheets.push(`# Sheet: ${sheet.name}\n${lines.join("\n")}`);
  });
  return sheets.join("\n\n");
}

async function buildInput(doc: typeof schema.documents.$inferSelect): Promise<ExtractionInput> {
  const docLabel = DOC_TYPES.find((d) => d.id === doc.docType)?.label ?? "Document";
  const kind = ACCEPTED_TYPES[doc.mime];
  const bytes = await readBlob(doc.blobUrl);
  if (kind === "pdf") {
    if (bytes.length > MAX_PDF_BYTES) throw new ExtractionError("PDFs can be up to 20 MB. Split or compress the file.");
    return { kind: "pdf", base64: bytes.toString("base64"), filename: doc.filename, docLabel };
  }
  const text = kind === "xlsx" ? await spreadsheetToCsv(bytes) : bytes.toString("utf8");
  if (!text.trim()) throw new ExtractionError("The file has no readable content.");
  return { kind: "text", text, filename: doc.filename, docLabel };
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

  await db.update(schema.documents).set({ status: "analyzing", error: null }).where(eq(schema.documents.id, doc.id));
  const [run] = await db
    .insert(schema.agentRuns)
    .values({ documentId: doc.id, agent: "extract", model: AI_MODEL, status: "running" })
    .returning({ id: schema.agentRuns.id });
  const started = Date.now();

  try {
    const result = await extractMetrics(await buildInput(doc));

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
  status: "uploaded" | "analyzing" | "done" | "failed";
  error: string | null;
  dataPointsFound: number;
  assumptionsFlagged: number;
  createdAt: string;
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
    dataPointsFound: d.dataPointsFound,
    assumptionsFlagged: d.assumptionsFlagged,
    createdAt: d.createdAt.toISOString(),
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
