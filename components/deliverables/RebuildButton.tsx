"use client";

import { useState, useTransition } from "react";
import { rebuildPreliminary } from "@/app/(founder)/benchmark/actions";

export function RebuildButton({ label = "Build it again with my latest data" }: { label?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await rebuildPreliminary();
            if (!r.ok) setError(r.error ?? "Couldn't start.");
          })
        }
        className="text-xs px-3 py-1.5 rounded-md font-semibold border disabled:opacity-60"
        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        {pending ? "Starting..." : label}
      </button>
      {error && <span className="text-xs ml-2" style={{ color: "var(--red)" }}>{error}</span>}
    </span>
  );
}
