"use client";

import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import type { ImportState } from "@/app/advisor/cros/actions";

/**
 * Import a CRO Training Workbook: the file, and whose answers are in the "Your …" columns. Shows what
 * was imported, and (admins) validates the imported records in one go.
 */
export function WorkbookImport({
  cros,
  lockedCroId,
  canValidate,
  importAction,
  validateAction,
}: {
  cros: { id: string; name: string }[];
  /** A CRO importing their own answers. */
  lockedCroId: string | null;
  canValidate: boolean;
  importAction: (prev: ImportState, f: FormData) => Promise<ImportState>;
  validateAction: (ids: string[]) => Promise<{ validated: number; refused: number }>;
}) {
  const [state, run, pending] = useActionState(importAction, null);
  const [validating, start] = useTransition();
  const [validated, setValidated] = useState<{ validated: number; refused: number } | null>(null);
  const s = state?.summary;
  return (
    <div className="space-y-5">
      <form action={run} aria-label="Import a workbook" className="surface p-5 space-y-4">
        <WorkbookDrop />
        <label className="block">
          <span className="label">Whose answers are in the &ldquo;Your …&rdquo; columns</span>
          {lockedCroId ? (
            <>
              <input type="hidden" name="respondentCroId" value={lockedCroId} />
              <input disabled value={cros.find((c) => c.id === lockedCroId)?.name ?? ""} className="field mt-1" aria-label="Respondent" />
            </>
          ) : (
            <select name="respondentCroId" defaultValue="" className="field mt-1" aria-label="Respondent">
              <option value="">Nobody: only the named answer columns</option>
              {cros.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <span className="block text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            Columns named &ldquo;&lt;Name&gt; Answer&rdquo; (e.g. Ryan Answer) go to the CRO with that first name. Re-importing updates the same records.
          </span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Importing…" : "Import"}</button>
        {state?.error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{state.error}</p>}
      </form>

      {s && (
        <section role="status" aria-label="Import result" className="surface p-5 space-y-2 text-base">
          <p style={{ color: "var(--foreground)" }}>
            <strong>{s.scenarios}</strong> scenarios read: <strong>{s.created}</strong> records added, <strong>{s.updated}</strong> updated, {s.unchanged} unchanged, {s.unanswered} not answered yet.
          </p>
          {s.skippedNames.length > 0 && (
            <p className="text-sm" style={{ color: "var(--amber)" }}>
              Not imported: answers from {s.skippedNames.join(", ")} (no CRO with that first name{lockedCroId ? ", or not yours" : ""}).
            </p>
          )}
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>New and changed records are submitted for review; founders&apos; conversations use them once validated.</p>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/advisor/intelligence?status=submitted" className="link text-sm">Review them in the library →</Link>
            {canValidate && s.recordIds.length > 0 && !validated && (
              <button type="button" className="btn btn-secondary text-sm" disabled={validating} onClick={() => start(async () => setValidated(await validateAction(s.recordIds)))}>
                {validating ? "Validating…" : `Validate all ${s.recordIds.length} imported`}
              </button>
            )}
            {validated && (
              <span className="text-sm" style={{ color: "var(--green)" }}>
                {validated.validated} validated{validated.refused ? ` · ${validated.refused} need another reviewer` : ""}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** The workbook file: dropped onto the box or chosen (the file input stays the form field). */
function WorkbookDrop() {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const take = (files: FileList | null) => {
    const f = files?.[0];
    setError(null);
    if (!f) return setName(null);
    if (!/\.(csv|xlsx)$/i.test(f.name)) {
      setName(null);
      if (input.current) input.current.value = "";
      return setError("Use the workbook as .xlsx or .csv (in Google Sheets: File → Download).");
    }
    setName(f.name);
  };
  return (
    <div className="space-y-1">
      <span className="label">Workbook (.xlsx or .csv)</span>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!input.current || !e.dataTransfer.files.length) return;
          const dt = new DataTransfer();
          dt.items.add(e.dataTransfer.files[0]!);
          input.current.files = dt.files;
          take(dt.files);
        }}
        aria-label="Drop the workbook here"
        className="mt-1 flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-colors"
        style={{ borderColor: over ? "var(--primary)" : "var(--border)", background: over ? "var(--muted)" : "transparent" }}
      >
        <FileSpreadsheet aria-hidden className="w-7 h-7 shrink-0" style={{ color: name ? "var(--green)" : "var(--muted-foreground)" }} />
        <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {name ? (
            <>
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>{name}</span> ready to import. Drop another file or click to change it.
            </>
          ) : (
            <>
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>Drag the workbook here</span>, or click to choose it. In Google Sheets: File → Download → Microsoft Excel (.xlsx).
            </>
          )}
        </span>
        <input ref={input} type="file" name="file" accept=".csv,.xlsx" className="sr-only" aria-label="Workbook file" onChange={(e) => take(e.target.files)} />
      </label>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
