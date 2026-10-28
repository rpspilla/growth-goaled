"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ObjectiveField } from "@/lib/use-cases";

type SaveResult = { ok: true; value: string } | { ok: false; error: string };


const GROUPS: { id: NonNullable<ObjectiveField["group"]>; title: string; caption?: string }[] = [
  { id: "challenge", title: "About this question" },
  { id: "company", title: "About your company", caption: "Pick the closest range; exact figures aren't needed. Skip any you don't know." },
];

/**
 * The free questionnaire (step 3): saved on blur, so answers are kept whether or not
 * the founder buys. Submitting opens the free Growth Snapshot.
 */
export function QuestionnaireForm({
  useCaseId,
  fields,
  initial,
  save,
  submit,
  snapshotHref,
}: {
  useCaseId: string;
  fields: ObjectiveField[];
  initial: Record<string, string>;
  save: (useCaseId: string, fieldId: string, value: string) => Promise<SaveResult>;
  submit: (useCaseId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  snapshotHref: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(0);

  const missing = fields.filter((f) => f.required && !values[f.id]?.trim());

  async function persist(field: ObjectiveField, value = values[field.id] ?? ""): Promise<boolean> {
    if ((saved[field.id] ?? "") === value) return !errors[field.id];
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
        return true;
      }
      setErrors((e) => ({ ...e, [field.id]: res.error }));
    } catch {
      setErrors((e) => ({ ...e, [field.id]: "Couldn't save. Check your connection and try again." }));
    } finally {
      setSaving((n) => n - 1);
    }
    return false;
  }

  function onSubmit() {
    setSubmitError(null);
    start(async () => {
      for (const f of fields) if (!(await persist(f))) return setSubmitError("Please fix the highlighted answers.");
      const res = await submit(useCaseId);
      if (res.ok) router.push(snapshotHref);
      else setSubmitError(res.error);
    });
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      {GROUPS.map((g) => {
        const groupFields = fields.filter((f) => (f.group ?? "challenge") === g.id);
        if (!groupFields.length) return null;
        return (
          <fieldset key={g.id} className="space-y-4">
            <legend className="text-lg font-semibold mb-1" style={{ color: "var(--foreground)" }}>{g.title}</legend>
            {g.caption && <p className="text-sm -mt-2" style={{ color: "var(--muted-foreground)" }}>{g.caption}</p>}
            {groupFields.map((f) => {
              const id = `q-${f.id.replace(/\./g, "-")}`;
              const common = {
                id,
                name: f.id,
                value: values[f.id] ?? "",
                placeholder: f.placeholder,
                required: f.required,
                "aria-invalid": Boolean(errors[f.id]),
                "aria-describedby": errors[f.id] ? `${id}-error` : f.help ? `${id}-help` : undefined,
                onBlur: () => void persist(f),
                className: "field",
              };
              const onChange = (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.id]: e.target.value }));
              return (
                <div key={f.id}>
                  <label htmlFor={id} className="block text-base font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
                    {f.label}
                    {f.required && <span style={{ color: "var(--red)" }}> *</span>}
                    {f.id === "target_value" && (
                      <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded" style={{ background: "var(--blue-muted)", color: "var(--blue)" }}>your target</span>
                    )}
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
                  {f.help && <p id={`${id}-help`} className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{f.help}</p>}
                  {errors[f.id] && <p id={`${id}-error`} className="text-sm mt-1" role="alert" style={{ color: "var(--red)" }}>{errors[f.id]}</p>}
                </div>
              );
            })}
          </fieldset>
        );
      })}

      <div className="text-sm h-5" aria-live="polite" style={{ color: "var(--muted-foreground)" }}>
        {saving > 0 ? "Saving…" : status === "Saved" ? "Your answers are saved. You can come back and edit them any time." : ""}
      </div>

      <div className="space-y-2">
        <button
          type="submit"
          disabled={pending || missing.length > 0}
          className="btn btn-primary btn-lg"
        >
          {pending ? "Preparing your Snapshot…" : "See my free Snapshot"}
        </button>
        {missing.length > 0 && (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Still needed: {missing.map((f) => f.label.replace(/\?.*$/, "?")).join(" · ")}</p>
        )}
        {submitError && <p className="text-sm" role="alert" style={{ color: "var(--red)" }}>{submitError}</p>}
      </div>
    </form>
  );
}
