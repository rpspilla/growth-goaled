"use client";

import { useState, useTransition } from "react";
import type { DocumentView } from "@/lib/data/documents";
import { CATEGORIES, getCategory, getItem } from "@/lib/readiness";
import { confirmFileItems } from "@/app/(founder)/readiness/actions";
import { AnalyzingDots } from "./DocumentCard";
import { RemoveFileButton } from "./RemoveFileButton";
import { useProcessingRefresh } from "./useProcessingRefresh";

const CONF_COLOR = { high: "var(--green)", medium: "var(--amber)", low: "var(--muted-foreground)" } as const;

function FileSuggestions({ doc }: { doc: DocumentView }) {
  const pending = doc.suggestions.filter((s) => s.status === "suggested");
  const [checked, setChecked] = useState<Set<string>>(() => new Set(pending.filter((s) => s.confidence !== "low").map((s) => s.itemKey)));
  const [extra, setExtra] = useState("");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toggle = (k: string) => setChecked((c) => {
    const n = new Set(c);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });
  const keys = [...new Set(pending.map((s) => s.itemKey))];
  const added = [...checked].filter((k) => !keys.includes(k));
  const confirm = (list: string[]) =>
    startTransition(async () => {
      setError(null);
      const r = await confirmFileItems(doc.id, list);
      if (!r.ok) setError(r.error);
    });

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{doc.filename}</div>
        <RemoveFileButton documentId={doc.id} filename={doc.filename} />
      </div>
      {doc.sortSummary && <p className="text-xs mt-0.5 mb-3" style={{ color: doc.sortStatus === "failed" ? "var(--amber)" : "var(--muted-foreground)" }}>{doc.sortSummary}</p>}
      {keys.length === 0 && <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>We didn&apos;t find anything that clearly matches the checklist. Pick items yourself below if it covers any.</p>}
      <ul className="space-y-1.5 mb-3">
        {[...keys, ...added].map((k) => {
          const item = getItem(k);
          const s = pending.filter((x) => x.itemKey === k);
          const best = s[0];
          return (
            <li key={k}>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="mt-1" checked={checked.has(k)} onChange={() => toggle(k)} />
                <span>
                  <span style={{ color: "var(--foreground)" }}>{item?.name ?? k}</span>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}> · {getCategory(item?.category ?? "")?.letter}. {getCategory(item?.category ?? "")?.name}</span>
                  {best ? (
                    <span className="block text-xs" style={{ color: "var(--muted-foreground)" }}>
                      <span style={{ color: CONF_COLOR[best.confidence] }}>{best.confidence}</span>
                      {s.map((x) => x.sheet).filter(Boolean).length > 0 && ` · sheet ${s.map((x) => `“${x.sheet}”`).join(", ")}`} · {best.reason}
                    </span>
                  ) : (
                    <span className="block text-xs" style={{ color: "var(--muted-foreground)" }}>Added by you</span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={extra}
          onChange={(e) => {
            if (e.target.value) setChecked((c) => new Set(c).add(e.target.value));
            setExtra("");
          }}
          className="text-xs rounded-md border px-2 py-1.5"
          style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
          aria-label="Add another checklist item this file covers"
        >
          <option value="">+ It also covers…</option>
          {CATEGORIES.map((c) => (
            <optgroup key={c.id} label={`${c.letter}. ${c.name}`}>
              {c.items.filter((i) => !checked.has(i.key)).map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
            </optgroup>
          ))}
        </select>
        <button disabled={busy} onClick={() => confirm([...checked])} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60" style={{ background: "var(--green)", color: "#fff" }}>
          {busy ? "Saving..." : checked.size ? `Confirm ${checked.size} ${checked.size === 1 ? "item" : "items"}` : "Confirm"}
        </button>
        <button disabled={busy} onClick={() => confirm([])} className="text-xs px-3 py-1.5 rounded-md border disabled:opacity-60" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          Doesn&apos;t cover any
        </button>
      </div>
      {error && <p className="text-xs mt-2" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}

/** Files from the inbox waiting to be read, sorted, or confirmed. */
export function SortReview({ docs }: { docs: DocumentView[] }) {
  const open = docs.filter((d) => !d.sortReviewed);
  const working = open.filter((d) => d.status === "uploaded" || d.status === "analyzing" || d.sortStatus === "sorting" || d.sortStatus === null);
  const toConfirm = open.filter((d) => !working.includes(d));
  useProcessingRefresh(working.length > 0);
  if (!working.length && !toConfirm.length) return null;

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>We sorted your files</h2>
      <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
        Check where each file fits. Confirming marks those items as available (unverified) and links the file; your advisor still reviews the data.
      </p>
      <div className="space-y-3">
        {working.map((d) => (
          <div key={d.id} className="rounded-xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{d.filename}</div>
              <RemoveFileButton documentId={d.id} filename={d.filename} />
            </div>
            <AnalyzingDots label={d.status === "uploaded" || d.status === "analyzing" ? "Reading the file..." : "Working out where it fits..."} />
          </div>
        ))}
        {toConfirm.map((d) => <FileSuggestions key={d.id} doc={d} />)}
      </div>
    </section>
  );
}
