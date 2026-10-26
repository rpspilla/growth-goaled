"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestBaseline } from "@/app/(founder)/data/actions";

/** Baseline readiness: how many of the use case's required items are in, and the hand-off once they all are. */
export function BaselineMeter({
  done,
  total,
  ready,
  canRequest,
  inProgress,
}: {
  done: number;
  total: number;
  ready: boolean;
  /** The founder can start the build themselves (otherwise the advisor does). */
  canRequest: boolean;
  inProgress: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const percent = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-xl border p-5 mb-6" style={{ background: "var(--card)", borderColor: ready ? "var(--green)" : "var(--border)" }}>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-56">
          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Ready for analysis</div>
          <div className="text-sm mb-2" style={{ color: "var(--foreground)" }}>
            {ready ? "Ready: everything the assessment needs is in." : `${done} of ${total} required items in`}
          </div>
          <div className="h-2 rounded-full" role="meter" aria-label="Ready for analysis" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} style={{ background: "var(--muted)" }}>
            <div className="h-2 rounded-full transition-all" style={{ width: `${percent}%`, background: ready ? "var(--green)" : "var(--amber)" }} />
          </div>
        </div>
        {inProgress ? (
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Your data is being analyzed.</span>
        ) : canRequest ? (
          <button
            type="button"
            disabled={!ready || pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await requestBaseline();
                if (r.ok) router.push("/baseline");
                else setError(r.error);
              })
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            {pending ? "Starting…" : "Analyze my data"}
          </button>
        ) : ready ? (
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>An analyst will prepare your results from this.</span>
        ) : null}
      </div>
      {error && <p className="text-xs mt-2" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
