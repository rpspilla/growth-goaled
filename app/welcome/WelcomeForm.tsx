"use client";

import { useActionState } from "react";
import { CompanyBasicsFields } from "@/components/onboarding/CompanyBasicsFields";
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
export function WelcomeForm({ isFounder, askCompany, defaultName, known = {} }: { isFounder: boolean; askCompany: boolean; defaultName: string; known?: Record<string, string> }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const e = state.errors ?? {};
  const invalid = (k: string) => (e[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});

  return (
    <form action={action} className="space-y-5" noValidate>
      <Field id="name" label="Your name" error={e.name}>
        <input id="name" name="name" defaultValue={state.values?.name ?? defaultName} autoComplete="name" required className="field" {...invalid("name")} />
      </Field>
      <Field id="title" label={isFounder ? "Your role" : "Your title"} hint={isFounder && !askCompany ? "optional" : undefined} error={e.title}>
        <input id="title" name="title" defaultValue={state.values?.title ?? known.role} placeholder={isFounder ? "CEO & Co-founder" : "Lead Advisor"} autoComplete="organization-title" required={!isFounder || askCompany} className="field" {...invalid("title")} />
      </Field>
      {askCompany && <CompanyBasicsFields key={JSON.stringify(state.values ?? {})} errors={e} values={state.values ?? known} />}
      {askCompany && (
        <Field id="challenge" label="What's the main growth challenge on your mind?" hint="optional" error={e.challenge}>
          <textarea id="challenge" name="challenge" rows={3} defaultValue={state.values?.challenge ?? known.challenge} placeholder="e.g. Should I hire my first VP of Sales?" className="field" {...invalid("challenge")} />
        </Field>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? "Saving…" : isFounder ? "Continue" : "Continue to Portfolio"}
      </button>
    </form>
  );
}
