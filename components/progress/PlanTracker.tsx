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
  const control = { background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" };
  return (
    <li className="surface p-5" style={a.status === "done" ? { borderColor: "var(--green)" } : undefined}>
      <div className="flex gap-4 items-start">
        <span className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: a.status === "done" ? "var(--green)" : "var(--muted)", color: a.status === "done" ? "#fff" : "var(--foreground)" }} aria-hidden>
          {a.status === "done" ? "✓" : a.priority}
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-base font-semibold flex-1 min-w-0" style={{ color: "var(--foreground)", textDecoration: a.status === "dropped" ? "line-through" : undefined }}>{a.action}</span>
            {a.timing && <span className="text-sm whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>{TIMING[a.timing] ?? a.timing}</span>}
          </div>
          {a.rationale && <p className="text-base" style={{ color: "var(--muted-foreground)" }}>{a.rationale}</p>}
          <dl className="grid sm:grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="font-semibold" style={{ color: "var(--foreground)" }}>Who</dt>
            <dd style={{ color: "var(--muted-foreground)" }}>{a.role ?? "Your call"}</dd>
            {a.successMetric && (<><dt className="font-semibold" style={{ color: "var(--foreground)" }}>Measure</dt><dd style={{ color: "var(--muted-foreground)" }}>{a.successMetric}</dd></>)}
            {a.expectedSignal && (<><dt className="font-semibold" style={{ color: "var(--foreground)" }}>Signal to look for</dt><dd style={{ color: "var(--muted-foreground)" }}>{a.expectedSignal} <span className="italic">(proposed)</span></dd></>)}
            {m && (
              <>
                <dt className="font-semibold" style={{ color: "var(--foreground)" }}>{m.label}</dt>
                <dd style={{ color: "var(--muted-foreground)" }}>
                  baseline {m.baseline ?? "—"}
                  {m.latest ? (
                    <>
                      {" → now "}
                      <span className="font-semibold" style={{ color: m.direction === "better" ? "var(--green)" : m.direction === "worse" ? "var(--red)" : "var(--foreground)" }}>{m.latest}</span>
                    </>
                  ) : (
                    " · no new figure yet"
                  )}
                </dd>
              </>
            )}
          </dl>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <label className="sr-only" htmlFor={`status-${a.id}`}>Status</label>
            <select
              id={`status-${a.id}`}
              value={a.status}
              disabled={pending}
              onChange={(e) => save(e.target.value, note || null)}
              className="rounded-lg border px-3 py-2 text-sm font-medium"
              style={control}
            >
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="sr-only" htmlFor={`note-${a.id}`}>Note</label>
            <input
              id={`note-${a.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (a.note ?? "") && save(a.status, note || null)}
              placeholder="Add a note (saved when you click away)"
              className="flex-1 min-w-48 rounded-lg border px-3 py-2 text-sm"
              style={control}
            />
          </div>
          {error && <p className="text-sm" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
        </div>
      </div>
    </li>
  );
}

/** The committed plan's actions, each with a status, a note and its metric against baseline. */
export function PlanTracker({ actions, update }: { actions: Action[]; update: (id: string, status: string, note: string | null) => Promise<Result> }) {
  return <ul className="space-y-3">{actions.map((a) => <ActionRow key={a.id} a={a} update={update} />)}</ul>;
}
