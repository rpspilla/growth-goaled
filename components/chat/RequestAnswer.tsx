"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { CheckCircle2, FileSpreadsheet, UploadCloud } from "lucide-react";
import { contentTypeFor, INBOX_FOLDER, MAX_UPLOAD_BYTES } from "@/lib/documents";
import { answerLine, KIND_UNIT, type DataRequest, type RequestField } from "@/lib/plan-requests";
import { sha256 } from "@/components/readiness/hash";

type Result = { ok: boolean; error?: string };
export type FileRef = { pathname: string; filename: string; contentHash?: string };

const inputType = (f: RequestField) => (f.kind === "text" ? "text" : f.kind === "date" ? "date" : "text");
const placeholder = (f: RequestField) => (f.kind === "currency" ? "e.g. 24000" : f.kind === "percent" ? "e.g. 22" : f.kind === "days" ? "e.g. 45" : f.kind === "number" ? "e.g. 3" : "");

/**
 * A founder input on the action plan: the exact fields it needs, answered by typing them
 * (self-report, the default) or by dropping a file with the named columns.
 */
export function RequestAnswer({ action, request, blobPrefix, answer, answerFile, prefill = {} }: { action: string; request: DataRequest; blobPrefix: string; answer: (values: Record<string, string>) => Promise<Result>; answerFile: (file: FileRef) => Promise<Result>; /** Values already on file (the newest confirmed figure), shown filled in and labelled so. */ prefill?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"type" | "file">("type");
  // Already answered: the answer. Otherwise a figure on file, then the field's labelled default.
  const [values, setValues] = useState<Record<string, string>>(() => request.answer?.values ?? Object.fromEntries(request.fields.flatMap((f) => (prefill[f.key] ?? f.defaultValue) !== undefined ? [[f.key, prefill[f.key] ?? f.defaultValue!]] : [])));
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  const answered = Boolean(request.answer);

  const send = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setError("Files can be up to 25 MB.");
    setProgress(0);
    try {
      const contentHash = await sha256(file);
      const blob = await upload(`${blobPrefix}${INBOX_FOLDER}${file.name}`, file, { access: "private", handleUploadUrl: "/api/blob/upload", contentType: contentTypeFor(file.name, file.type), onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)) });
      const r = await answerFile({ pathname: blob.pathname, filename: file.name, contentHash });
      if (!r.ok) setError(r.error ?? "Couldn't save that file.");
      else setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2 pt-1" data-testid="founder-input">
      {request.fields.length > 0 && !answered && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          <span className="font-semibold">Needed: </span>
          {request.fields.map((f) => f.label).join(" · ")}
        </p>
      )}
      {answered && (
        <p className="text-xs flex gap-1.5 items-start" style={{ color: "var(--green)" }}>
          <CheckCircle2 size={14} className="shrink-0 mt-px" aria-hidden />
          <span>{answerLine(request)}</span>
        </p>
      )}
      {!open ? (
        <button type="button" className="text-xs font-semibold link" onClick={() => setOpen(true)} aria-label={`${answered ? "Change your answer" : "Answer"}: ${action}`}>
          {answered ? "Change your answer" : "Answer this"}
        </button>
      ) : (
        <div className="rounded-lg p-3 space-y-3" style={{ background: "var(--muted)" }}>
          <div role="tablist" aria-label="How to answer" className="flex gap-1 text-xs">
            {(["type", "file"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className="px-2.5 py-1 rounded-full font-semibold" style={mode === m ? { background: "var(--card)", color: "var(--foreground)" } : { color: "var(--muted-foreground)" }}>
                {m === "type" ? "Type the values" : "Drop a file"}
              </button>
            ))}
          </div>
          {mode === "type" ? (
            <form
              aria-label={`Answer: ${action}`}
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  setError(null);
                  const r = await answer(values);
                  if (!r.ok) setError(r.error ?? "Couldn't save that.");
                  else setOpen(false);
                });
              }}
            >
              {request.fields.map((f) => (
                <label key={f.key} className="block text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {f.label}
                  {KIND_UNIT[f.kind] && ` (${KIND_UNIT[f.kind]})`}
                  <input type={inputType(f)} inputMode={f.kind === "text" || f.kind === "date" ? undefined : "decimal"} className="field w-full mt-0.5 text-sm py-1" value={values[f.key] ?? ""} placeholder={placeholder(f)} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                  {!request.answer && prefill[f.key] !== undefined && <span className="block mt-0.5" style={{ color: "var(--blue)" }}>Filled in from your data. Change it if it&apos;s out of date.</span>}
                  {!request.answer && prefill[f.key] === undefined && f.defaultValue !== undefined && <span className="block mt-0.5" style={{ color: "var(--amber)" }}>{f.defaultLabel ?? "A default, not your figure."}</span>}
                  {f.optional && <span className="block mt-0.5">Optional.</span>}
                  {f.hint && <span className="block mt-0.5">{f.hint}</span>}
                </label>
              ))}
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary text-sm py-1.5" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
                <button type="button" className="btn btn-secondary text-sm py-1.5" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="space-y-2">
              {request.columns.length > 0 && (
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-semibold">The file needs these columns: </span>
                  {request.columns.join(", ")}
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                aria-label={`Drop a file to answer: ${action}`}
                onClick={() => picker.current?.click()}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), picker.current?.click())}
                onDragOver={(e) => (e.preventDefault(), setOver(true))}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  void send(e.dataTransfer.files?.[0]);
                }}
                className="rounded-lg p-4 flex flex-col items-center gap-1 text-center text-xs cursor-pointer"
                style={{ border: `2px dashed ${over ? "var(--green)" : "var(--border)"}`, background: over ? "var(--green-muted)" : "var(--card)", color: "var(--muted-foreground)" }}
              >
                {progress !== null ? <FileSpreadsheet size={20} aria-hidden /> : <UploadCloud size={20} aria-hidden />}
                {progress !== null ? `Uploading… ${progress}%` : "Drag and drop a CSV, Excel or PDF, or click to choose"}
                <input ref={picker} type="file" className="sr-only" tabIndex={-1} aria-label="File to answer with" onClick={(e) => e.stopPropagation()} onChange={(e) => void send(e.target.files?.[0])} />
              </div>
              <button type="button" className="btn btn-secondary text-sm py-1.5" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          )}
          {error && <p role="alert" className="text-xs" style={{ color: "var(--red)" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
