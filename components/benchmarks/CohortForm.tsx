"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import type { FormState } from "@/app/advisor/benchmarks/actions";
import type { CohortCriteria } from "@/lib/db/schema";
import { card, inputClass, inputStyle, primary } from "./ui";

type Cohort = { id: string; name: string; description: string | null; criteria: CohortCriteria; companyCount: number | null };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1" style={{ color: "var(--foreground)" }}>{label}</span>
      {children}
    </label>
  );
}

/** Create a cohort, or edit one when `cohort` is given. */
export function CohortForm({ cohort, action }: { cohort?: Cohort; action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && !cohort && state.id) router.push(`/advisor/benchmarks?cohort=${state.id}`);
  }, [state, cohort, router]);
  const c = cohort?.criteria ?? {};

  return (
    <form action={formAction} className="rounded-xl border p-5 space-y-3" style={card}>
      <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{cohort ? "Cohort criteria" : "New cohort"}</div>
      {cohort && <input type="hidden" name="id" value={cohort.id} />}
      <Field label="Name">
        <input name="name" required minLength={3} maxLength={120} defaultValue={cohort?.name} className={inputClass} style={inputStyle} placeholder="Series A B2B SaaS, sales-led" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stages (comma separated)">
          <input name="stage" defaultValue={c.stage?.join(", ")} className={inputClass} style={inputStyle} placeholder="Seed, Series A" />
        </Field>
        <Field label="Companies in cohort">
          <input name="companyCount" inputMode="numeric" defaultValue={cohort?.companyCount ?? ""} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="ARR min">
          <input name="arr_min" defaultValue={c.arr_min ?? ""} className={inputClass} style={inputStyle} placeholder="2M" />
        </Field>
        <Field label="ARR max">
          <input name="arr_max" defaultValue={c.arr_max ?? ""} className={inputClass} style={inputStyle} placeholder="10M" />
        </Field>
        <Field label="Business model">
          <input name="model" defaultValue={c.model} className={inputClass} style={inputStyle} placeholder="B2B SaaS" />
        </Field>
        <Field label="GTM motion">
          <input name="gtm_motion" defaultValue={c.gtm_motion} className={inputClass} style={inputStyle} placeholder="Founder-led" />
        </Field>
      </div>
      <Field label="Description">
        <textarea name="description" rows={2} maxLength={1000} defaultValue={cohort?.description ?? ""} className={inputClass} style={inputStyle} />
      </Field>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60" style={primary}>
          {pending ? "Saving..." : cohort ? "Save criteria" : "Create cohort"}
        </button>
        {state?.ok && cohort && <span className="text-xs" style={{ color: "var(--green)" }}>Saved</span>}
        {state && !state.ok && <span className="text-xs" style={{ color: "var(--red)" }}>{state.error}</span>}
      </div>
    </form>
  );
}
