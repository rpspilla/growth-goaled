"use client";

import { useActionState } from "react";
import { REVENUE_BANDS } from "@/lib/onboarding";
import { completeOnboarding, type OnboardingState } from "./actions";

const inputClass = "w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2";
const inputStyle = { background: "var(--muted)", borderColor: "var(--border)", color: "var(--foreground)" };

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </label>
      {children}
      {error && <div className="text-xs mt-1" style={{ color: "var(--red)" }}>{error}</div>}
    </div>
  );
}

export function WelcomeForm({ isFounder, defaultName }: { isFounder: boolean; defaultName: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const e = state.errors ?? {};

  return (
    <form action={action} className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
        About you
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="name" label="Your name" error={e.name}>
          <input id="name" name="name" defaultValue={defaultName} autoComplete="name" required className={inputClass} style={inputStyle} />
        </Field>
        <Field id="title" label="Your title" error={e.title}>
          <input
            id="title"
            name="title"
            placeholder={isFounder ? "CEO & Co-founder" : "Lead Advisor"}
            autoComplete="organization-title"
            required
            className={inputClass}
            style={inputStyle}
          />
        </Field>
      </div>

      {isFounder && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: "var(--muted-foreground)" }}>
            Your company
          </div>
          <Field id="companyName" label="Company name" error={e.companyName}>
            <input id="companyName" name="companyName" autoComplete="organization" required className={inputClass} style={inputStyle} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="website" label="Website" error={e.website}>
              <input id="website" name="website" placeholder="acme.com" autoComplete="url" className={inputClass} style={inputStyle} />
            </Field>
            <Field id="revenueBand" label="Annual revenue" error={e.revenueBand}>
              <select id="revenueBand" name="revenueBand" defaultValue="" required className={inputClass} style={inputStyle}>
                <option value="" disabled>Select…</option>
                {REVENUE_BANDS.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
        style={{ background: "var(--green)", color: "#fff" }}
      >
        {pending ? "Saving…" : isFounder ? "Start Your Growth Profile" : "Continue to Portfolio"}
      </button>
    </form>
  );
}
