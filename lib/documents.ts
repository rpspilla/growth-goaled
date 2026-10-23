import type { schema } from "@/lib/db";

type DocType = (typeof schema.docType.enumValues)[number];

export const DOC_TYPES: { id: DocType; label: string; icon: string }[] = [
  { id: "board_deck", label: "Board deck", icon: "📊" },
  { id: "financial_model", label: "Financial model", icon: "📈" },
  { id: "customer_list", label: "Customer list", icon: "👥" },
  { id: "gtm_plan", label: "GTM plan", icon: "🎯" },
  { id: "sales_deck", label: "Sales presentation", icon: "💼" },
  { id: "hiring_plan", label: "Hiring plan", icon: "🗺️" },
  { id: "other", label: "Other document", icon: "📄" },
];

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Accepted uploads and how each is handled: PDFs go to extraction as documents,
 * spreadsheets and text as CSV/plain text. DOCX is stored and attached to the
 * company but not analysed automatically ("stored").
 */
export const ACCEPTED_TYPES: Record<string, "pdf" | "xlsx" | "text" | "stored"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "text",
  "text/plain": "text",
  "text/markdown": "text",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "stored",
};

export const ACCEPT_ATTR = ".pdf,.xlsx,.csv,.docx,.txt,.md";

/** Content type from the file name, for browsers that report an empty or generic type. */
export function contentTypeFor(filename: string, reported: string): string {
  if (ACCEPTED_TYPES[reported]) return reported;
  const ext = filename.toLowerCase().split(".").pop();
  return (
    {
      pdf: "application/pdf",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
      txt: "text/plain",
      md: "text/markdown",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }[ext ?? ""] ?? reported
  );
}

export function unsupportedReason(filename: string): string | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pptx" || ext === "ppt" || ext === "key") return "Export presentations as PDF, then upload the PDF.";
  if (ext === "xls" || ext === "numbers") return "Save spreadsheets as .xlsx or .csv first.";
  if (ext === "doc" || ext === "pages") return "Save documents as .docx or PDF first.";
  return null;
}

// ---------------------------------------------------------------------------
// Conflicts and assumptions
// ---------------------------------------------------------------------------

export type ComparablePoint = { id: string; metric: string; value: number; period: string | null };

/** Two periods describe the same moment if they match, or either is unspecified / "Current" (intake answers). */
export function samePeriod(a: string | null, b: string | null): boolean {
  const norm = (p: string | null) => (p ?? "").trim().toLowerCase();
  if (!norm(a) || !norm(b) || norm(a) === "current" || norm(b) === "current") return true;
  return norm(a) === norm(b);
}

/** Relative difference against the larger magnitude; 0.1 = 10%. */
export function relativeDifference(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? 0 : Math.abs(a - b) / scale;
}

export const CONFLICT_THRESHOLD = 0.1;

/** For each new point, the first earlier point it conflicts with (same metric and period, >10% apart). */
export function findConflicts<N extends ComparablePoint, E extends ComparablePoint>(newPoints: N[], earlier: E[]): { point: N; other: E }[] {
  const conflicts: { point: N; other: E }[] = [];
  for (const point of newPoints) {
    const other = earlier.find(
      (e) => e.id !== point.id && e.metric === point.metric && samePeriod(e.period, point.period) && relativeDifference(e.value, point.value) > CONFLICT_THRESHOLD,
    );
    if (other) conflicts.push({ point, other });
  }
  return conflicts;
}
