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
 * The six company basics asked before the free Snapshot: name, revenue, founding year, vertical,
 * funding stage and go-to-market team size. Used by first sign-up and "Add a company". `values` refills
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

  return (
    <>
      <Field id="companyName" label="Company name" error={errors.companyName}>
        <input id="companyName" name="companyName" defaultValue={values.companyName} autoComplete="organization" required className="field" {...invalid("companyName")} />
      </Field>
      <Field id="revenueBand" label="Annual revenue (ARR)" error={errors.revenueBand}>
        <select id="revenueBand" name="revenueBand" defaultValue={values.revenueBand ?? ""} required className="field" {...invalid("revenueBand")}>
          <option value="" disabled>
            Choose a range
          </option>
          {REVENUE_BANDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="foundedYear" label="Founding year" error={errors.foundedYear}>
          <select id="foundedYear" name="foundedYear" defaultValue={values.foundedYear ?? ""} required className="field" {...invalid("foundedYear")}>
            <option value="" disabled>
              Choose
            </option>
            {FOUNDING_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field id="stage" label="Funding stage" error={errors.stage}>
          <select id="stage" name="stage" defaultValue={values.stage ?? ""} required className="field" {...invalid("stage")}>
            <option value="" disabled>
              Choose
            </option>
            {FUNDING_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
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
    </>
  );
}
