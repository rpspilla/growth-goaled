"use client";

import { useState, useTransition } from "react";

type Result = { ok: true; to: string } | { ok: false; error: string };

/** For a delivered plan: send the founder the "your action plan is ready" email again, and say what happened. */
export function ResendPlanEmail({ planId, resend }: { planId: string; resend: (planId: string) => Promise<Result> }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => setResult(await resend(planId)))}>
        {pending ? "Sending…" : "Re-send the email to the founder"}
      </button>
      {result && (
        <p role={result.ok ? "status" : "alert"} className="text-sm" style={{ color: result.ok ? "var(--green)" : "var(--red)" }}>
          {result.ok ? `Sent to ${result.to}.` : result.error}
        </p>
      )}
    </div>
  );
}
