"use client";

import { useState, useTransition } from "react";
import type { GapSummary } from "@/lib/ai/readiness-summary";
import { generateGapSummary } from "@/app/(founder)/data/actions";

/** AI rewording of the rule-based checks. Clearly labelled; never the source of truth. */
export function SummaryCard({ summary, createdAt, stale }: { summary: GapSummary | null; createdAt: string | null; stale: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Gap summary</div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Written by AI from the checks on this page only. It doesn&apos;t see your numbers and doesn&apos;t judge performance.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await generateGapSummary();
              if (!r.ok) setError(r.error);
            })
          }
          className="text-xs px-3 py-1.5 rounded-md font-semibold border shrink-0 disabled:opacity-60"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          {pending ? "Writing..." : summary ? "Refresh" : "Summarise gaps"}
        </button>
      </div>
      {error && <p className="text-xs mb-2" style={{ color: "var(--red)" }}>{error}</p>}
      {summary ? (
        <div className="text-sm space-y-3">
          {stale && <p className="text-xs" style={{ color: "var(--amber)" }}>Your data has changed since this was written. Refresh for an up-to-date summary.</p>}
          <p style={{ color: "var(--foreground)" }}>{summary.headline}</p>
          {summary.priorities.length > 0 && (
            <ol className="list-decimal pl-5 space-y-2">
              {summary.priorities.map((p, i) => (
                <li key={i}>
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>{p.title}.</span>{" "}
                  <span style={{ color: "var(--muted-foreground)" }}>{p.request} {p.why}</span>
                </li>
              ))}
            </ol>
          )}
          {createdAt && (
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Generated {new Date(createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>
      ) : (
        !error && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>No summary yet. The checks below are always current.</p>
      )}
    </div>
  );
}
