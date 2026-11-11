"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import type { FormState } from "@/app/advisor/crm/actions";
import { CATEGORIES, CATEGORY_NAMES, NEXT_ACTIONS, SOURCES } from "@/lib/crm";

function Save() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Adding…" : "Add contact"}</button>;
}

/** "+ Add Contact": a short form (name, email, company, type) that takes seconds; the rest lives on the profile. */
export function QuickAdd({ add, companies, stages, defaultCompany = "" }: { add: (prev: FormState, fd: FormData) => Promise<FormState>; companies: { id: string; name: string }[]; stages: { id: string; name: string }[]; defaultCompany?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(add, {});
  const [category, setCategory] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      form.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button type="button" className="btn btn-primary inline-flex items-center gap-1.5" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden /> Add Contact
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" style={{ background: "rgba(13,27,42,0.45)" }} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form ref={form} action={action} onReset={() => setCategory("")} role="dialog" aria-label="Add a contact" className="w-full max-w-lg rounded-2xl p-5 space-y-3" style={{ background: "var(--card)" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Add a contact</h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">First name<input name="firstName" required autoFocus maxLength={100} className="field w-full mt-1" /></label>
              <label className="text-sm">Last name<input name="lastName" maxLength={100} className="field w-full mt-1" /></label>
              <label className="text-sm col-span-2">Email<input name="email" type="email" maxLength={200} className="field w-full mt-1" /></label>
              <label className="text-sm">Company<input name="companyName" list="crm-companies" defaultValue={defaultCompany} maxLength={200} className="field w-full mt-1" placeholder="Existing or new" /></label>
              <label className="text-sm">Job title<input name="jobTitle" maxLength={160} className="field w-full mt-1" /></label>
              <label className="text-sm">Type
                <select name="category" className="field w-full mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">—</option>
                  {CATEGORY_NAMES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="text-sm">Subtype
                <select name="subcategory" className="field w-full mt-1" disabled={!category}>
                  <option value="">—</option>
                  {category && CATEGORIES[category as keyof typeof CATEGORIES].map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-sm">Source
                <select name="source" className="field w-full mt-1" defaultValue="">
                  <option value="">—</option>
                  {SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-sm">Column
                <select name="stageId" className="field w-full mt-1" defaultValue={stages[0]?.id}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
              <label className="text-sm">Next action
                <input name="nextAction" list="crm-next-actions" maxLength={200} className="field w-full mt-1" placeholder="Optional" />
              </label>
              <label className="text-sm">Due<input name="nextDue" type="date" className="field w-full mt-1" /></label>
            </div>
            <datalist id="crm-companies">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <datalist id="crm-next-actions">{NEXT_ACTIONS.map((a) => <option key={a} value={a} />)}</datalist>
            <div className="flex items-center gap-3 flex-wrap">
              <Save />
              {state.error && (
                <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>
                  {state.error} {state.duplicateId && <Link href={`/advisor/crm/contacts/${state.duplicateId}`} className="link">Open them</Link>}
                </span>
              )}
              {state.ok && state.id && (
                <span role="status" className="text-sm" style={{ color: "var(--green)" }}>
                  Added. <Link href={`/advisor/crm/contacts/${state.id}`} className="link">Open profile</Link> or add another.
                </span>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
