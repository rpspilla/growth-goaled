"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ObjectiveField } from "@/lib/use-cases";

type SaveResult = { ok: true; value: string } | { ok: false; error: string };
type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

const inputStyle = { background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" };

/**
 * The objective form (HANDOFF §13.4): saved on blur, so answers are kept even if
 * the founder never pays. Submitting goes to Stripe Checkout for this use case.
 */
export function ObjectiveForm({
  useCaseId,
  fields,
  initial,
  save,
  checkout,
  price,
  activated,
  paymentsReady,
}: {
  useCaseId: string;
  fields: ObjectiveField[];
  initial: Record<string, string>;
  save: (useCaseId: string, fieldId: string, value: string) => Promise<SaveResult>;
  checkout: (useCaseId: string) => Promise<CheckoutResult>;
  price: string;
  activated: boolean;
  paymentsReady: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(0);

  const missing = fields.filter((f) => f.required && !values[f.id]?.trim());

  async function persist(field: ObjectiveField, value = values[field.id] ?? "") {
    if ((saved[field.id] ?? "") === value) return;
    setSaving((n) => n + 1);
    try {
      const res = await save(useCaseId, field.id, value);
      if (res.ok) {
        setSaved((s) => ({ ...s, [field.id]: res.value }));
        setValues((v) => ({ ...v, [field.id]: res.value }));
        setErrors((e) => {
          const next = { ...e };
          delete next[field.id];
          return next;
        });
        setStatus("Saved");
      } else setErrors((e) => ({ ...e, [field.id]: res.error }));
    } catch {
      setErrors((e) => ({ ...e, [field.id]: "Couldn't save. Check your connection and try again." }));
    } finally {
      setSaving((n) => n - 1);
    }
  }

  function submit() {
    setCheckoutError(null);
    start(async () => {
      for (const f of fields) await persist(f);
      const res = await checkout(useCaseId);
      if (res.ok) window.location.assign(res.url);
      else setCheckoutError(res.error);
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!activated) submit();
      }}
    >
      {fields.map((f) => {
        const id = `objective-${f.id}`;
        const common = {
          id,
          name: f.id,
          value: values[f.id] ?? "",
          placeholder: f.placeholder,
          "aria-invalid": Boolean(errors[f.id]),
          onBlur: () => void persist(f),
          className: "w-full rounded-lg border px-3 py-2 text-sm",
          style: inputStyle,
        };
        const onChange = (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.id]: e.target.value }));
        return (
          <div key={f.id}>
            <label htmlFor={id} className="block text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>
              {f.label}
              {f.required && <span style={{ color: "var(--red)" }}> *</span>}
              {f.id === "target_value" && <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded" style={{ background: "var(--blue-muted)", color: "var(--blue)" }}>your target</span>}
            </label>
            {f.kind === "textarea" ? (
              <textarea {...common} rows={3} onChange={onChange} />
            ) : f.kind === "select" ? (
              <select
                {...common}
                onChange={(e) => {
                  onChange(e);
                  void persist(f, e.target.value);
                }}
              >
                <option value="">Choose…</option>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input {...common} type={f.kind === "date" ? "date" : "text"} inputMode={f.kind === "number" || f.kind === "currency" ? "decimal" : undefined} onChange={onChange} />
            )}
            {f.help && <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{f.help}</p>}
            {errors[f.id] && <p className="text-xs mt-1" role="alert" style={{ color: "var(--red)" }}>{errors[f.id]}</p>}
          </div>
        );
      })}

      <div className="text-xs h-4" aria-live="polite" style={{ color: "var(--muted-foreground)" }}>
        {saving > 0 ? "Saving…" : status === "Saved" ? "Your answers are saved. You can come back and edit them any time." : ""}
      </div>

      {activated ? (
        <Link href="/data" className="inline-block px-5 py-2.5 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
          Active · go to Data →
        </Link>
      ) : (
        <div className="space-y-2">
          <button
            type="submit"
            disabled={pending || missing.length > 0 || !paymentsReady}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            {pending ? "Opening checkout…" : `Continue to payment · ${price}`}
          </button>
          {missing.length > 0 && (
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Still needed: {missing.map((f) => f.label.replace(/\?.*$/, "?")).join(" · ")}</p>
          )}
          {!paymentsReady && <p className="text-xs" style={{ color: "var(--amber)" }}>Payments aren&apos;t set up in this environment yet. Your advisor can activate this use case for you.</p>}
          {checkoutError && <p className="text-xs" role="alert" style={{ color: "var(--red)" }}>{checkoutError}</p>}
        </div>
      )}
    </form>
  );
}
