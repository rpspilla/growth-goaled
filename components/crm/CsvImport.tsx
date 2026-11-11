"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { CATEGORY_NAMES, SOURCES } from "@/lib/crm";

type Result = { ok: true; added: number; duplicates: string[]; skipped: number; failed: number } | { ok: false; error: string };

/** Pick a CSV, choose defaults for rows that don't say, import. Duplicates by email are skipped. */
export function CsvImport({ run: importCsv }: { run: (text: string, defaults: { source: string; category: string }) => Promise<Result> }) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const choose = (f: File | null | undefined) => {
    setResult(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") return setError("That isn't a CSV file. Export your list as CSV (comma-separated) and drop it again.");
    setError(null);
    setFile(f);
  };
  return (
    <form
      aria-label="Import contacts"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        start(async () => {
          setResult(null);
          if (file.size > 5_000_000) return setResult({ ok: false, error: "That file is too large (5 MB at most)." });
          setResult(await importCsv(await file.text(), { source, category }));
        });
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a CSV file here, or choose one"
        onClick={() => picker.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), picker.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          choose(e.dataTransfer.files?.[0]);
        }}
        className="rounded-xl p-8 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors"
        style={{ border: `2px dashed ${over ? "var(--green)" : "var(--border)"}`, background: over ? "var(--green-muted)" : "var(--muted)" }}
      >
        {file ? (
          <>
            <FileSpreadsheet size={28} aria-hidden style={{ color: "var(--green)" }} />
            <div className="font-semibold" style={{ color: "var(--foreground)" }}>{file.name}</div>
            <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{Math.max(1, Math.round(file.size / 1024))} KB · drop another file or click to change</div>
          </>
        ) : (
          <>
            <UploadCloud size={28} aria-hidden style={{ color: over ? "var(--green)" : "var(--muted-foreground)" }} />
            <div className="font-semibold" style={{ color: "var(--foreground)" }}>{over ? "Drop to import" : "Drag and drop your CSV here"}</div>
            <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>or click to choose a file</div>
          </>
        )}
        <input ref={picker} type="file" accept=".csv,text/csv" aria-label="CSV file" onClick={(e) => e.stopPropagation()} onChange={(e) => choose(e.target.files?.[0])} className="sr-only" tabIndex={-1} />
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">Source for rows that don&apos;t say
          <select value={source} onChange={(e) => setSource(e.target.value)} className="field w-full mt-1"><option value="">Other</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="text-sm">Contact type for rows that don&apos;t say
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="field w-full mt-1"><option value="">—</option>{CATEGORY_NAMES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!file || pending}>{pending ? "Importing…" : "Import"}</button>
      {result && !result.ok && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{result.error}</p>}
      {result?.ok && (
        <div role="status" className="rounded-xl p-4 text-sm space-y-1" style={{ background: "var(--green-muted)", color: "var(--foreground)" }}>
          <div className="font-semibold">Imported {result.added} {result.added === 1 ? "contact" : "contacts"} into New Prospects.</div>
          {result.duplicates.length > 0 && <div>Skipped {result.duplicates.length} already in the CRM (same email): {result.duplicates.slice(0, 5).join(", ")}{result.duplicates.length > 5 ? "…" : ""}</div>}
          {result.skipped > 0 && <div>Skipped {result.skipped} rows without a name or email.</div>}
          {result.failed > 0 && <div>{result.failed} rows couldn&apos;t be added.</div>}
          <Link href="/advisor/crm" className="link">Back to the board →</Link>
        </div>
      )}
    </form>
  );
}
