"use client";

import { useState, useTransition } from "react";

const HEALTH = [
  { value: "good", label: "On track", color: "var(--green)" },
  { value: "watch", label: "Watch", color: "var(--amber)" },
  { value: "critical", label: "At risk", color: "var(--red)" },
] as const;

export function HealthPicker({ companyId, health, update }: { companyId: string; health: string | null; update: (id: string, h: string) => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-1" role="group" aria-label="Company health">
      {HEALTH.map((h) => (
        <button
          key={h.value}
          disabled={pending}
          aria-pressed={health === h.value}
          onClick={() => startTransition(() => update(companyId, health === h.value ? "" : h.value))}
          className="text-xs px-2.5 py-1 rounded-full font-medium border disabled:opacity-60"
          style={{ borderColor: health === h.value ? h.color : "var(--border)", color: health === h.value ? h.color : "var(--muted-foreground)", background: health === h.value ? "var(--muted)" : "transparent" }}
        >
          {h.label}
        </button>
      ))}
    </div>
  );
}

export function SummaryEditor({
  companyId,
  summary,
  meta,
  save,
}: {
  companyId: string;
  summary: string | null;
  meta: string | null;
  save: (id: string, text: string) => Promise<{ ok: boolean }>;
}) {
  const [text, setText] = useState(summary ?? "");
  const [editing, setEditing] = useState(!summary);
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-xl border-l-4 p-5" style={{ background: "var(--navy)", borderLeftColor: "var(--green)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="label" style={{ color: "var(--green)" }}>Advisor summary · internal</div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs" style={{ color: "#7A98B4" }}>Edit</button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Your read on this company: the constraint, what you'd focus on, anything the team should know. Not shown to the founder."
            className="w-full text-sm rounded-md border px-3 py-2"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "#1E3347", color: "#E2EAF4" }}
          />
          <div className="flex gap-3 mt-2">
            <button
              disabled={pending}
              onClick={() => startTransition(async () => { const r = await save(companyId, text); if (r.ok) setEditing(false); })}
              className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60"
              style={{ background: "var(--green)", color: "#fff" }}
            >
              {pending ? "Saving..." : "Save"}
            </button>
            {summary && <button onClick={() => { setText(summary); setEditing(false); }} className="text-xs" style={{ color: "#7A98B4" }}>Cancel</button>}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#E2EAF4" }}>{summary}</p>
          {meta && <p className="text-xs mt-2" style={{ color: "#7A98B4" }}>{meta}</p>}
        </>
      )}
    </div>
  );
}
