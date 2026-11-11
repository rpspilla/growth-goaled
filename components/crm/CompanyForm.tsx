"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/advisor/crm/actions";
import { COMPANY_STAGES } from "@/lib/crm";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : label}</button>;
}

export type CompanyValues = { name: string; website: string; industry: string; stage: string; estimatedArr: string; employeeCount: string; description: string; keyNotes: string };

/** A prospect company's profile. New companies open their page once saved. */
export function CompanyForm({ values, save, isNew = false }: { values: CompanyValues; save: (prev: FormState, fd: FormData) => Promise<FormState>; isNew?: boolean }) {
  const [state, action] = useActionState(save, {});
  const router = useRouter();
  useEffect(() => {
    if (isNew && state.ok && state.id) router.push(`/advisor/crm/companies/${state.id}`);
  }, [state, isNew, router]);
  const f = "field w-full mt-1";
  const lab = "text-sm";
  return (
    <form action={action} aria-label={isNew ? "New company" : "Company details"} className="grid sm:grid-cols-2 gap-3">
      <label className={lab}>Company name<input name="name" required defaultValue={values.name} maxLength={200} className={f} /></label>
      <label className={lab}>Website<input name="website" defaultValue={values.website} maxLength={300} className={f} placeholder="acme.com" /></label>
      <label className={lab}>Industry<input name="industry" defaultValue={values.industry} maxLength={120} className={f} /></label>
      <label className={lab}>Stage
        <select name="stage" defaultValue={values.stage} className={f}><option value="">—</option>{COMPANY_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
      </label>
      <label className={lab}>Estimated ARR ($)<input name="estimatedArr" inputMode="decimal" defaultValue={values.estimatedArr} className={f} /></label>
      <label className={lab}>Employees<input name="employeeCount" inputMode="numeric" defaultValue={values.employeeCount} className={f} /></label>
      <label className={`${lab} sm:col-span-2`}>Description<textarea name="description" rows={2} defaultValue={values.description} maxLength={4000} className={f} /></label>
      <label className={`${lab} sm:col-span-2`}>Key notes<textarea name="keyNotes" rows={3} defaultValue={values.keyNotes} maxLength={4000} className={f} /></label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <Save label={isNew ? "Create company" : "Save"} />
        {state.error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{state.error}</span>}
        {state.note && !isNew && <span role="status" className="text-sm" style={{ color: "var(--green)" }}>{state.note}</span>}
      </div>
    </form>
  );
}
