"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { contentTypeFor, INBOX_FOLDER, MAX_UPLOAD_BYTES } from "@/lib/documents";
import { registerInboxUpload } from "@/app/(founder)/readiness/actions";
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
        <div className="text-2xl mb-2" aria-hidden>📥</div>
        <div className="font-display text-xl mb-1" style={{ color: "var(--foreground)" }}>Upload whatever you have and we&apos;ll help you get organized</div>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          One messy spreadsheet, a board deck, CRM exports, screenshots: any format, several at once. Drag files here or click to choose.
        </p>
        <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
          We read spreadsheets, CSV, PDF and images, and suggest where each piece fits in the checklist. You confirm before anything is marked. Other formats are kept for your advisor. Up to 25 MB per file.
        </p>
      </div>
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
