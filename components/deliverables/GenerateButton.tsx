"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DecisionResult } from "@/lib/data/deliverables";

export function GenerateButton({ companyId, label, generate }: { companyId: string; label: string; generate: (id: string) => Promise<DecisionResult> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await generate(companyId);
            if (!r.ok) setError(r.error);
            else if (r.newId) router.push(`/advisor/review/${r.newId}`);
          })
        }
        className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60"
        style={{ background: "var(--green)", color: "#fff" }}
      >
        {pending ? "Starting..." : label}
      </button>
      {error && <span className="text-xs text-right max-w-64" style={{ color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
