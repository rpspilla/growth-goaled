"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { UploadCloud } from "lucide-react";
import { MAX_UPLOAD_BYTES } from "@/lib/documents";
import { PROJECT_FILE_TYPES, projectBlobPrefix } from "@/lib/project-files";

type Result = { ok: true } | { ok: false; error: string };
type File_ = { blobUrl: string; pathname: string; filename: string; mime: string | null; title: string };

/** Drop or pick a file (PDF, Word, PowerPoint, Excel, image) to share on a growth project. */
export function ProjectFileUpload({ companyId, label, save }: { companyId: string; label: string; save: (file: File_) => Promise<Result> }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setError("Files can be up to 25 MB.");
    if (file.type && !PROJECT_FILE_TYPES.includes(file.type)) return setError("Share a PDF, Word, PowerPoint, Excel, CSV or image file, or paste a link instead.");
    setBusy(file.name);
    try {
      const blob = await upload(`${projectBlobPrefix(companyId)}${file.name}`, file, { access: "private", handleUploadUrl: "/api/blob/upload", contentType: file.type || undefined });
      const r = await save({ blobUrl: blob.url, pathname: blob.pathname, filename: file.name, mime: file.type || null, title: file.name.replace(/\.[a-z0-9]+$/i, "") });
      if (!r.ok) setError(r.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-1">
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => picker.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), picker.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send(e.dataTransfer.files?.[0]);
        }}
        className="rounded-lg px-4 py-3 flex items-center gap-2 text-sm cursor-pointer"
        style={{ border: `2px dashed ${over ? "var(--green)" : "var(--border)"}`, background: over ? "var(--green-muted)" : "var(--card)", color: "var(--muted-foreground)" }}
      >
        <UploadCloud size={18} aria-hidden />
        {busy ? `Uploading ${busy}…` : "Drop a file here, or click to choose"}
        <input ref={picker} type="file" className="sr-only" tabIndex={-1} aria-label={`${label}: file`} onClick={(e) => e.stopPropagation()} onChange={(e) => void send(e.target.files?.[0])} />
      </div>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
