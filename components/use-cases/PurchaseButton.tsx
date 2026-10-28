"use client";

import { useState, useTransition } from "react";

/** Starts the assessment checkout. Disabled while the request runs, so a double click can't open two checkouts. */
export function PurchaseButton({
  useCaseId,
  label,
  checkout,
}: {
  useCaseId: string;
  label: string;
  checkout: (useCaseId: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await checkout(useCaseId);
            if (res.ok) window.location.assign(res.url);
            else setError(res.error);
          })
        }
        className="btn btn-primary btn-lg w-full"
      >
        {pending ? "Opening secure checkout…" : label}
      </button>
      {error && <p className="text-sm" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
