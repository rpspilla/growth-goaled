"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Progress = { status: "running" | "done" | "failed"; done: number; total: number };

/**
 * Drives a running evaluation from the page: one scenario per server call, refreshing as each is
 * scored. The server claims each scenario before answering it, so a second open page (or React's
 * double effect in development) never answers one twice.
 */
export function EvalRunner({ runId, initial, advance }: { runId: string; initial: Progress; advance: (runId: string) => Promise<Progress> }) {
  const [p, setP] = useState(initial);
  const router = useRouter();
  const running = initial.status === "running";
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    (async () => {
      let failures = 0;
      while (!cancelled) {
        try {
          const next = await advance(runId);
          if (cancelled) return;
          failures = 0;
          setP(next);
          router.refresh();
          if (next.status !== "running") return;
        } catch {
          // A dropped request: wait and try again (the server keeps the run's state).
          if (++failures > 3 || cancelled) return;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, running, advance, router]);
  if (p.status !== "running") return null;
  return (
    <p role="status" className="text-sm" style={{ color: "var(--muted-foreground)" }}>
      Running: {Math.min(p.done, p.total)} of {p.total} scenarios answered and scored. Keep this page open; each takes about a minute.
    </p>
  );
}
