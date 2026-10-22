"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptState } from "./actions";

export function AcceptButton({ token, companyName }: { token: string; companyName: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptInviteAction.bind(null, token), {});
  return (
    <form action={action} className="space-y-3">
      {state.error && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--red-muted)", color: "var(--red)" }}>
          {state.error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
        style={{ background: "var(--green)", color: "#fff" }}
      >
        {pending ? "Joining…" : `Join ${companyName}`}
      </button>
    </form>
  );
}
