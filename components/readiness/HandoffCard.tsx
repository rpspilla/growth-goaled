"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { sendForBenchmark } from "@/app/(founder)/readiness/actions";

/** The path from data collection to the Benchmark and Baseline. */
export function HandoffCard({ ready, blockers, alreadyMoved }: { ready: boolean; blockers: string[]; alreadyMoved: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: ready ? "var(--green)" : "var(--border)" }}>
      <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>Next: Benchmark and Baseline</div>
      {alreadyMoved ? (
        <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>
          Your advisor is working from this data. You can keep adding files and details at any time.
        </p>
      ) : ready ? (
        <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>
          The inputs the benchmark needs have been supplied. Your advisor will still check them before anything is published to you.
        </p>
      ) : (
        <>
          <p className="text-sm mb-2" style={{ color: "var(--muted-foreground)" }}>Before the benchmark can run:</p>
          <ul className="text-sm list-disc pl-5 mb-3" style={{ color: "var(--foreground)" }}>
            {blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </>
      )}
      {error && <p className="text-xs mb-2" style={{ color: "var(--red)" }}>{error}</p>}
      <div className="flex gap-3 flex-wrap">
        {!alreadyMoved && (
          <button
            type="button"
            disabled={!ready || pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await sendForBenchmark();
                if (!r.ok) setError(r.error);
              })
            }
            className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-50"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            {pending ? "Sending..." : "Send to my advisor for the benchmark"}
          </button>
        )}
        <Link href="/benchmark" className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
          Benchmark →
        </Link>
        <Link href="/baseline" className="text-xs px-3 py-1.5 rounded-md font-medium" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
          Baseline →
        </Link>
      </div>
    </div>
  );
}
