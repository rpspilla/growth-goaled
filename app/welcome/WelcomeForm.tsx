"use client";

import { useActionState } from "react";
import { REVENUE_BANDS } from "@/lib/onboarding";
import { completeOnboarding, type OnboardingState } from "./actions";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
        {label}
        {hint && <span className="font-normal" style={{ color: "var(--muted-foreground)" }}> · {hint}</span>}
      </label>
      {children}
      {error && <p id={`${id}-error`} className="text-sm mt-1.5" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}

/** Only what's needed now. Values are kept if a field fails validation. */
export function WelcomeForm({ isFounder, askCompany, defaultName }: { isFounder: boolean; askCompany: boolean; defaultName: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const e = state.errors ?? {};
  const invalid = (k: string) => (e[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});

  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id="name" label="Your name" error={e.name}>
        <input id="name" name="name" defaultValue={defaultName} autoComplete="name" required className="field" {...invalid("name")} />
      </Field>
      {askCompany && (
        <>
          <Field id="companyName" label="Company name" error={e.companyName}>
            <input id="companyName" name="companyName" autoComplete="organization" required className="field" {...invalid("companyName")} />
          </Field>
          <Field id="revenueBand" label="Annual revenue" error={e.revenueBand}>
            <select id="revenueBand" name="revenueBand" defaultValue="" required className="field" {...invalid("revenueBand")}>
              <option value="" disabled>Choose a range</option>
              {REVENUE_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </Field>
          <Field id="website" label="Website" hint="optional" error={e.website}>
            <input id="website" name="website" placeholder="acme.com" autoComplete="url" className="field" {...invalid("website")} />
          </Field>
        </>
      )}
      <Field id="title" label="Your title" hint={isFounder ? "optional" : undefined} error={e.title}>
        <input id="title" name="title" placeholder={isFounder ? "CEO & Co-founder" : "Lead Advisor"} autoComplete="organization-title" required={!isFounder} className="field" {...invalid("title")} />
      </Field>
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? "Saving…" : askCompany ? "Continue to growth questions" : isFounder ? "Continue" : "Continue to Portfolio"}
      </button>
    </form>
  );
}
