"use client";

import { useState, useTransition } from "react";
import { removeFile } from "@/app/(founder)/readiness/actions";

/** "Remove" with an inline confirm, for files uploaded by mistake. */
export function RemoveFileButton({ documentId, filename, compact = false }: { documentId: string; filename: string; compact?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`${compact ? "text-xs" : "text-xs px-3 py-1.5 rounded-md border"} font-medium shrink-0`}
        style={compact ? { color: "var(--red)" } : { borderColor: "var(--border)", color: "var(--red)" }}
        aria-label={`Remove ${filename}`}
      >
        {compact ? "Remove" : "✕ Remove"}
      </button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1 shrink-0" role="alertdialog" aria-label={`Remove ${filename}?`}>
      <span className="text-xs text-right max-w-64" style={{ color: "var(--foreground)" }}>
        Remove this file? Values read from it are removed too.
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await removeFile(documentId);
              if (!r.ok) setError(r.error);
            })
          }
          className="text-xs px-3 py-1 rounded-md font-semibold disabled:opacity-60"
          style={{ background: "var(--red)", color: "#fff" }}
        >
          {pending ? "Removing..." : "Remove"}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="text-xs px-2 py-1" style={{ color: "var(--muted-foreground)" }}>
          Cancel
        </button>
      </div>
      {error && <span className="text-xs" style={{ color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
