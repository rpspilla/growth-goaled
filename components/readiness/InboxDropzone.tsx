"use client";

import { UploadCloud } from "lucide-react";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { contentTypeFor, INBOX_FOLDER, MAX_UPLOAD_BYTES } from "@/lib/documents";
import { importFromLink, registerInboxUpload } from "@/app/(founder)/data/actions";
import { sha256 } from "./hash";

type Row = { key: string; name: string; state: "waiting" | "uploading" | "done" | "duplicate" | "error"; percent: number; error?: string };

const MAX_FILES = 25;

/** "Upload whatever you have": any files, any format, dropped or picked, sorted afterwards. */
export function InboxDropzone({ blobPrefix }: { blobPrefix: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function importLink() {
    if (!link.trim() || linkBusy) return;
    setLinkBusy(true);
    setLinkMsg(null);
    try {
      const r = await importFromLink(link);
      if (!r.ok) setLinkMsg({ kind: "error", text: r.error });
      else {
        setLinkMsg({ kind: "ok", text: r.duplicate ? `${r.filename} was already uploaded; using the existing copy.` : `Imported ${r.filename}. Reading and sorting it now.` });
        setLink("");
      }
    } catch {
      setLinkMsg({ kind: "error", text: "Import failed. Try again." });
    } finally {
      setLinkBusy(false);
      router.refresh();
    }
  }
  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function send(list: File[]) {
    if (busy || !list.length) return;
    const files = list.slice(0, MAX_FILES);
    const queued: Row[] = files.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, state: "waiting", percent: 0 }));
    if (list.length > MAX_FILES) queued.push({ key: "limit", name: `${list.length - MAX_FILES} more files`, state: "error", percent: 0, error: `Up to ${MAX_FILES} files at a time. Drop the rest after these finish.` });
    setRows(queued);
    setBusy(true);
    for (const [i, file] of files.entries()) {
      const key = queued[i]!.key;
      if (file.size > MAX_UPLOAD_BYTES) {
        set(key, { state: "error", error: "Files can be up to 25 MB." });
        continue;
      }
      if (file.size === 0) {
        set(key, { state: "error", error: "This file is empty." });
        continue;
      }
      try {
        set(key, { state: "uploading" });
        const contentHash = await sha256(file);
        const blob = await upload(`${blobPrefix}${INBOX_FOLDER}${file.name}`, file, {
          access: "private",
          handleUploadUrl: "/api/blob/upload",
          contentType: contentTypeFor(file.name, file.type),
          onUploadProgress: ({ percentage }) => set(key, { percent: Math.round(percentage) }),
        });
        const r = await registerInboxUpload({ pathname: blob.pathname, filename: file.name, contentHash });
        set(key, r.ok ? { state: r.duplicate ? "duplicate" : "done", percent: 100 } : { state: "error", error: r.error });
      } catch (err) {
        set(key, { state: "error", error: err instanceof Error ? err.message : "Upload failed." });
      }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mb-8">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files: drop them here or press to choose"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send([...e.dataTransfer.files]);
        }}
        className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all"
        style={{ borderColor: over ? "var(--green)" : "var(--border)", background: over ? "var(--green-muted)" : "var(--card)" }}
      >
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void send(files);
          }}
        />
        <span className="mx-auto mb-2 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--green-muted)", color: "var(--green)" }} aria-hidden>
          <UploadCloud size={24} />
        </span>
        <div className="font-display text-xl mb-1" style={{ color: "var(--foreground)" }}>Drop anything here</div>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }} title="We read spreadsheets, CSV, PDF and images, and suggest where each piece fits in the checklist. You confirm before anything is marked. Other formats are kept for your advisor.">
          Any format, several at once. We sort it.
        </p>
        <div data-label className="flex items-center justify-center gap-1.5 mt-2 flex-wrap" aria-hidden>
          {["XLSX", "CSV", "PDF", "PNG", "≤ 25 MB"].map((t) => (
            <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--subtle-foreground)" }}>
              {t}
            </span>
          ))}
        </div>
        <p className="sr-only">We read spreadsheets, CSV, PDF and images, and suggest where each piece fits in the checklist. You confirm before anything is marked. Other formats are kept for your advisor. Up to 25 MB per file.</p>
      </div>
      <form
        className="mt-3 flex gap-2 flex-wrap items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void importLink();
        }}
      >
        <label htmlFor="google-link" className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          Or a Google link:
        </label>
        <input
          id="google-link"
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className="flex-1 min-w-64 text-sm rounded-md border px-3 py-1.5"
          style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
        />
        <button disabled={linkBusy || !link.trim()} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60" style={{ background: "var(--green)", color: "#fff" }}>
          {linkBusy ? "Importing..." : "Import"}
        </button>
      </form>
      <details className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
        <summary className="cursor-pointer" style={{ color: "var(--green)" }}>About Google links</summary>
        <p className="mt-1">Google Sheets, Docs, Slides or Drive files. Set sharing to “Anyone with the link can view”. We save a copy now; later edits in Google aren&apos;t synced.</p>
      </details>
      {linkMsg && (
        <p role="status" className="text-xs mt-1" style={{ color: linkMsg.kind === "ok" ? "var(--green)" : "var(--red)" }}>
          {linkMsg.text}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="mt-3 space-y-1" aria-live="polite">
          {rows.map((r) => (
            <li key={r.key} className="text-xs flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
              <span className="truncate max-w-md" style={{ color: "var(--foreground)" }}>{r.name}</span>
              <span
                style={{
                  color: r.state === "error" ? "var(--red)" : r.state === "done" || r.state === "duplicate" ? "var(--green)" : "var(--amber)",
                }}
              >
                {r.state === "waiting" && "waiting"}
                {r.state === "uploading" && `uploading ${r.percent}%`}
                {r.state === "done" && "uploaded · reading and sorting"}
                {r.state === "duplicate" && "already uploaded · using the existing copy"}
                {r.state === "error" && (r.error ?? "failed")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
