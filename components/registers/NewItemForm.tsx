"use client";

import { useActionState, useEffect, useRef } from "react";
import { REGISTER_TYPES } from "@/lib/registers";
import type { CreateState } from "@/app/advisor/registers/actions";

const input = "text-sm rounded-md border px-2.5 py-1.5 w-full";
const inputStyle = { background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" };

export function NewItemForm({
  companies,
  action,
}: {
  companies: { id: string; name: string }[];
  action: (prev: CreateState, formData: FormData) => Promise<CreateState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className="rounded-xl border p-5 space-y-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Add an item</div>
      <select name="companyId" required className={input} style={inputStyle} aria-label="Company">
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <select name="type" className={input} style={inputStyle} aria-label="Type" defaultValue="question">
          {REGISTER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.badge}</option>)}
        </select>
        <select name="owner" className={input} style={inputStyle} aria-label="Owner" defaultValue="founder">
          <option value="founder">Ask the founder</option>
          <option value="advisor">Advisor only</option>
        </select>
      </div>
      <input name="title" required minLength={3} maxLength={200} placeholder="Title" className={input} style={inputStyle} />
      <textarea name="description" maxLength={2000} rows={3} placeholder="What you need and why" className={input} style={inputStyle} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60" style={{ background: "var(--green)", color: "#fff" }}>
          {pending ? "Adding..." : "Add"}
        </button>
        {state?.ok && <span className="text-xs" style={{ color: "var(--green)" }}>Added</span>}
        {state && !state.ok && <span className="text-xs" style={{ color: "var(--red)" }}>{state.error}</span>}
      </div>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Founder items appear on the founder&apos;s Questions page right away.</p>
    </form>
  );
}
