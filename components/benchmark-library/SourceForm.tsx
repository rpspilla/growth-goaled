"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { card, inputClass, inputStyle, primary } from "@/components/benchmarks/ui";
import type { saveSourceAction } from "@/app/advisor/benchmark-library/actions";

type Source = {
  id: string;
  name: string;
  publisher: string | null;
  url: string | null;
  documentRef: string | null;
  publishedOn: string | null;
  collectionPeriod: string | null;
  kind: string;
  attribution: string | null;
  licenceNote: string | null;
  allowCustomerDisplay: boolean;
  allowDerived: boolean;
  reliability: string;
  updateFrequency: string | null;
  reviewIntervalDays: number | null;
  consentReference: string | null;
  minAggregationSize: number | null;
  notes: string | null;
};

const KINDS = [
  ["published_report", "Published report"],
  ["licensed_dataset", "Licensed dataset"],
  ["internal_research", "Internal research"],
  ["aggregated_customer", "Aggregated customer data"],
] as const;
const RELIABILITY = [
  ["unverified", "Unverified"],
  ["reliable", "Reliable"],
  ["use_with_caution", "Use with caution"],
  ["unreliable", "Unreliable (never used)"],
] as const;

function Field({ label, name, defaultValue, type = "text", placeholder, hint }: { label: string; name: string; defaultValue?: string | number | null; type?: string; placeholder?: string; hint?: string }) {
  return (
    <label className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
      {label}
      <input name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} className={`${inputClass} mt-1`} style={inputStyle} />
      {hint && <span className="block mt-0.5 font-normal">{hint}</span>}
    </label>
  );
}

/** Add or edit a source: provenance, licence terms and review rules. */
export function SourceForm({ source, action }: { source?: Source; action: typeof saveSourceAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [kind, setKind] = useState(source?.kind ?? "published_report");
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && !source) router.push("/advisor/benchmark-library/sources");
  }, [state, source, router]);
  return (
    <form action={formAction} className="rounded-xl border p-5 space-y-4" style={card}>
      <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{source ? `Edit ${source.name}` : "New source"}</div>
      {source && <input type="hidden" name="id" value={source.id} />}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Source name" name="name" defaultValue={source?.name} />
        <Field label="Publisher" name="publisher" defaultValue={source?.publisher} />
        <Field label="URL" name="url" type="url" defaultValue={source?.url} placeholder="https://" />
        <Field label="Document reference" name="documentRef" defaultValue={source?.documentRef} hint="Report title, page or file reference" />
        <Field label="Publication date" name="publishedOn" type="date" defaultValue={source?.publishedOn} />
        <Field label="Data collection period" name="collectionPeriod" defaultValue={source?.collectionPeriod} placeholder="e.g. Jan–Dec 2025" />
        <label className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          Source type
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={`${inputClass} mt-1`} style={inputStyle}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
          Reliability
          <select name="reliability" defaultValue={source?.reliability ?? "unverified"} className={`${inputClass} mt-1`} style={inputStyle}>
            {RELIABILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <Field label="Update frequency" name="updateFrequency" defaultValue={source?.updateFrequency} placeholder="e.g. Annual" />
        <Field label="Review interval (days)" name="reviewIntervalDays" type="number" defaultValue={source?.reviewIntervalDays} hint="Published datasets are flagged for review after this. Default 365." />
      </div>
      <fieldset className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
        <legend className="text-xs font-semibold px-1" style={{ color: "var(--foreground)" }}>Licence and use</legend>
        <Field label="Attribution required" name="attribution" defaultValue={source?.attribution} hint="Shown with every comparison that uses it" />
        <Field label="Usage and licence restrictions" name="licenceNote" defaultValue={source?.licenceNote} />
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground)" }}>
          <input type="checkbox" name="allowCustomerDisplay" defaultChecked={source?.allowCustomerDisplay ?? false} />
          The licence allows showing these values in customer reports
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground)" }}>
          <input type="checkbox" name="allowDerived" defaultChecked={source?.allowDerived ?? false} />
          The licence allows derived figures (differences from the company&apos;s value)
        </label>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Both are off until you confirm the licence. Being able to read or download a report doesn&apos;t grant these rights.</p>
      </fieldset>
      {kind === "aggregated_customer" && (
        <fieldset className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--amber)" }}>
          <legend className="text-xs font-semibold px-1" style={{ color: "var(--amber)" }}>Customer data safeguards</legend>
          <Field label="Consent reference" name="consentReference" defaultValue={source?.consentReference} hint="The agreement or consent record that authorises this use" />
          <Field label="Minimum companies per cohort" name="minAggregationSize" type="number" defaultValue={source?.minAggregationSize} hint="At least 5. Cohorts below it can't be published." />
        </fieldset>
      )}
      <label className="block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
        Internal notes
        <textarea name="notes" defaultValue={source?.notes ?? ""} rows={2} className={`${inputClass} mt-1`} style={inputStyle} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={primary}>{pending ? "Saving…" : source ? "Save source" : "Add source"}</button>
        {state && !state.ok && <span className="text-sm" role="alert" style={{ color: "var(--red)" }}>{state.error}</span>}
        {state?.ok && source && <span className="text-sm" role="status" style={{ color: "var(--green)" }}>Saved.</span>}
      </div>
    </form>
  );
}
