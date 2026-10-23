"use client";

import { useState, useTransition } from "react";

export function AiCheck({ test }: { test: () => Promise<{ ok: true; model: string } | { ok: false; error: string }> }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: true; model: string } | { ok: false; error: string } | null>(null);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await test()))}
        className="text-xs px-3 py-1.5 rounded-md font-semibold border disabled:opacity-60"
        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        {pending ? "Checking..." : "Check AI connection"}
      </button>
      {result && (
        <span className="text-xs" role="status" style={{ color: result.ok ? "var(--green)" : "var(--red)" }}>
          {result.ok ? `Connected · ${result.model}` : result.error}
        </span>
      )}
    </div>
  );
}
