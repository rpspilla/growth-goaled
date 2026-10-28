"use client";

import { useState, useTransition } from "react";
import type { ReadinessFile } from "@/lib/data/readiness";
import {
  ITEM_STATUS_LABEL,
  METHOD_LABEL,
  QUALITY_LABEL,
  type CategoryId,
  type CollectionMethod,
  type DataItemDef,
  type ItemQuality,
  type ItemStatus,
} from "@/lib/readiness";
import { updateItem } from "@/app/(founder)/data/actions";
import { UploadButton } from "./UploadButton";
import { RemoveFileButton } from "./RemoveFileButton";

export type ItemRecord = {
  status: ItemStatus;
  quality: ItemQuality;
  collectionMethod: CollectionMethod | null;
  sourceSystem: string | null;
  integrationRef: string | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  limitations: string | null;
  notes: string | null;
  followUp: string | null;
  lastReviewedAt: string | null;
};

const STATUSES: ItemStatus[] = ["available", "partial", "missing", "not_applicable"];

export const STATUS_COLOR: Record<ItemStatus, string> = {
  not_reviewed: "var(--muted-foreground)",
  available: "var(--green)",
  partial: "var(--amber)",
  missing: "var(--red)",
  not_applicable: "var(--muted-foreground)",
};

const month = (d: string | null) => (d ? d.slice(0, 7) : "");
const inputClass = "w-full text-sm rounded-md border px-2.5 py-1.5";
const inputStyle = { background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>{label}</span>
      {children}
      {hint && <span className="block text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{hint}</span>}
    </label>
  );
}

/** One data requirement: status, details, linked files and gaps. Only the signed-in founder's company is ever edited. */
export function ItemCard({
  def,
  category,
  sources,
  record,
  files,
  missingFields,
  blobPrefix,
  why,
}: {
  def: DataItemDef;
  category: CategoryId;
  sources: string[];
  record: ItemRecord;
  files: ReadinessFile[];
  missingFields: string[];
  blobPrefix: string;
  /** Why the item matters for the active use case, shown on the card. */
  why?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    collectionMethod: record.collectionMethod ?? "",
    sourceSystem: record.sourceSystem ?? "",
    integrationRef: record.integrationRef ?? "",
    coverageStart: month(record.coverageStart),
    coverageEnd: month(record.coverageEnd),
    quality: record.quality,
    limitations: record.limitations ?? "",
    notes: record.notes ?? "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm({ ...form, [k]: e.target.value });
  };

  function save(patch: Parameters<typeof updateItem>[1]) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateItem(def.key, patch);
      if (!result.ok) setError(result.error);
      else setSaved(true);
    });
  }

  const needsAttention = record.status === "partial" || record.status === "missing";
  const listId = `sources-${def.key}`;

  return (
    <div className="rounded-xl border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{def.name}</span>
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "var(--muted)", color: def.required ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                {def.required ? "Required" : "Optional"}
              </span>
              <span className="text-xs font-medium" style={{ color: STATUS_COLOR[record.status] }}>● {ITEM_STATUS_LABEL[record.status]}</span>
              {record.status !== "not_reviewed" && record.status !== "missing" && record.status !== "not_applicable" && (
                <span className="text-xs" style={{ color: record.quality === "validated" ? "var(--green)" : "var(--muted-foreground)" }}>
                  · {QUALITY_LABEL[record.quality]}
                </span>
              )}
              {files.length > 0 && (
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  · {files.length} {files.length === 1 ? "file" : "files"}
                </span>
              )}
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{def.description}</p>
            {why && <p className="text-xs mt-1" style={{ color: "var(--foreground)" }}><span className="font-semibold">Why it matters:</span> {why}</p>}
          </div>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs px-3 py-1.5 rounded-md font-medium shrink-0"
            style={{ background: "var(--muted)", color: "var(--foreground)" }}
            aria-expanded={open}
          >
            {open ? "Close" : "Details"}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3" role="group" aria-label={`Status of ${def.name}`}>
          {STATUSES.map((s) => {
            const active = record.status === s;
            return (
              <button
                key={s}
                type="button"
                disabled={pending}
                aria-pressed={active}
                onClick={() => save({ status: s })}
                className="text-xs px-2.5 py-1 rounded-md border font-medium disabled:opacity-60"
                style={{
                  borderColor: active ? STATUS_COLOR[s] : "var(--border)",
                  background: active ? "var(--muted)" : "transparent",
                  color: active ? STATUS_COLOR[s] : "var(--muted-foreground)",
                }}
              >
                {ITEM_STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>

        {(missingFields.length > 0 || (needsAttention && record.followUp)) && (
          <div className="mt-3 space-y-1">
            {missingFields.length > 0 && (
              <p className="text-xs" style={{ color: "var(--amber)" }}>
                ⚠ The linked file doesn&apos;t appear to include: {missingFields.join(", ")}
              </p>
            )}
            {needsAttention && record.followUp && (
              <p className="text-xs" style={{ color: "var(--foreground)" }}>
                <span className="font-semibold">Advisor request:</span> {record.followUp}
              </p>
            )}
          </div>
        )}
        {error && <p className="text-xs mt-2" style={{ color: "var(--red)" }}>{error}</p>}
      </div>

      {open && (
        <div className="border-t p-4 space-y-4" style={{ borderColor: "var(--border)" }}>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>Why we ask</div>
              <p style={{ color: "var(--muted-foreground)" }}>{def.why}</p>
              {def.monthsNeeded && (
                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Ideally covers at least {def.monthsNeeded} months.</p>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>Usually found in</div>
              <p style={{ color: "var(--muted-foreground)" }}>{sources.join(", ")}</p>
              {needsAttention && !record.followUp && (
                <p className="text-xs mt-1" style={{ color: "var(--foreground)" }}>
                  <span className="font-semibold">What would help:</span> {def.followUp}
                </p>
              )}
            </div>
          </div>

          <form
            className="grid md:grid-cols-2 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save({
                collectionMethod: (form.collectionMethod || null) as CollectionMethod | null,
                sourceSystem: form.sourceSystem,
                integrationRef: form.integrationRef,
                coverageStart: form.coverageStart || null,
                coverageEnd: form.coverageEnd || null,
                ...(record.quality === "validated" && form.quality === "validated" ? {} : { quality: form.quality }),
                limitations: form.limitations,
                notes: form.notes,
              });
            }}
          >
            <Field label="Source system">
              <input list={listId} value={form.sourceSystem} onChange={set("sourceSystem")} maxLength={120} className={inputClass} style={inputStyle} placeholder="e.g. QuickBooks" />
              <datalist id={listId}>{sources.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="How it's provided">
              <select value={form.collectionMethod} onChange={set("collectionMethod")} className={inputClass} style={inputStyle}>
                <option value="">Not set</option>
                {(Object.keys(METHOD_LABEL) as CollectionMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </Field>
            <Field label="Coverage from">
              <input type="month" value={form.coverageStart} onChange={set("coverageStart")} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="Coverage to">
              <input type="month" value={form.coverageEnd} onChange={set("coverageEnd")} className={inputClass} style={inputStyle} />
            </Field>
            <Field
              label="Data quality"
              hint={record.quality === "validated" ? "Validated by your advisor. Changing the details resets this to unverified." : "Only your advisor can mark data as validated."}
            >
              {record.quality === "validated" ? (
                <div className="text-sm font-medium py-1.5" style={{ color: "var(--green)" }}>✓ Validated</div>
              ) : (
                <select value={form.quality} onChange={set("quality")} className={inputClass} style={inputStyle}>
                  <option value="unverified">{QUALITY_LABEL.unverified} (real data, not yet checked)</option>
                  <option value="estimated">{QUALITY_LABEL.estimated} (best guess, not from records)</option>
                </select>
              )}
            </Field>
            {form.collectionMethod === "integration" && (
              <Field label="Integration reference" hint="Which account or workspace. No live connection is made.">
                <input value={form.integrationRef} onChange={set("integrationRef")} maxLength={300} className={inputClass} style={inputStyle} />
              </Field>
            )}
            <div className="md:col-span-2">
              <Field label="Known limitations or missing fields">
                <textarea value={form.limitations} onChange={set("limitations")} maxLength={2000} rows={2} className={inputClass} style={inputStyle} placeholder="e.g. Before March we didn't split recurring and one-off revenue" />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Notes">
                <textarea value={form.notes} onChange={set("notes")} maxLength={2000} rows={2} className={inputClass} style={inputStyle} />
              </Field>
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <button type="submit" disabled={pending} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60" style={{ background: "var(--green)", color: "#fff" }}>
                {pending ? "Saving..." : "Save details"}
              </button>
              {saved && <span className="text-xs" style={{ color: "var(--green)" }}>Saved</span>}
              {record.lastReviewedAt && (
                <span className="text-xs ml-auto" style={{ color: "var(--muted-foreground)" }}>
                  Last reviewed {new Date(record.lastReviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
            </div>
          </form>

          <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>Files for this item</div>
              <UploadButton blobPrefix={blobPrefix} category={category} itemKeys={[def.key]} />
            </div>
            {files.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>No files linked yet. CSV, Excel (.xlsx), PDF or Word (.docx), up to 25 MB.</p>
            ) : (
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f.id} className="text-xs flex items-start justify-between gap-3" style={{ color: "var(--muted-foreground)" }}>
                    <span>
                      <span style={{ color: "var(--foreground)" }}>{f.filename}</span> · {FILE_STATUS[f.status]}
                      {f.dateRange && ` · dates ${f.dateRange.start} to ${f.dateRange.end}`}
                      {f.status === "failed" && f.error && <span style={{ color: "var(--red)" }}> · {f.error}</span>}
                    </span>
                    <RemoveFileButton documentId={f.id} filename={f.filename} compact />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const FILE_STATUS: Record<ReadinessFile["status"], string> = {
  uploaded: "queued for reading",
  analyzing: "reading",
  done: "read",
  failed: "couldn't be read",
  stored: "stored, not analysed automatically",
};
