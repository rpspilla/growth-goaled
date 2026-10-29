"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import type { ObjectiveField } from "@/lib/use-cases";

type SaveResult = { ok: true; value: string } | { ok: false; error: string };

/** Ranges and short lists become big tap targets; long lists (industry, founding year) stay a dropdown. */
const SEGMENTED_MAX = 8;
const isSegmented = (f: ObjectiveField) => f.kind === "select" && (f.options?.length ?? 0) <= SEGMENTED_MAX;

/**
 * The free questionnaire, one question per step (visual-founder-flow brief §2). Every answer
 * saves as soon as it's given, so nothing is lost whether or not the founder buys; picking a
 * range moves straight on. Submitting opens the free Growth Snapshot.
 */
export function QuestionnaireForm({
  useCaseId,
  fields: initialFields,
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
  // Saving a profile answer refreshes the page, which moves that question into "From your profile".
  // Keep the list the founder started with, so the step they're on never shifts under them.
  const [fields] = useState(initialFields);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(0);
  // Start at the first unanswered question.
  const [step, setStep] = useState(() => Math.max(0, fields.findIndex((f) => !initial[f.id]?.trim())));

  const missing = fields.filter((f) => f.required && !values[f.id]?.trim());
  const answered = fields.filter((f) => values[f.id]?.trim()).length;
  const last = fields.length - 1;
  const f = fields[Math.min(step, last)];

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

  async function go(to: number) {
    if (f && !(await persist(f))) return;
    setStep(Math.max(0, Math.min(last, to)));
  }

  function onSubmit() {
    setSubmitError(null);
    start(async () => {
      for (const field of fields) if (!(await persist(field))) return setSubmitError("Please fix the highlighted answers.");
      const res = await submit(useCaseId);
      if (res.ok) router.push(snapshotHref);
      else setSubmitError(res.error);
    });
  }

  const submitBar = (
    <div className="space-y-2">
      <button type="submit" disabled={pending || missing.length > 0} className="btn btn-primary btn-lg w-full sm:w-auto">
        {pending ? "Preparing your Snapshot…" : "See my free Snapshot"}
      </button>
      {missing.length > 0 && (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Still needed: {missing.map((m) => m.label.replace(/\?.*$/, "?")).join(" · ")}
        </p>
      )}
      {submitError && (
        <p className="text-sm" role="alert" style={{ color: "var(--red)" }}>
          {submitError}
        </p>
      )}
    </div>
  );
  const formProps = {
    noValidate: true,
    onSubmit: (e: FormEvent) => {
      e.preventDefault();
      onSubmit();
    },
  };
  // Everything is already known from the profile: nothing to ask.
  if (!f) return <form {...formProps}>{submitBar}</form>;
  const id = `q-${f.id.replace(/\./g, "-")}`;
  const value = values[f.id] ?? "";
  const describedBy = errors[f.id] ? `${id}-error` : f.help ? `${id}-help` : undefined;
  const onChange = (v: string) => setValues((s) => ({ ...s, [f.id]: v }));

  return (
    <form className="space-y-6" {...formProps}>
      {/* Progress: a bar plus one dot per question (jump to any). */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
          <span>
            Question {Math.min(step, last) + 1} of {fields.length}
          </span>
          <span className="font-mono">
            {answered}/{fields.length} answered
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }} role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={fields.length} aria-valuenow={answered}>
          <div className="h-full rounded-full transition-all" style={{ width: `${(answered / fields.length) * 100}%`, background: "var(--green)" }} />
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Jump to a question">
          {fields.map((q, i) => {
            const done = Boolean(values[q.id]?.trim());
            const current = i === step;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => void go(i)}
                aria-label={`Question ${i + 1}: ${q.label}${done ? " (answered)" : ""}`}
                aria-current={current ? "step" : undefined}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border"
                style={{
                  background: done ? "var(--green)" : current ? "var(--card)" : "var(--muted)",
                  color: done ? "#fff" : "var(--foreground)",
                  borderColor: current ? "var(--green)" : "transparent",
                  boxShadow: current ? "0 0 0 2px var(--green-muted)" : undefined,
                }}
              >
                {done ? <Check size={13} aria-hidden /> : i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* The current question. */}
      <div key={f.id} className="min-h-[13rem]">
        {isSegmented(f) ? (
          <fieldset aria-describedby={describedBy}>
            <legend className="text-xl sm:text-2xl font-semibold mb-4" style={{ color: "var(--foreground)" }}>
              {f.label}
              {f.required && <span style={{ color: "var(--red)" }}> *</span>}
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {f.options!.map((o) => {
                const checked = value === o.value;
                return (
                  <label
                    key={o.value}
                    className="relative flex items-center justify-center text-center rounded-xl border-2 px-3 py-4 min-h-[3.5rem] cursor-pointer text-base font-semibold transition-colors focus-within:ring-2"
                    style={{
                      borderColor: checked ? "var(--green)" : "var(--border)",
                      background: checked ? "var(--green-muted)" : "var(--card)",
                      color: checked ? "var(--green)" : "var(--foreground)",
                    }}
                  >
                    <input
                      type="radio"
                      name={f.id}
                      value={o.value}
                      checked={checked}
                      className="sr-only"
                      onChange={() => {
                        onChange(o.value);
                        void persist(f, o.value).then((ok) => {
                          if (ok && step < last) setTimeout(() => setStep((s) => Math.min(last, s + 1)), 220);
                        });
                      }}
                    />
                    {checked && <Check size={16} className="absolute top-2 right-2" aria-hidden />}
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <div>
            <label htmlFor={id} className="block text-xl sm:text-2xl font-semibold mb-4" style={{ color: "var(--foreground)" }}>
              {f.label}
              {f.required && <span style={{ color: "var(--red)" }}> *</span>}
            </label>
            {f.kind === "textarea" ? (
              <textarea id={id} name={f.id} value={value} placeholder={f.placeholder} rows={4} className="field" aria-invalid={Boolean(errors[f.id])} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} onBlur={() => void persist(f)} />
            ) : f.kind === "select" ? (
              <select
                id={id}
                name={f.id}
                value={value}
                className="field text-base py-3"
                aria-invalid={Boolean(errors[f.id])}
                aria-describedby={describedBy}
                onChange={(e) => {
                  onChange(e.target.value);
                  void persist(f, e.target.value);
                }}
              >
                <option value="">Choose…</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={f.id}
                value={value}
                placeholder={f.placeholder}
                className="field text-base py-3"
                type={f.kind === "date" ? "date" : "text"}
                inputMode={f.kind === "number" || f.kind === "currency" ? "decimal" : undefined}
                aria-invalid={Boolean(errors[f.id])}
                aria-describedby={describedBy}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => void persist(f)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void go(step + 1);
                  }
                }}
              />
            )}
          </div>
        )}
        {f.help && (
          <p id={`${id}-help`} className="text-sm mt-3" style={{ color: "var(--muted-foreground)" }}>
            {f.help}
          </p>
        )}
        {errors[f.id] && (
          <p id={`${id}-error`} className="text-sm mt-2" role="alert" style={{ color: "var(--red)" }}>
            {errors[f.id]}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => void go(step - 1)} disabled={step === 0}>
          <ArrowLeft size={16} aria-hidden /> Back
        </button>
        <span className="text-sm" aria-live="polite" style={{ color: "var(--muted-foreground)" }}>
          {saving > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={14} className="animate-spin" aria-hidden /> Saving
            </span>
          ) : status === "Saved" ? (
            <span className="inline-flex items-center gap-1" style={{ color: "var(--green)" }}>
              <Check size={14} aria-hidden /> Your answers are saved.
            </span>
          ) : null}
        </span>
        {step < last ? (
          <button type="button" className="btn btn-secondary" onClick={() => void go(step + 1)}>
            {value.trim() ? "Next" : "Skip"} <ArrowRight size={16} aria-hidden />
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="pt-5 border-t" style={{ borderColor: "var(--border)" }}>
        {submitBar}
      </div>
    </form>
  );
}
