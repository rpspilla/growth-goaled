"use client";

import { useState, useTransition } from "react";
import type { DocumentView } from "@/lib/data/documents";
import { DOC_TYPES } from "@/lib/documents";
import { getCategory, getItem } from "@/lib/readiness";
import { retryDocument, reviewPoint } from "@/app/(founder)/readiness/actions";
import { RemoveFileButton } from "./RemoveFileButton";

export function AnalyzingDots({ label = "Analyzing document..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--amber)", animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <span className="text-xs" style={{ color: "var(--amber)" }}>{label}</span>
    </div>
  );
}

/** One uploaded file: processing status, what it was linked to, its shape, and extracted values to accept/reject. */
export function DocumentCard({ doc }: { doc: DocumentView }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const type = DOC_TYPES.find((t) => t.id === doc.docType);
  const busy = doc.status === "uploaded" || doc.status === "analyzing";
  const toReview = doc.points.filter((p) => p.status === "proposed").length;
  const category = doc.category ? getCategory(doc.category) : null;
  const columns = doc.profile ? [...new Set(doc.profile.sheets.flatMap((s) => s.columns))] : [];
  const rows = doc.profile?.sheets.reduce((n, s) => n + s.rows, 0) ?? 0;
  const border = doc.status === "done" ? "var(--green)" : busy ? "var(--amber)" : doc.status === "failed" ? "var(--red)" : "var(--border)";

  return (
    <div className="rounded-xl border transition-all" style={{ background: "var(--card)", borderColor: border }}>
      <div className="p-4 flex items-center gap-4">
        <span className="text-xl">{type?.icon ?? "📄"}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
            {doc.filename}
            <span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>
              {" · "}
              {category ? `${category.letter}. ${category.name}` : type?.label} · uploaded {new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
          {doc.sourceUrl && (
            <div className="text-xs mt-0.5">
              <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--green)" }}>Imported from Google ↗</a>
            </div>
          )}
          {doc.itemKeys.length > 0 && (
            <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              Supports: {doc.itemKeys.map((k) => getItem(k)?.name ?? k).join(", ")}
            </div>
          )}
          {busy && <AnalyzingDots />}
          {doc.status === "stored" && (
            <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              Stored for your advisor · this format isn&apos;t read automatically
            </div>
          )}
          {doc.status === "done" && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs" style={{ color: "var(--green)" }}>
                {doc.dataPointsFound} data {doc.dataPointsFound === 1 ? "point" : "points"} identified
              </span>
              {doc.assumptionsFlagged > 0 && (
                <span className="text-xs" style={{ color: "var(--amber)" }}>
                  · {doc.assumptionsFlagged} {doc.assumptionsFlagged === 1 ? "assumption needs" : "assumptions need"} review
                </span>
              )}
              {doc.profile && (
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  · {rows.toLocaleString("en-US")} rows
                  {doc.profile.dateRange && ` · dates ${doc.profile.dateRange.start} to ${doc.profile.dateRange.end}`}
                </span>
              )}
            </div>
          )}
          {doc.status === "failed" && <div className="text-xs mt-1" style={{ color: "var(--red)" }}>{doc.error ?? "Analysis failed."}</div>}
        </div>
        {doc.status === "failed" && (
          <button
            disabled={pending}
            onClick={() => startTransition(() => retryDocument(doc.id))}
            className="text-xs px-3 py-1.5 rounded-md font-medium"
            style={{ background: "var(--muted)", color: "var(--foreground)" }}
          >
            Retry
          </button>
        )}
        {(doc.points.length > 0 || columns.length > 0) && (
          <button onClick={() => setOpen(!open)} className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
            {open ? "Hide" : toReview > 0 ? `Review ${toReview}` : "Details"}
          </button>
        )}
        <RemoveFileButton documentId={doc.id} filename={doc.filename} />
      </div>

      {open && (
        <div className="border-t" style={{ borderColor: "var(--border)" }}>
          {columns.length > 0 && (
            <div className="px-4 py-3 border-b text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>Columns found: </span>
              {columns.slice(0, 30).join(" · ")}
              {columns.length > 30 && ` · +${columns.length - 30} more`}
            </div>
          )}
          {doc.points.map((p) => (
            <div key={p.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 border-b text-sm" style={{ borderColor: "var(--border)" }}>
              <div className="col-span-3 font-medium" style={{ color: "var(--foreground)" }}>{p.label}</div>
              <div className="col-span-2 font-mono font-semibold" style={{ color: "var(--foreground)" }}>
                {p.value}
                {p.period && <div className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>{p.period}</div>}
              </div>
              <div className="col-span-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
                {p.rawText && <span>“{p.rawText}”</span>}
                {p.page != null && <span> · p.{p.page}</span>}
                <span className="capitalize"> · {p.confidence} confidence</span>
              </div>
              <div className="col-span-3 flex justify-end gap-2">
                {p.status === "proposed" ? (
                  <>
                    <button
                      disabled={pending}
                      onClick={() => startTransition(() => reviewPoint(p.id, "accepted"))}
                      className="text-xs px-2.5 py-1 rounded-md font-semibold"
                      style={{ background: "var(--green)", color: "#fff" }}
                    >
                      Accept
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => startTransition(() => reviewPoint(p.id, "rejected"))}
                      className="text-xs px-2.5 py-1 rounded-md font-medium border"
                      style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-medium" style={{ color: p.status === "accepted" ? "var(--green)" : "var(--muted-foreground)" }}>
                    {p.status === "accepted" ? "✓ Accepted" : "Rejected"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
