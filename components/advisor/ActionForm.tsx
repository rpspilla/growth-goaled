"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

type Result = { ok: true } | { ok: false; error: string };

/**
 * A form for a server action that answers { ok } or { ok: false, error }: shows the error under it,
 * "Saved" after it works, and clears its fields after a successful add (resetOnSuccess).
 */
export function ActionForm({ action, children, submit, label, resetOnSuccess = false, className = "space-y-2" }: { action: (prev: Result | null, form: FormData) => Promise<Result>; children: ReactNode; submit: string; label: string; resetOnSuccess?: boolean; className?: string }) {
  const [state, run, pending] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) form.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={form} action={run} aria-label={label} className={className}>
      {children}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" className="btn btn-primary text-sm py-1.5" disabled={pending}>
          {pending ? "Saving…" : submit}
        </button>
        {state && !state.ok && (
          <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>
            {state.error}
          </span>
        )}
        {state?.ok && !pending && (
          <span role="status" className="text-sm" style={{ color: "var(--green)" }}>
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
