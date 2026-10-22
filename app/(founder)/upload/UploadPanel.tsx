"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import type { DocumentView } from "@/lib/data/documents";
import { ACCEPT_ATTR, contentTypeFor, DOC_TYPES, MAX_UPLOAD_BYTES, unsupportedReason, ACCEPTED_TYPES } from "@/lib/documents";
import { registerUpload, retryDocument, reviewPoint } from "./actions";

type DocType = DocumentView["docType"];

const card = { background: "var(--card)", borderColor: "var(--border)" };

function AnalyzingDots() {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--amber)", animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <span className="text-xs" style={{ color: "var(--amber)" }}>Analyzing document...</span>
    </div>
  );
}

function DocumentCard({ doc }: { doc: DocumentView }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const type = DOC_TYPES.find((t) => t.id === doc.docType);
  const busy = doc.status === "uploaded" || doc.status === "analyzing";
  const toReview = doc.points.filter((p) => p.status === "proposed").length;

  return (
    <div
      className="rounded-xl border transition-all"
      style={{ ...card, borderColor: doc.status === "done" ? "var(--green)" : busy ? "var(--amber)" : doc.status === "failed" ? "var(--red)" : "var(--border)" }}
    >
      <div className="p-4 flex items-center gap-4">
        <span className="text-xl">{type?.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
            {doc.filename} <span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>· {type?.label}</span>
          </div>
          {busy && <AnalyzingDots />}
          {doc.status === "done" && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs" style={{ color: "var(--green)" }}>
                {doc.dataPointsFound} data {doc.dataPointsFound === 1 ? "point" : "points"} identified
              </span>
              {doc.assumptionsFlagged > 0 && (
                <>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>·</span>
                  <span className="text-xs" style={{ color: "var(--amber)" }}>
                    {doc.assumptionsFlagged} {doc.assumptionsFlagged === 1 ? "assumption needs" : "assumptions need"} review
                  </span>
                </>
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
        {doc.status === "done" && doc.points.length > 0 && (
          <button onClick={() => setOpen(!open)} className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
            {open ? "Hide" : toReview > 0 ? `Review ${toReview}` : "View"}
          </button>
        )}
        {doc.status === "done" && (
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--green)" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t" style={{ borderColor: "var(--border)" }}>
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

export function UploadPanel({ blobPrefix, documents }: { blobPrefix: string; documents: DocumentView[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocType>("board_deck");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refresh while anything is still being analysed.
  const working = documents.some((d) => d.status === "uploaded" || d.status === "analyzing");
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [working, router]);

  async function send(file: File) {
    setError(null);
    const reason = unsupportedReason(file.name);
    const contentType = contentTypeFor(file.name, file.type);
    if (reason || !ACCEPTED_TYPES[contentType]) return setError(reason ?? "Upload a PDF, Excel (.xlsx), CSV or text file.");
    if (file.size > MAX_UPLOAD_BYTES) return setError("Files can be up to 25 MB.");

    setUploading({ name: file.name, percent: 0 });
    try {
      const blob = await upload(`${blobPrefix}${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/blob/upload",
        contentType,
        onUploadProgress: ({ percentage }) => setUploading({ name: file.name, percent: Math.round(percentage) }),
      });
      const result = await registerUpload({ pathname: blob.pathname, filename: file.name, docType });
      if (!result.ok) setError(result.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Bring your existing data.
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Upload documents and Growth Goaled extracts structured intelligence — not summaries.
        </p>
      </div>

      {/* Google Drive (Phase 2) */}
      <div className="rounded-xl border p-4 mb-6 flex items-center justify-between" style={card}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: "#EBF0FF" }}>📁</div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Google Drive</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Import directly from Drive · coming soon</div>
          </div>
        </div>
        <button disabled className="px-4 py-2 rounded-lg text-sm font-medium border opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
          Connect Drive
        </button>
      </div>

      {/* Document type + drop zone */}
      <div className="flex items-center gap-3 mb-3">
        <label htmlFor="doc-type" className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          This document is a
        </label>
        <select
          id="doc-type"
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocType)}
          className="px-3 py-1.5 rounded-lg border text-sm"
          style={{ background: "var(--muted)", borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          {DOC_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>
      <div
        role="button"
        tabIndex={0}
        className="rounded-xl border-2 border-dashed p-8 mb-3 text-center transition-all cursor-pointer"
        style={{
          borderColor: dragging ? "var(--green)" : "var(--border)",
          background: dragging ? "var(--green-muted)" : "var(--muted)",
          opacity: uploading ? 0.7 : 1,
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && !uploading) void send(file);
        }}
        onClick={() => !uploading && input.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !uploading && input.current?.click()}
      >
        <div className="text-3xl mb-2">⬆️</div>
        <div className="text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>
          {uploading ? `Uploading ${uploading.name}… ${uploading.percent}%` : "Drop a file here or click to upload"}
        </div>
        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          PDF, Excel (.xlsx), CSV · Max 25MB · Export presentations as PDF
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void send(file);
          }}
        />
      </div>
      {error && (
        <div className="rounded-lg px-3 py-2 text-xs mb-3" style={{ background: "var(--red-muted)", color: "var(--red)" }}>
          {error}
        </div>
      )}

      <div className="space-y-3 mt-6">
        {documents.length === 0 && (
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Board decks and financial models are the most useful places to start.
          </div>
        )}
        {documents.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Conflicts and assumptions found in your documents appear under Questions.
        </p>
        <Link href="/dashboard" className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90" style={{ background: "var(--green)", color: "#fff" }}>
          Back to Overview →
        </Link>
      </div>
    </div>
  );
}
