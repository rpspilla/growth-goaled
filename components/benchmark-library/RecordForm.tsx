"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inputClass, inputStyle, primary, secondary } from "@/components/benchmarks/ui";
import { PERIOD_BASES, STATISTICS, UNITS, type RawRecord } from "@/lib/benchmark-library/records";
import type { saveRecordAction } from "@/app/advisor/benchmark-library/actions";

type Field = { name: keyof RawRecord; label: string; kind?: "select" | "textarea"; options?: readonly string[]; placeholder?: string; wide?: boolean };

const FIELDS: Field[] = [
  { name: "metric", label: "Metric key", placeholder: "nrr" },
  { name: "displayName", label: "Display name", placeholder: "Defaults for known metrics" },
  { name: "statistic", label: "Statistic", kind: "select", options: STATISTICS },
  { name: "percentile", label: "Percentile (1–99)" },
  { name: "value", label: "Value", placeholder: "95 for 95%" },
  { name: "valueLow", label: "Range low" },
  { name: "valueHigh", label: "Range high" },
  { name: "unit", label: "Unit", kind: "select", options: UNITS },
  { name: "period", label: "Measurement period", placeholder: "FY2025" },
  { name: "periodBasis", label: "Period basis", kind: "select", options: PERIOD_BASES },
  { name: "stages", label: "Stages (; separated)", placeholder: "Seed; Series A" },
  { name: "arrMin", label: "ARR min", placeholder: "1M" },
  { name: "arrMax", label: "ARR max", placeholder: "10M" },
  { name: "businessModel", label: "Business model" },
  { name: "pricingModel", label: "Pricing model" },
  { name: "industry", label: "Industry" },
  { name: "customerSegment", label: "Customer segment" },
  { name: "acvMin", label: "ACV min" },
  { name: "acvMax", label: "ACV max" },
  { name: "geography", label: "Geography" },
  { name: "sampleSize", label: "Sample size" },
  { name: "definition", label: "Definition (as the source states it)", kind: "textarea", wide: true },
  { name: "cohortDefinition", label: "Cohort definition", kind: "textarea", wide: true },
  { name: "methodology", label: "Methodology notes", kind: "textarea", wide: true },
  { name: "limitations", label: "Limitations", kind: "textarea", wide: true },
];

/** Quick manual entry (or edit) of one record, with field-level errors from the same validator as the CSV import. */
export function RecordForm({ datasetId, versionId, recordId, initial, onDone, action }: { datasetId: string; versionId?: string; recordId?: string; initial?: RawRecord; onDone?: () => void; action: typeof saveRecordAction }) {
  const [values, setValues] = useState<RawRecord>(initial ?? { unit: "percent", statistic: "median", periodBasis: "annual", definitionMatches: "no" });
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof RawRecord, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const fieldError = (k: string) => errors.filter((e) => e.field === k).map((e) => e.message).join(" ");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await action(datasetId, { versionId, recordId }, values);
          if (r.ok) {
            setErrors([]);
            setError(null);
            if (!recordId) setValues((x) => ({ ...x, statistic: x.statistic, value: "", percentile: "", valueLow: "", valueHigh: "" }));
            router.refresh();
            onDone?.();
          } else {
            setError(r.error);
            setErrors(r.issues ?? []);
          }
        });
      }}
    >
      <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {FIELDS.map((f) => {
          const id = `${recordId ?? "new"}-${f.name}`;
          const msg = fieldError(f.name);
          return (
            <label key={f.name} htmlFor={id} className={`block text-xs font-medium ${f.wide ? "sm:col-span-3 lg:col-span-2" : ""}`} style={{ color: "var(--muted-foreground)" }}>
              {f.label}
              {f.kind === "select" ? (
                <select id={id} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} className={`${inputClass} mt-1`} style={inputStyle}>
                  {f.options!.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                </select>
              ) : f.kind === "textarea" ? (
                <textarea id={id} rows={2} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} className={`${inputClass} mt-1`} style={{ ...inputStyle, borderColor: msg ? "var(--red)" : inputStyle.borderColor }} />
              ) : (
                <input id={id} value={values[f.name] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} className={`${inputClass} mt-1`} style={{ ...inputStyle, borderColor: msg ? "var(--red)" : inputStyle.borderColor }} />
              )}
              {msg && <span className="block mt-0.5 font-normal" style={{ color: "var(--red)" }}>{msg}</span>}
            </label>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground)" }}>
        <input type="checkbox" checked={values.definitionMatches === "yes"} onChange={(e) => set("definitionMatches", e.target.checked ? "yes" : "no")} />
        The source&apos;s definition matches Growth Goaled&apos;s (otherwise comparisons are labelled directional)
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={primary}>{pending ? "Saving…" : recordId ? "Save record" : "Add record"}</button>
        {onDone && <button type="button" onClick={onDone} className="px-3 py-2 rounded-lg text-sm" style={secondary}>Cancel</button>}
        {error && <span className="text-sm" role="alert" style={{ color: "var(--red)" }}>{error}</span>}
      </div>
    </form>
  );
}
