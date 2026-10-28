"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { IntakeSection, IntakeSectionId } from "@/lib/intake";
import { saveIntakeField } from "../actions";

type FieldState = "idle" | "saving" | "saved" | "error";

const inputStyle = { background: "var(--muted)", borderColor: "var(--border)", color: "var(--foreground)" };

export function IntakeForm({
  sections,
  section,
  initialValues,
  initialPercent,
  initialComplete,
}: {
  sections: { id: IntakeSectionId; label: string }[];
  section: IntakeSection;
  initialValues: Record<string, string>;
  initialPercent: number;
  initialComplete: IntakeSectionId[];
}) {
  const [values, setValues] = useState(initialValues);
  const [saved, setSaved] = useState(initialValues);
  const [status, setStatus] = useState<Record<string, FieldState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [percent, setPercent] = useState(initialPercent);
  const [complete, setComplete] = useState(new Set(initialComplete));
  const [, startTransition] = useTransition();

  const index = sections.findIndex((s) => s.id === section.id);
  const next = sections[index + 1];

  function save(fieldId: string, raw: string) {
    if (raw === saved[fieldId]) return;
    setStatus((s) => ({ ...s, [fieldId]: "saving" }));
    startTransition(async () => {
      const result = await saveIntakeField(section.id, fieldId, raw);
      if (result.ok) {
        setSaved((v) => ({ ...v, [fieldId]: raw }));
        setStatus((s) => ({ ...s, [fieldId]: "saved" }));
        setErrors((e) => ({ ...e, [fieldId]: "" }));
        setPercent(result.percent);
        setComplete(new Set(result.completeSections));
      } else {
        setStatus((s) => ({ ...s, [fieldId]: "error" }));
        setErrors((e) => ({ ...e, [fieldId]: result.error }));
      }
    });
  }

  const anySaving = Object.values(status).includes("saving");

  return (
    <div className="px-4 sm:px-8 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <div className="label" style={{ color: "var(--muted-foreground)" }}>
            Company Profile
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--green)" }}>
            <span className="font-semibold font-mono">{percent}% complete</span>
          </div>
        </div>
        <div className="h-1.5 rounded-full mb-4" style={{ background: "var(--muted)" }}>
          <div className="h-1.5 rounded-full" style={{ width: `${percent}%`, background: "var(--green)", transition: "width 0.4s ease" }} />
        </div>
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Tell us about your company
        </h1>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          This data forms the foundation of your Growth Intelligence profile. Answers save automatically.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Section tabs */}
        <div className="w-40 shrink-0 space-y-1">
          {sections.map((s, i) => {
            const active = s.id === section.id;
            const done = complete.has(s.id);
            return (
              <Link
                key={s.id}
                href={`/profile/${s.id}`}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all"
                style={{ background: active ? "var(--navy)" : "transparent", color: active ? "#fff" : "var(--muted-foreground)" }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                  style={{
                    background: done ? "var(--green)" : active ? "rgba(21,90,60,0.5)" : "var(--muted)",
                    color: done ? "#fff" : active ? "#6EE7A8" : "var(--muted-foreground)",
                  }}
                >
                  {done ? "✓" : i + 1}
                </span>
                {s.label}
              </Link>
            );
          })}
        </div>

        {/* Form */}
        <div className="flex-1">
          <div className="rounded-xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-5">
              <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{section.label}</div>
              <div className="text-xs" style={{ color: anySaving ? "var(--muted-foreground)" : "var(--green)" }}>
                {anySaving ? "Saving…" : Object.values(status).includes("saved") ? "✓ All changes saved" : ""}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {section.fields.filter((f) => !f.rangeOf).map((f) => {
                const id = `intake-${f.id}`;
                // A range picked on a questionnaire, shown until an exact figure replaces it.
                const range = !values[f.id] ? section.fields.find((r) => r.rangeOf === f.id && values[r.id]) : undefined;
                const common = {
                  id,
                  name: f.id,
                  value: values[f.id] ?? "",
                  className: "w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2",
                  style: { ...inputStyle, borderColor: status[f.id] === "error" ? "var(--red)" : "var(--border)" },
                };
                return (
                  <div key={f.id} className={f.kind === "textarea" ? "col-span-2" : undefined}>
                    <label htmlFor={id} className="text-xs font-medium flex items-center justify-between mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                      <span>
                        {f.label}
                        {f.required && <span style={{ color: "var(--amber)" }}> *</span>}
                      </span>
                      {status[f.id] === "saved" && <span style={{ color: "var(--green)" }}>✓</span>}
                    </label>
                    {f.kind === "select" ? (
                      <select
                        {...common}
                        onChange={(e) => {
                          setValues((v) => ({ ...v, [f.id]: e.target.value }));
                          save(f.id, e.target.value);
                        }}
                      >
                        <option value="">Select…</option>
                        {f.options?.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : f.kind === "textarea" ? (
                      <textarea
                        {...common}
                        rows={3}
                        placeholder={f.placeholder}
                        onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                        onBlur={(e) => save(f.id, e.target.value)}
                      />
                    ) : (
                      <input
                        {...common}
                        type="text"
                        inputMode={f.kind === "text" ? undefined : "decimal"}
                        placeholder={f.placeholder}
                        onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                        onBlur={(e) => save(f.id, e.target.value)}
                      />
                    )}
                    {range && <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>You told us {values[range.id]}. Add the exact figure if you know it.</div>}
                    {errors[f.id] && <div className="text-xs mt-1" style={{ color: "var(--red)" }}>{errors[f.id]}</div>}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-6 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
              <Link href="/overview" className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Save for later
              </Link>
              <Link
                href={next ? `/profile/${next.id}` : "/data"}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                style={{ background: "var(--green)", color: "#fff" }}
              >
                {next ? "Continue →" : "Go to Data →"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
