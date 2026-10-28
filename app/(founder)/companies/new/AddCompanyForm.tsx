"use client";

import { useActionState } from "react";
import { REVENUE_BANDS } from "@/lib/onboarding";
import { addCompany, type AddCompanyState } from "../actions";

/** Name, revenue band and (optional) website: the same as onboarding asks for a first company. */
export function AddCompanyForm() {
  const [state, action, pending] = useActionState<AddCompanyState, FormData>(addCompany, {});
  const e = state.errors ?? {};
  const invalid = (k: string) => (e[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});
  const err = (k: string) => e[k] && <p id={`${k}-error`} className="text-sm mt-1.5" style={{ color: "var(--red)" }}>{e[k]}</p>;
  return (
    <form action={action} className="space-y-5" noValidate>
      <div>
        <label htmlFor="companyName" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>Company name</label>
        <input id="companyName" name="companyName" autoComplete="organization" required className="field" {...invalid("companyName")} />
        {err("companyName")}
      </div>
      <div>
        <label htmlFor="revenueBand" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>Annual revenue</label>
        <select id="revenueBand" name="revenueBand" defaultValue="" required className="field" {...invalid("revenueBand")}>
          <option value="" disabled>Choose a range</option>
          {REVENUE_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        {err("revenueBand")}
      </div>
      <div>
        <label htmlFor="website" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
          Website <span className="font-normal" style={{ color: "var(--muted-foreground)" }}>· optional</span>
        </label>
        <input id="website" name="website" placeholder="acme.com" autoComplete="url" className="field" {...invalid("website")} />
        {err("website")}
      </div>
      {e.form && <p className="text-sm" role="alert" style={{ color: "var(--red)" }}>{e.form}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg">
        {pending ? "Creating…" : "Create company and pick a question"}
      </button>
    </form>
  );
}
