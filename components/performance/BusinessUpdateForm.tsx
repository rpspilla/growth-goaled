"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { UpdateState } from "@/app/(founder)/performance/actions";

function Save() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Add update"}</button>;
}

/** Type in this month's numbers when there's no file to share. */
export function BusinessUpdateForm({ save, month }: { save: (prev: UpdateState, formData: FormData) => Promise<UpdateState>; month: string }) {
  const [state, action] = useActionState(save, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} aria-label="Add an update" className="grid sm:grid-cols-[auto_1fr_1fr_auto] gap-3 items-end">
      <label className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        Month
        <input type="month" name="period" defaultValue={month} required className="field w-full mt-1" />
      </label>
      <label className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        Monthly revenue ($)
        <input name="mrr" inputMode="decimal" placeholder="e.g. 85,000" className="field w-full mt-1" />
      </label>
      <label className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        Net revenue retention (%)
        <input name="retention" inputMode="decimal" placeholder="e.g. 104" className="field w-full mt-1" />
      </label>
      <Save />
      {state.error && <p role="alert" className="text-sm sm:col-span-4" style={{ color: "var(--red)" }}>{state.error}</p>}
      {state.ok && <p role="status" className="text-sm sm:col-span-4" style={{ color: "var(--green)" }}>Saved. It&apos;s at the top of your update history.</p>}
    </form>
  );
}
