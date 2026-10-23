"use client";

import { useState, useTransition } from "react";

type Status = "proposed" | "approved" | "retired";

export function MetricActions({
  id,
  status,
  readOnly,
  change,
  discard,
}: {
  id: string;
  status: Status;
  readOnly: boolean;
  change: (id: string, s: Status) => Promise<{ ok: true } | { ok: false; error: string }>;
  discard: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (readOnly) return <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Sample</span>;
  const go = (s: Status) =>
    startTransition(async () => {
      setError(null);
      const r = await change(id, s);
      if (!r.ok) setError(r.error);
    });
  const btn = "text-xs px-2.5 py-1 rounded-md font-medium disabled:opacity-60";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {status === "proposed" && (
          <>
            <button disabled={pending} onClick={() => go("approved")} className={btn} style={{ background: "var(--green)", color: "#fff" }}>Approve</button>
            <button disabled={pending} onClick={() => startTransition(() => discard(id))} className={`${btn} border`} style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Discard</button>
          </>
        )}
        {status === "approved" && <button disabled={pending} onClick={() => go("retired")} className={`${btn} border`} style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Retire</button>}
        {status === "retired" && <button disabled={pending} onClick={() => go("proposed")} className={`${btn} border`} style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Back to proposed</button>}
      </div>
      {error && <span className="text-xs max-w-56 text-right" style={{ color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
