"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { card, inputClass, inputStyle, primary, secondary } from "@/components/benchmarks/ui";
import { CSV_FIELDS, type CsvField, type CsvPreview } from "@/lib/benchmark-library/csv";
import type { commitImportAction, previewImportAction } from "@/app/advisor/benchmark-library/actions";

const STATUS_STYLE = {
  accepted: { color: "var(--green)", label: "Will import" },
  rejected: { color: "var(--red)", label: "Rejected" },
  skipped: { color: "var(--muted-foreground)", label: "Skipped" },
} as const;

/**
 * Upload → map columns → preview with every row's errors → confirm. Nothing is saved until
 * "Import to draft"; the server re-validates the file then, it never trusts this preview.
 */
export function ImportWizard({ datasetId, draftLabel, preview, commit }: { datasetId: string; draftLabel: string; preview: typeof previewImportAction; commit: typeof commitImportAction }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CsvPreview | null>(null);
  const [map, setMap] = useState<Partial<Record<CsvField, number>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ accepted: number; versionId: string } | null>(null);
  const [pending, start] = useTransition();

  const form = (m: Partial<Record<CsvField, number>> | null) => {
    const fd = new FormData();
    fd.set("file", file!);
    if (m) fd.set("map", JSON.stringify(m));
    return fd;
  };
  const check = (m: Partial<Record<CsvField, number>> | null) =>
    start(async () => {
      setError(null);
      const r = await preview(datasetId, form(m));
      if (!r.ok) {
        setError(r.error);
        setResult(null);
        return;
      }
      setResult(r.preview!);
      setMap(r.preview!.map);
    });

  if (done) {
    return (
      <div className="rounded-xl border p-5 text-sm space-y-2" style={card} role="status">
        <p style={{ color: "var(--foreground)" }}>Imported {done.accepted} {done.accepted === 1 ? "record" : "records"} into {draftLabel}. They&apos;re a draft: nothing is used until the version is validated and published.</p>
        <Link href={`/advisor/benchmark-library/${datasetId}?v=${done.versionId}`} className="inline-block px-4 py-2 rounded-lg font-semibold" style={primary}>Review the draft →</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-5 space-y-3" style={card}>
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>1. Choose a CSV file</span>
          <a href="/api/benchmark-library/template" className="text-xs font-semibold" style={{ color: "var(--green)" }}>Download the template</a>
        </div>
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setMap(null);
            setError(null);
          }}
          className="text-sm"
        />
        <div>
          <button type="button" disabled={!file || pending} onClick={() => check(null)} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={primary}>
            {pending && !result ? "Checking…" : "Preview"}
          </button>
        </div>
        {error && <p className="text-sm" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
      </div>

      {result && (
        <div className="rounded-xl border p-5 space-y-3" style={card}>
          <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>2. Check the column mapping</div>
          <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {CSV_FIELDS.map((f) => (
              <label key={f.field} className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                {f.column}
                {f.required && <span style={{ color: "var(--red)" }}> *</span>}
                <select
                  value={map?.[f.field] ?? ""}
                  onChange={(e) => setMap((m) => ({ ...m, [f.field]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                  className={`${inputClass} mt-1`}
                  style={inputStyle}
                >
                  <option value="">(not in file)</option>
                  {result.header.map((h, i) => <option key={`${h}-${i}`} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button type="button" disabled={pending} onClick={() => check(map)} className="px-3 py-1.5 rounded-md text-sm font-semibold disabled:opacity-50" style={secondary}>Re-check with this mapping</button>
        </div>
      )}

      {result && (
        <div className="rounded-xl border p-5 space-y-3" style={card}>
          <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>3. Preview</div>
          {result.fileErrors.map((e) => <p key={e} className="text-sm" role="alert" style={{ color: "var(--red)" }}>{e}</p>)}
          <p className="text-sm" style={{ color: "var(--foreground)" }} aria-live="polite">
            {result.counts.total} rows: <span style={{ color: "var(--green)" }}>{result.counts.accepted} will be imported</span>, <span style={{ color: "var(--red)" }}>{result.counts.rejected} rejected</span>, {result.counts.skipped} skipped (already in the dataset).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-left" style={{ color: "var(--muted-foreground)" }}>
                  <th className="py-1.5 pr-2">Line</th>
                  <th className="py-1.5 pr-2">Metric</th>
                  <th className="py-1.5 pr-2">Statistic</th>
                  <th className="py-1.5 pr-2">Value</th>
                  <th className="py-1.5 pr-2">Cohort</th>
                  <th className="py-1.5 pr-2">Period</th>
                  <th className="py-1.5">Result</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 50).map((r) => (
                  <tr key={r.line} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-2 font-mono">{r.line}</td>
                    <td className="py-1.5 pr-2">{r.raw.metric}</td>
                    <td className="py-1.5 pr-2">{r.raw.statistic}{r.raw.percentile ? ` ${r.raw.percentile}` : ""}</td>
                    <td className="py-1.5 pr-2 font-mono">{r.raw.value || (r.raw.valueLow ? `${r.raw.valueLow}–${r.raw.valueHigh}` : "")}</td>
                    <td className="py-1.5 pr-2">{[r.raw.stages, r.raw.arrMin || r.raw.arrMax ? `ARR ${r.raw.arrMin ?? ""}–${r.raw.arrMax ?? ""}` : null].filter(Boolean).join(" · ")}</td>
                    <td className="py-1.5 pr-2">{r.raw.period} {r.raw.periodBasis ? `(${r.raw.periodBasis})` : ""}</td>
                    <td className="py-1.5">
                      <span className="font-semibold" style={{ color: STATUS_STYLE[r.status].color }}>{STATUS_STYLE[r.status].label}</span>
                      {r.issues.length > 0 && (
                        <ul className="mt-0.5 space-y-0.5">
                          {r.issues.map((i, k) => (
                            <li key={k} style={{ color: i.severity === "error" ? "var(--red)" : "var(--muted-foreground)" }}>
                              {i.field ? `${i.field}: ` : ""}
                              {i.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.rows.length > 50 && <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Showing the first 50 of {result.rows.length} rows; every row is checked.</p>}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              disabled={pending || !result.counts.accepted}
              onClick={() =>
                start(async () => {
                  const r = await commit(datasetId, form(map));
                  if (r.ok) setDone({ accepted: r.accepted!, versionId: r.versionId! });
                  else setError(r.error);
                })
              }
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={primary}
            >
              {pending ? "Importing…" : `Import ${result.counts.accepted} to ${draftLabel}`}
            </button>
            {result.counts.rejected > 0 && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Rejected rows aren&apos;t imported. Fix them in the file and import it again; rows already imported are skipped.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
