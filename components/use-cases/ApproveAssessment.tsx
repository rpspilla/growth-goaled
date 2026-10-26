"use client";

import { useState, useTransition } from "react";

/** Advisor: mark the founder's assessment reviewed, with an optional note they'll see. */
export function ApproveAssessment({
  companyId,
  deliverableId,
  approve,
}: {
  companyId: string;
  deliverableId: string;
  approve: (companyId: string, deliverableId: string, comment: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-2 flex-wrap items-start"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await approve(companyId, deliverableId, comment);
          if (!r.ok) setError(r.error ?? "Couldn't save.");
        });
      }}
    >
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Note for the founder (optional)"
        aria-label="Note for the founder"
        className="flex-1 min-w-56 rounded-md border px-2.5 py-1.5 text-sm"
        style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
      />
      <button type="submit" disabled={pending} className="px-3 py-1.5 rounded-md text-sm font-semibold disabled:opacity-50" style={{ background: "var(--green)", color: "#fff" }}>
        {pending ? "Saving…" : "Mark reviewed"}
      </button>
      {error && <p className="w-full text-xs" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </form>
  );
}
