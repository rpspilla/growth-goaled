"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { card, primary } from "./ui";

export type RunView = { status: "running" | "succeeded" | "failed"; createdAt: string; error: string | null; proposed: number | null; rejected: string[]; notFound: string[] } | null;

export function ResearchPanel({ cohortId, run, research }: { cohortId: string; run: RunView; research: (id: string) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const running = run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);

  return (
    <div className="rounded-xl border p-5 space-y-3" style={card}>
      <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Research public benchmarks</div>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        Claude searches the web for published SaaS benchmarks matching these criteria. Results arrive as proposed rows with their source.
        Only figures from pages the search returned are kept. Nothing is used until you approve it.
      </p>
      <button
        disabled={pending || running}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await research(cohortId);
            if (!r.ok) setError(r.error);
          })
        }
        className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60"
        style={primary}
      >
        {running ? "Researching... (takes a few minutes)" : pending ? "Starting..." : "Research public benchmarks"}
      </button>
      {error && <p className="text-xs" style={{ color: "var(--red)" }}>{error}</p>}
      {run && !running && (
        <div className="text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
          <div>
            Last run {new Date(run.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}:{" "}
            {run.status === "failed" ? <span style={{ color: "var(--red)" }}>failed: {run.error}</span> : <span style={{ color: "var(--green)" }}>{run.proposed ?? 0} rows proposed</span>}
          </div>
          {run.notFound.length > 0 && <div>Not found: {run.notFound.join(", ")}</div>}
          {run.rejected.length > 0 && (
            <details>
              <summary className="cursor-pointer">{run.rejected.length} result{run.rejected.length === 1 ? "" : "s"} dropped by checks</summary>
              <ul className="list-disc pl-4 mt-1">{run.rejected.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
