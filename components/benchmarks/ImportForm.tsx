"use client";

import { useActionState } from "react";
import type { ImportResult } from "@/lib/data/benchmarks";
import { card, inputClass, inputStyle, primary } from "./ui";

export function ImportForm({ cohortId, action }: { cohortId: string; action: (prev: ImportResult | null, fd: FormData) => Promise<ImportResult> }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="rounded-xl border p-5 space-y-3" style={card}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Import advisory data (CSV)</div>
        <a href="/advisor/benchmarks/template" className="text-xs font-semibold" style={{ color: "var(--green)" }}>Download template</a>
      </div>
      <input type="hidden" name="cohortId" value={cohortId} />
      <input type="file" name="file" accept=".csv,text/csv" required className="text-xs" style={{ color: "var(--foreground)" }} />
      <div className="grid grid-cols-2 gap-2">
        <input name="sourceName" required minLength={2} placeholder="Source name, e.g. Portfolio survey Q3 2026" className={`${inputClass} col-span-2`} style={inputStyle} />
        <input name="publisher" placeholder="Publisher" className={inputClass} style={inputStyle} />
        <input name="year" inputMode="numeric" placeholder="Year" className={inputClass} style={inputStyle} />
        <input name="licenceNote" placeholder="Licence / usage note" className={`${inputClass} col-span-2`} style={inputStyle} />
      </div>
      <button disabled={pending} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60" style={primary}>
        {pending ? "Importing..." : "Import as proposed"}
      </button>
      {state?.ok && (
        <p className="text-xs" style={{ color: "var(--green)" }}>
          Imported {state.imported} {state.imported === 1 ? "row" : "rows"} as proposed. Approve them below before they&apos;re used.
        </p>
      )}
      {state && !state.ok && <p className="text-xs" style={{ color: "var(--red)" }}>{state.error}</p>}
      {state?.errors && state.errors.length > 0 && (
        <ul className="text-xs space-y-0.5" style={{ color: "var(--amber)" }}>
          {state.errors.slice(0, 20).map((e) => <li key={e.line}>Line {e.line}: {e.message}</li>)}
          {state.errors.length > 20 && <li>+{state.errors.length - 20} more</li>}
        </ul>
      )}
    </form>
  );
}
