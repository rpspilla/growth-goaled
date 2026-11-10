import type { FileRow, PlanRow } from "@/components/documents/DocumentLibrary";
import type { LibraryFile, LibraryPlan } from "@/lib/data/document-library";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KINDS: [RegExp, string][] = [
  [/spreadsheet|excel|\.sheet/, "Spreadsheet"],
  [/csv/, "CSV"],
  [/pdf/, "PDF"],
  [/presentation|powerpoint/, "Slides"],
  [/word|document/, "Document"],
  [/^image\//, "Image"],
  [/^text\//, "Text"],
];
export const fileKind = (mime: string) => KINDS.find(([re]) => re.test(mime))?.[1] ?? "File";

const STATUS: Record<LibraryFile["status"], string> = { uploaded: "Uploaded", analyzing: "Being read", done: "Read", failed: "Couldn't be read", stored: "Stored" };

export const planRows = (plans: LibraryPlan[], href: (p: LibraryPlan) => string): PlanRow[] =>
  plans.map((p) => ({ id: p.id, title: p.title, tier: p.tier, status: p.status, date: day(p.date), href: href(p) }));

export const fileRows = (files: LibraryFile[], conversationHref: ((id: string) => string) | null): FileRow[] =>
  files.map((f) => ({
    id: f.id,
    filename: f.filename,
    kind: fileKind(f.mime),
    size: fileSize(f.size),
    date: day(f.date),
    status: STATUS[f.status],
    failed: f.status === "failed",
    source: f.conversation ? { label: `Shared in “${f.conversation.title}”`, href: conversationHref ? conversationHref(f.conversation.id) : null } : { label: "Data step", href: null },
    downloadHref: `/api/files/${f.id}`,
    sourceUrl: f.sourceUrl,
  }));
