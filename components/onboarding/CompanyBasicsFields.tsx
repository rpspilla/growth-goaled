"use client";

import { useState } from "react";
import { FUNDING_STAGES, FOUNDING_YEARS, VERTICALS } from "@/lib/intake";
import { REVENUE_BANDS } from "@/lib/onboarding";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
        {label}
        {hint && <span className="font-normal" style={{ color: "var(--muted-foreground)" }}> · {hint}</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm mt-1.5" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The company basics: name and vertical, then stage, revenue, founding year and team behind an
 * optional disclosure (Nov 25, 2026). Used by first sign-up and "Add a company". `values` refills
 * the fields after a failed submit (React resets the form after every action).
 */
export function CompanyBasicsFields({ errors, values = {} }: { errors: Record<string, string>; values?: Record<string, string> }) {
  const [vertical, setVertical] = useState(values.vertical ?? "");
  const invalid = (k: string) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});
  const headcount = (id: string, label: string) => (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold mb-1" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </label>
      <input id={id} name={id} defaultValue={values[id]} inputMode="numeric" className="field" {...(errors[id] ? { "aria-invalid": true, "aria-describedby": "team-error" } : {})} />
    </div>
  );
  const teamError = errors.aes ?? errors.bdrs ?? errors.cs;
  const hasOptional = ["revenueBand", "foundedYear", "stage", "aes", "bdrs", "cs"].some((k) => values[k] || errors[k]);

  return (
    <>
      <Field id="companyName" label="Company name" error={errors.companyName}>
        <input id="companyName" name="companyName" defaultValue={values.companyName} autoComplete="organization" required className="field" {...invalid("companyName")} />
      </Field>
      <Field id="vertical" label="Vertical" error={errors.vertical}>
        <select id="vertical" name="vertical" defaultValue={values.vertical ?? ""} onChange={(e) => setVertical(e.target.value)} required className="field" {...invalid("vertical")}>
          <option value="" disabled>
            Your company&apos;s main market
          </option>
          {VERTICALS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      {vertical === "Other" && (
        <Field id="verticalOther" label="Your vertical" error={errors.verticalOther}>
          <input id="verticalOther" name="verticalOther" defaultValue={values.verticalOther} placeholder="e.g. Insurance" className="field" {...invalid("verticalOther")} />
        </Field>
      )}
      <details className="group/more rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }} open={hasOptional}>
        <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          <span>Stage, revenue and team <span className="font-normal" style={{ color: "var(--muted-foreground)" }}>· optional, Rally asks when it matters</span></span>
          <span aria-hidden className="transition-transform group-open/more:rotate-90" style={{ color: "var(--muted-foreground)" }}>›</span>
        </summary>
        <div className="space-y-5 pt-4">
      <Field id="revenueBand" label="Annual revenue (ARR)" error={errors.revenueBand}>
        <select id="revenueBand" name="revenueBand" defaultValue={values.revenueBand ?? ""} className="field" {...invalid("revenueBand")}>
          <option value="">Not now</option>
          {REVENUE_BANDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="foundedYear" label="Founding year" error={errors.foundedYear}>
          <select id="foundedYear" name="foundedYear" defaultValue={values.foundedYear ?? ""} className="field" {...invalid("foundedYear")}>
            <option value="">Not now</option>
            {FOUNDING_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field id="stage" label="Funding stage" error={errors.stage}>
          <select id="stage" name="stage" defaultValue={values.stage ?? ""} className="field" {...invalid("stage")}>
            <option value="">Not now</option>
            {FUNDING_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset aria-describedby={teamError ? "team-error" : undefined}>
        <legend className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
          Go-to-market team <span className="font-normal" style={{ color: "var(--muted-foreground)" }}>· how many people today</span>
        </legend>
        <div className="grid grid-cols-3 gap-3">
          {headcount("aes", "Account executives")}
          {headcount("bdrs", "BDRs / SDRs")}
          {headcount("cs", "Customer success")}
        </div>
        {teamError && (
          <p id="team-error" className="text-sm mt-1.5" style={{ color: "var(--red)" }}>
            {teamError}
          </p>
        )}
      </fieldset>
        </div>
      </details>
    </>
  );
}
