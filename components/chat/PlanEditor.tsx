"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionPlanContent, PlanStep } from "@/lib/db/schema";

type Result = { ok: boolean; error?: string };
const PERIODS = [
  ["days30", "Days 1–30"],
  ["days60", "Days 31–60"],
  ["days90", "Days 61–90"],
] as const;
const empty: ActionPlanContent = { goal: "", summary: "", days30: [], days60: [], days90: [], risks: [], assumptions: [], tools: [] };

/** The advisor edits a submitted plan, then approves it for delivery. */
export function PlanEditor({ planId, initial, approve, redraft }: { planId: string; initial: ActionPlanContent | null; approve: (id: string, content: ActionPlanContent, note: string | null) => Promise<Result>; redraft: (id: string) => Promise<Result> }) {
  const [plan, setPlan] = useState<ActionPlanContent>(initial ?? empty);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else after?.();
      router.refresh();
    });
  const setStep = (period: (typeof PERIODS)[number][0], i: number, patch: Partial<PlanStep>) => setPlan((p) => ({ ...p, [period]: p[period].map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  if (done) return <p className="text-base" role="status" style={{ color: "var(--green)" }}>Approved and delivered. The founder has been emailed.</p>;
  return (
    <div className="space-y-5">
      {!initial && <p className="text-base" style={{ color: "var(--amber)" }}>No draft yet (still drafting, or the draft failed). Re-draft it from the conversation, or write it here.</p>}
      <div className="grid xl:grid-cols-2 gap-4">
      <div className="space-y-1">
        <label className="label" htmlFor="plan-goal">Goal</label>
        <textarea id="plan-goal" rows={3} className="field w-full" value={plan.goal} onChange={(e) => setPlan({ ...plan, goal: e.target.value })} />
      </div>
      <div className="space-y-1">
        <label className="label" htmlFor="plan-summary">Summary</label>
        <textarea id="plan-summary" rows={3} className="field w-full" value={plan.summary} onChange={(e) => setPlan({ ...plan, summary: e.target.value })} />
      </div>
      </div>
      {PERIODS.map(([key, label]) => (
        <fieldset key={key} className="space-y-2">
          <legend className="label">{label}</legend>
          {plan[key].map((s, i) => (
            <div key={i} className="grid sm:grid-cols-[2fr_1fr_1fr_auto] gap-2">
              <input aria-label={`${label} action ${i + 1}`} className="field" value={s.action} onChange={(e) => setStep(key, i, { action: e.target.value })} placeholder="Action" />
              <input aria-label={`${label} owner ${i + 1}`} className="field" value={s.owner} onChange={(e) => setStep(key, i, { owner: e.target.value })} placeholder="Owner" />
              <input aria-label={`${label} measure ${i + 1}`} className="field" value={s.measure} onChange={(e) => setStep(key, i, { measure: e.target.value })} placeholder="How it's measured" />
              <button type="button" className="btn btn-secondary" onClick={() => setPlan((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }))}>Remove</button>
            </div>
          ))}
          <button type="button" className="text-sm link" onClick={() => setPlan((p) => ({ ...p, [key]: [...p[key], { action: "", owner: "Founder", measure: "" }] }))}>+ Add a milestone</button>
        </fieldset>
      ))}
      <div className="space-y-1">
        <label className="label" htmlFor="plan-note">Note to the founder (optional)</label>
        <textarea id="plan-note" rows={2} className="field w-full" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => approve(planId, plan, note || null), () => setDone(true))}>
          {pending ? "Saving…" : "Approve and deliver"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => redraft(planId))}>Re-draft from the conversation</button>
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}

/** The advisor's reply box in a supported plan's conversation. */
export function AdvisorReply({ planId, send }: { planId: string; send: (id: string, text: string) => Promise<Result> }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await send(planId, text);
          if (r.ok) setText("");
          else setError(r.error ?? "Couldn't send that.");
          router.refresh();
        });
      }}
    >
      <label htmlFor="advisor-reply" className="label">Your message to the founder</label>
      <textarea id="advisor-reply" rows={3} maxLength={4000} className="field w-full" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={pending || !text.trim()}>{pending ? "Sending…" : "Send to founder"}</button>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </form>
  );
}

/** "Update the plan from the conversation" (supported plans): re-drafted after the response. */
export function RedraftButton({ planId, redraft, label }: { planId: string; redraft: (id: string) => Promise<Result>; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await redraft(planId);
            setMsg(r.ok ? "Updating; this page refreshes when it's done." : (r.error ?? "Couldn't start that."));
            router.refresh();
          })
        }
      >
        {label}
      </button>
      {msg && <span className="text-sm" role="status" style={{ color: "var(--muted-foreground)" }}>{msg}</span>}
    </div>
  );
}
