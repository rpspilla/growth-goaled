"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionPlanContent } from "@/lib/db/schema";

const PERIODS = [
  ["days30", "Days 1–30"],
  ["days60", "Days 31–60"],
  ["days90", "Days 61–90"],
] as const;

/** The plan: goal, approach, milestones by period (tickable when allowed), risks and assumptions. */
export function ActionPlanView({
  content,
  toggle,
}: {
  content: ActionPlanContent;
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
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{s.owner} · {s.measure}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
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
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
