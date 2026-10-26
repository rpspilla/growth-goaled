"use client";

import { useState, useTransition } from "react";

/** Advisor/admin: grant an assessment without payment (pilots), with a note saying why. */
export function ActivateForm({
  companyId,
  useCase,
  activate,
}: {
  companyId: string;
  useCase: string;
  activate: (companyId: string, useCase: string, note: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-start gap-2 flex-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await activate(companyId, useCase, note);
          if (!res.ok) setError(res.error ?? "Couldn't activate.");
        });
      }}
    >
      <input
        aria-label="Why grant without payment"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why (e.g. pilot customer)"
        className="flex-1 min-w-48 rounded-md border px-2.5 py-1.5 text-sm"
        style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
      />
      <button type="submit" disabled={pending} className="px-3 py-1.5 rounded-md text-sm font-semibold disabled:opacity-50" style={{ background: "var(--green)", color: "#fff" }}>
        {pending ? "Granting…" : "Grant without payment"}
      </button>
      {error && <p className="w-full text-xs" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </form>
  );
}
