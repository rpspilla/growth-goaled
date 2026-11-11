"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { DataRequestState } from "@/app/advisor/companies/[id]/actions";

function Send() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Sending…" : "Send request"}</button>;
}

/** Ask the founder for an update: tick what's needed, add a note; they get an email that opens the upload page. */
export function DataRequestForm({ items, send }: { items: readonly string[]; send: (prev: DataRequestState, formData: FormData) => Promise<DataRequestState> }) {
  const [state, action] = useActionState(send, {});
  return (
    <form action={action} className="space-y-3" aria-label="Request data">
      <fieldset className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <legend className="text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>What do you need?</legend>
        {items.map((i) => (
          <label key={i} className="flex gap-2 items-start text-sm" style={{ color: "var(--foreground)" }}>
            <input type="checkbox" name="items" value={i} className="mt-1" /> {i}
          </label>
        ))}
      </fieldset>
      <input name="other" className="field w-full" placeholder="Something else (optional)" aria-label="Something else" maxLength={200} />
      <textarea name="message" className="field w-full" rows={2} placeholder="A note for the founder (optional)" aria-label="Note for the founder" maxLength={2000} />
      <div className="flex items-center gap-3 flex-wrap">
        <Send />
        {state.error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{state.error}</span>}
        {state.note && <span role="status" className="text-sm" style={{ color: state.ok ? "var(--green)" : "var(--muted-foreground)" }}>{state.note}</span>}
      </div>
    </form>
  );
}
