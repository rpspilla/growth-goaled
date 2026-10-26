"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ProgressView } from "@/lib/data/plan";

type Result = { ok: true } | { ok: false; error: string };
type Action = ProgressView["actions"][number];

const STATUS_LABEL: Record<Action["status"], string> = { not_started: "Not started", in_progress: "In progress", done: "Done", dropped: "Dropped" };
const TIMING: Record<string, string> = { next_30_days: "Days 1–30", days_31_60: "Days 31–60", days_61_90: "Days 61–90" };

function ActionRow({ a, update }: { a: Action; update: (id: string, status: string, note: string | null) => Promise<Result> }) {
  const [note, setNote] = useState(a.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (status: string, n: string | null) =>
    start(async () => {
      setError(null);
      const r = await update(a.id, status, n);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  const m = a.metric;
  return (
    <li className="py-4 border-t first:border-t-0 text-sm" style={{ borderColor: "var(--border)" }}>
      <div className="flex gap-3 items-start">
        <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: a.status === "done" ? "var(--green)" : "var(--muted)", color: a.status === "done" ? "#fff" : "var(--foreground)" }}>
          {a.status === "done" ? "✓" : a.priority}
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="font-medium" style={{ color: "var(--foreground)", textDecoration: a.status === "dropped" ? "line-through" : undefined }}>{a.action}</div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {a.timing ? TIMING[a.timing] ?? a.timing : ""}
            {a.role ? ` · ${a.role}` : ""}
            {a.successMetric ? ` · Measure: ${a.successMetric}` : ""}
          </div>
          {m && (
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {m.label}: baseline {m.baseline ?? "—"}
              {m.latest ? (
                <>
                  {" → now "}
                  <span className="font-semibold" style={{ color: m.direction === "better" ? "var(--green)" : m.direction === "worse" ? "var(--red)" : "var(--foreground)" }}>{m.latest}</span>
                </>
              ) : (
                " · no new figure yet"
              )}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <label className="sr-only" htmlFor={`status-${a.id}`}>Status</label>
            <select
              id={`status-${a.id}`}
              value={a.status}
              disabled={pending}
              onChange={(e) => save(e.target.value, note || null)}
              className="rounded-md border px-2 py-1 text-xs"
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="sr-only" htmlFor={`note-${a.id}`}>Note</label>
            <input
              id={`note-${a.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (a.note ?? "") && save(a.status, note || null)}
              placeholder="Add a note"
              className="flex-1 min-w-40 rounded-md border px-2 py-1 text-xs"
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>
          {error && <p className="text-xs" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
        </div>
      </div>
    </li>
  );
}

/** The committed plan's actions, each with a status, a note and its metric against baseline. */
export function PlanTracker({ actions, update }: { actions: Action[]; update: (id: string, status: string, note: string | null) => Promise<Result> }) {
  return <ul>{actions.map((a) => <ActionRow key={a.id} a={a} update={update} />)}</ul>;
}
