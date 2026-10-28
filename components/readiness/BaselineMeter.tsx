"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestAssessment } from "@/app/(founder)/data/actions";

export type AssessmentState = "not_started" | "building" | "ready" | "failed";

/** Ready for analysis: how many required items are in, and the button that runs (or re-runs) the assessment. */
export function BaselineMeter({ done, total, ready, assessment }: { done: number; total: number; ready: boolean; assessment: AssessmentState }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const percent = total ? Math.round((done / total) * 100) : 0;
  const run = (label: string, primary: boolean) => (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          setError(null);
          const r = await requestAssessment();
          if (r.ok) router.push("/baseline");
          else setError(r.error);
        })
      }
      className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
      style={primary ? { background: "var(--green)", color: "#fff" } : { background: "var(--muted)", color: "var(--foreground)" }}
    >
      {pending ? "Starting…" : label}
    </button>
  );

  return (
    <div className="rounded-xl border p-5 mb-6" style={{ background: "var(--card)", borderColor: ready ? "var(--green)" : "var(--border)" }}>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-56">
          <div className="label mb-1" style={{ color: "var(--muted-foreground)" }}>Ready for analysis</div>
          <div className="text-sm mb-2" style={{ color: "var(--foreground)" }}>
            {ready ? "Ready: everything the assessment needs is in." : `${done} of ${total} required items in`}
          </div>
          <div className="h-2 rounded-full" role="meter" aria-label="Ready for analysis" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} style={{ background: "var(--muted)" }}>
            <div className="h-2 rounded-full transition-all" style={{ width: `${percent}%`, background: ready ? "var(--green)" : "var(--amber)" }} />
          </div>
        </div>
        {assessment === "building" ? (
          <Link href="/baseline" className="text-sm font-semibold" style={{ color: "var(--green)" }}>Analyzing your data… see progress →</Link>
        ) : assessment === "ready" ? (
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/baseline" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>View your results →</Link>
            {run("Re-run with my latest data", false)}
          </div>
        ) : (
          run(assessment === "failed" ? "Run the analysis again" : ready ? "Analyze my data" : "Analyze what I've shared", true)
        )}
      </div>
      {!ready && assessment !== "building" && (
        <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
          You can analyze now: the report is built as far as your data allows and lists what&apos;s missing. Adding the required items makes it sharper.
        </p>
      )}
      {error && <p className="text-xs mt-2" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
