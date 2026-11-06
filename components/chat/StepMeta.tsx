"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { isOverdue } from "@/lib/plan-tracking";
import type { PlanStep } from "@/lib/db/schema";

type Save = (owner: string, due: string | null) => Promise<{ ok: boolean; error?: string }>;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A milestone's owner, deadline (overdue when past and not done) and measure; editable on a live plan. */
export function StepMeta({ step, today, save }: { step: PlanStep; today: string | null; save?: Save }) {
  const [editing, setEditing] = useState(false);
  const [owner, setOwner] = useState(step.owner);
  const [due, setDue] = useState(step.due ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const late = today !== null && isOverdue(step, today);
  if (editing && save)
    return (
      <form
        className="mt-1.5 space-y-1.5"
        aria-label={`Edit ${step.action}`}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await save(owner, due || null);
            if (!r.ok) return setError(r.error ?? "Couldn't save that.");
            setEditing(false);
            router.refresh();
          });
        }}
      >
        <input aria-label="Owner" className="field w-full text-xs" value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={120} required />
        <input aria-label="Due date" type="date" className="field w-full text-xs" value={due} onChange={(e) => setDue(e.target.value)} />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary text-xs" disabled={pending}>Save</button>
          <button type="button" className="text-xs link" onClick={() => setEditing(false)}>Cancel</button>
        </div>
        {error && <p role="alert" className="text-xs" style={{ color: "var(--red)" }}>{error}</p>}
      </form>
    );
  return (
    <div className="text-xs mt-0.5 space-x-1" style={{ color: "var(--muted-foreground)" }}>
      <span>{step.owner}</span>
      {step.due && (
        <span style={{ color: late ? "var(--red)" : undefined, fontWeight: late ? 600 : undefined }}>
          · {late ? "Overdue: was due" : "Due"} {day(step.due)}
        </span>
      )}
      <span>· {step.measure}</span>
      {save && (
        <button type="button" className="link" aria-label={`Edit owner and deadline: ${step.action}`} onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
    </div>
  );
}
