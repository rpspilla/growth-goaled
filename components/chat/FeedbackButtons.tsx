"use client";

import { useState, useTransition } from "react";

const QUALITY = [
  { kind: "helpful", label: "Helpful" },
  { kind: "incomplete", label: "Incomplete" },
  { kind: "incorrect", label: "Incorrect" },
  { kind: "not_relevant", label: "Not relevant" },
  { kind: "disagree", label: "I disagree" },
] as const;
const ACTED = [
  { kind: "implemented", label: "Did it" },
  { kind: "partially_implemented", label: "Partly" },
  { kind: "different_approach", label: "Went another way" },
  { kind: "not_implemented", label: "Not yet" },
] as const;

/** "Was this useful?" now, and "did you act on it?" whenever they come back: both kept against the recommendation. */
export function FeedbackButtons({
  recommendationId,
  given,
  send,
}: {
  recommendationId: string;
  given: string[];
  send: (recommendationId: string, kind: string, note: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [done, setDone] = useState<string[]>(given);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const click = (kind: string) =>
    start(async () => {
      setError(null);
      const r = await send(recommendationId, kind, null);
      if (r.ok) setDone((d) => [...d, kind]);
      else setError(r.error ?? "Couldn't save that.");
    });
  const row = (title: string, opts: readonly { kind: string; label: string }[]) => (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={title}>
      <span className="text-sm mr-1" style={{ color: "var(--muted-foreground)" }}>{title}</span>
      {opts.map((o) => {
        const on = done.includes(o.kind);
        return (
          <button
            key={o.kind}
            type="button"
            disabled={pending}
            aria-pressed={on}
            onClick={() => click(o.kind)}
            className="text-sm rounded-full px-3 py-1 disabled:opacity-60"
            style={{ border: "1px solid var(--border)", background: on ? "var(--green-muted)" : "transparent", color: "var(--foreground)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="space-y-2">
      {row("Was this useful?", QUALITY)}
      {row("Did you act on it?", ACTED)}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
