"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Wrench } from "lucide-react";
import { HumanPresence } from "@/components/brand/HumanPresence";
import type { ActionPlanContent, PlanTarget } from "@/lib/db/schema";
import { PlanTargets } from "./PlanTargets";
import { StepMeta } from "./StepMeta";

const PERIODS = [
  ["days30", "Days 1–30"],
  ["days60", "Days 31–60"],
  ["days90", "Days 61–90"],
] as const;

/** The plan: goal, approach, milestones by period (tickable when allowed), risks and assumptions, tools to evaluate. */
export function ActionPlanView({
  content,
  toggle,
  today = null,
  editStep,
  targets,
}: {
  content: ActionPlanContent;
  /** YYYY-MM-DD from the server, for "Overdue" (null: don't flag). */
  today?: string | null;
  /** Execute & Monitor: change a milestone's owner and deadline. */
  editStep?: (period: string, index: number, owner: string, due: string | null) => Promise<{ ok: boolean; error?: string }>;
  /** The plan's targets with the company's current figures; `save` when they can be edited. */
  targets?: { current: Record<string, number | null>; save?: (targets: PlanTarget[]) => Promise<{ ok: boolean; error?: string }> };
  /** When set, milestones can be ticked off. */
  toggle?: (period: string, index: number, done: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Ticks show straight away; the server confirms (or the box reverts with an error).
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const isDone = (key: string, i: number, s: { done?: boolean }) => ticked[`${key}:${i}`] ?? Boolean(s.done);
  const all = PERIODS.flatMap(([key]) => content[key].map((s, i) => isDone(key, i, s)));
  const done = all.filter(Boolean).length;
  return (
    <div className="space-y-4">
      <HumanPresence variant="plan" />
      <div>
        <div className="label mb-1" style={{ color: "var(--green)" }}>Goal</div>
        <p className="font-display text-2xl leading-tight" style={{ color: "var(--foreground)" }}>{content.goal}</p>
        <p className="text-base mt-2" style={{ color: "var(--muted-foreground)" }}>{content.summary}</p>
        {toggle && all.length > 0 && <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{done} of {all.length} milestones done</p>}
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {PERIODS.map(([key, label]) => (
          <div key={key} className="rounded-xl p-3" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <h4 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>{label}</h4>
            <ol className="space-y-3">
              {content[key].map((s, i) => (
                <li key={i} className="flex gap-2 items-start">
                  {toggle && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={isDone(key, i, s)}
                      disabled={pending}
                      aria-label={`Done: ${s.action}`}
                      onChange={(e) => {
                        const value = e.target.checked;
                        setTicked((t) => ({ ...t, [`${key}:${i}`]: value }));
                        start(async () => {
                          setError(null);
                          const r = await toggle(key, i, value);
                          if (!r.ok) {
                            setError(r.error ?? "Couldn't save that.");
                            setTicked((t) => ({ ...t, [`${key}:${i}`]: !value }));
                          }
                          router.refresh();
                        });
                      }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: "var(--foreground)", textDecoration: isDone(key, i, s) ? "line-through" : undefined }}>{s.action}</div>
                    <StepMeta step={s} today={today} save={editStep ? (owner, due) => editStep(key, i, owner, due) : undefined} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {targets && (targets.save || (content.targets?.length ?? 0) > 0) && <PlanTargets targets={content.targets ?? []} current={targets.current} save={targets.save} />}
      {(content.risks.length > 0 || content.assumptions.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3 text-sm" style={{ color: "var(--foreground)" }}>
          {content.risks.length > 0 && (
            <div>
              <div className="label mb-1">Risks</div>
              <ul className="list-disc pl-4 space-y-0.5">{content.risks.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
          {content.assumptions.length > 0 && (
            <div>
              <div className="label mb-1">Assumptions</div>
              <ul className="list-disc pl-4 space-y-0.5">{content.assumptions.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {content.tools && content.tools.length > 0 && (
        <section aria-label="Tools to evaluate" className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <h4 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Tools to evaluate</h4>
          <p className="text-sm mb-2" style={{ color: "var(--muted-foreground)" }}>Worth a look to get better results from this plan or save time on it.</p>
          <ul className="space-y-2">
            {content.tools.map((t) => (
              <li key={t.name} className="text-sm flex gap-2 items-start" style={{ color: "var(--foreground)" }}>
                <Wrench size={14} className="shrink-0 mt-1" style={{ color: "var(--green)" }} aria-hidden />
                <span>
                  <strong>{t.name}</strong>
                  {t.category && <span style={{ color: "var(--muted-foreground)" }}> · {t.category}</span>}
                  {t.why && <span className="block" style={{ color: "var(--muted-foreground)" }}>{t.why}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
