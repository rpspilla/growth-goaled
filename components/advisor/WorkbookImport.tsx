"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
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
        <label className="block">
          <span className="label">Workbook (.csv or .xlsx)</span>
          <input type="file" name="file" accept=".csv,.xlsx" required className="block mt-1 text-sm" aria-label="Workbook file" />
        </label>
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
