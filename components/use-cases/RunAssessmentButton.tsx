"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestAssessment } from "@/app/(founder)/data/actions";

/** Runs the assessment again (after new data, or after a failed run). */
export function RunAssessmentButton({ label, primary = false }: { label: string; primary?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await requestAssessment();
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
        className="px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50"
        style={primary ? { background: "var(--green)", color: "#fff" } : { background: "var(--muted)", color: "var(--foreground)" }}
      >
        {pending ? "Starting…" : label}
      </button>
      {error && <span className="text-xs" role="alert" style={{ color: "var(--red)" }}>{error}</span>}
    </span>
  );
}
