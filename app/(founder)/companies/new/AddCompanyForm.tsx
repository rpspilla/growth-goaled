"use client";

import { useActionState } from "react";
import { CompanyBasicsFields } from "@/components/onboarding/CompanyBasicsFields";
import { addCompany, type AddCompanyState } from "../actions";

/** The same company basics onboarding asks for a first company. */
export function AddCompanyForm() {
  const [state, action, pending] = useActionState<AddCompanyState, FormData>(addCompany, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <CompanyBasicsFields key={JSON.stringify(state.values ?? {})} errors={e} values={state.values} />
      {e.form && <p className="text-sm" role="alert" style={{ color: "var(--red)" }}>{e.form}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg">
        {pending ? "Creating…" : "Create company and pick a question"}
      </button>
    </form>
  );
}
