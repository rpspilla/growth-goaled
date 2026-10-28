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
        className={`btn ${primary ? "btn-primary btn-lg" : "btn-secondary"}`}
      >
        {pending ? "Starting your report…" : label}
      </button>
      {error && <span className="text-sm" role="alert" style={{ color: "var(--red)" }}>{error}</span>}
    </span>
  );
}
