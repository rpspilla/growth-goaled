"use client";

import { useState, useTransition } from "react";

/** Copy an open link, or cancel it so it can't be paid. */
export function LinkRowActions({ id, url, title, cancel }: { id: string; url: string; title: string; cancel: (id: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <button type="button" className="btn btn-secondary text-sm" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
      <button
        type="button"
        className="text-sm link"
        aria-label={`Cancel ${title}`}
        disabled={pending}
        onClick={() => {
          if (!confirm(`Cancel "${title}"? The client won't be able to pay it.`)) return;
          start(async () => {
            const r = await cancel(id);
            if (!r.ok) setError(r.error ?? "Couldn't cancel it.");
          });
        }}
      >
        Cancel
      </button>
      {error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</span>}
    </div>
  );
}
