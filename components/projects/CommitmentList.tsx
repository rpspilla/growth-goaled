"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { OUTCOMES } from "@/lib/commitments";

type Outcome = keyof typeof OUTCOMES;

export type CommitmentItem = {
  id: string;
  title: string;
  owner: string;
  dueLabel: string | null;
  overdue: boolean;
  measure: string | null;
  status: "open" | "done" | "dropped";
  project: { id: string; name: string } | null;
  conversationId: string | null;
  outcome: Outcome | null;
  outcomeNote: string | null;
  timesMoved: number;
};

type Res = { ok: boolean; error?: string };
export type CommitmentActions = {
  setStatus: (id: string, status: "open" | "done" | "dropped") => Promise<Res>;
  setOutcome?: (id: string, outcome: Outcome, note: string | null) => Promise<Res>;
  reschedule?: (id: string, dueOn: string) => Promise<Res>;
};

const OUTCOME_TONE = { worked: "green", partly: "amber", didnt: "red" } as const;

function Row({ c: saved, actions }: { c: CommitmentItem; actions?: CommitmentActions }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Changes show at once; the list catches up when the page refreshes.
  const [status, setShown] = useOptimistic(saved.status);
  const [outcome, setShownOutcome] = useOptimistic(saved.outcome);
  const [moving, setMoving] = useState(false);
  const [newDue, setNewDue] = useState("");
  const [note, setNote] = useState("");
  const c = { ...saved, status, outcome };
  const call = (fn: () => Promise<Res>, optimistic?: () => void) =>
    start(async () => {
      setError(null);
      optimistic?.();
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That didn't save. Try again.");
    });
  const run = (next: "open" | "done" | "dropped") => call(() => actions!.setStatus(c.id, next), () => setShown(next));
  const closed = c.status !== "open";
  return (
    <li className="p-4 flex gap-3 items-start" style={{ borderColor: "var(--border)" }}>
      {actions ? (
        <input
          type="checkbox"
          checked={c.status === "done"}
          disabled={pending || c.status === "dropped"}
          onChange={(e) => run(e.target.checked ? "done" : "open")}
          aria-label={`Done: ${c.title}`}
          className="mt-1.5 w-4 h-4 shrink-0"
        />
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium" style={{ color: "var(--foreground)", textDecoration: closed ? "line-through" : undefined, opacity: closed ? 0.6 : 1 }}>
          {c.title}
        </div>
        <div className="text-sm mt-0.5 flex gap-x-2 gap-y-1 flex-wrap items-center" style={{ color: "var(--muted-foreground)" }}>
          <span>{c.owner}</span>
          {c.dueLabel && (
            <span className="inline-flex items-center gap-1" style={c.overdue && !closed ? { color: "var(--red)" } : undefined}>
              <CalendarCheck size={13} aria-hidden /> {c.overdue && !closed ? `Overdue: was due ${c.dueLabel}` : `by ${c.dueLabel}`}
            </span>
          )}
          {c.status === "open" && c.timesMoved >= 3 && <Pill tone="amber">{`Moved ${c.timesMoved} times`}</Pill>}
          {c.status === "done" && <Pill tone="green">Done</Pill>}
          {c.status === "dropped" && <Pill tone="neutral">Dropped</Pill>}
          {c.outcome && <Pill tone={OUTCOME_TONE[c.outcome]}>{OUTCOMES[c.outcome]}</Pill>}
          {c.project && (
            <Link href={`/projects/${c.project.id}`} className="link">
              {c.project.name}
            </Link>
          )}
          {c.conversationId && (
            <Link href={`/chat/${c.conversationId}`} className="link">
              Discuss with your CRO
            </Link>
          )}
        </div>
        {c.measure && <p className="text-sm mt-1" style={{ color: "var(--foreground)" }}><span className="font-semibold" style={{ color: "var(--green)" }}>Worked if: </span>{c.measure}</p>}
        {c.outcome && saved.outcomeNote && <p className="text-sm mt-1" style={{ color: "var(--foreground)" }}>{saved.outcomeNote}</p>}

        {actions?.setOutcome && closed && !c.outcome && (
          <div role="group" aria-label={`How did it go: ${c.title}`} className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>How did it go?</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What happened (optional)" aria-label={`What happened: ${c.title}`} className="field py-1 text-sm flex-1 min-w-[12rem]" />
            {(Object.keys(OUTCOMES) as Outcome[]).map((o) => (
              <button key={o} type="button" disabled={pending} className="btn btn-secondary text-sm py-1" onClick={() => call(() => actions.setOutcome!(c.id, o, note || null), () => setShownOutcome(o))}>
                {OUTCOMES[o]}
              </button>
            ))}
          </div>
        )}

        {actions?.reschedule && c.status === "open" && moving && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} aria-label={`New due date: ${c.title}`} className="field py-1 text-sm" />
            <button
              type="button"
              disabled={pending || !newDue}
              className="btn btn-secondary text-sm py-1"
              onClick={() =>
                call(async () => {
                  const r = await actions.reschedule!(c.id, newDue);
                  if (r.ok) setMoving(false);
                  return r;
                })
              }
            >
              Save date
            </button>
          </div>
        )}
        {error && <p role="alert" className="text-sm mt-1" style={{ color: "var(--red)" }}>{error}</p>}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {actions?.reschedule && c.status === "open" && !moving && (
          <button type="button" className="link text-sm" disabled={pending} onClick={() => setMoving(true)} aria-label={`Move date: ${c.title}`}>
            Move date
          </button>
        )}
        {actions && c.status === "open" && (
          <button type="button" className="link text-sm" disabled={pending} onClick={() => run("dropped")} aria-label={`Drop: ${c.title}`}>
            Drop
          </button>
        )}
        {actions && c.status === "dropped" && (
          <button type="button" className="link text-sm" disabled={pending} onClick={() => run("open")} aria-label={`Reopen: ${c.title}`}>
            Reopen
          </button>
        )}
      </div>
    </li>
  );
}

/** The company's commitments: tick done, drop, move dates and say how they went (founders); read-only without `actions` (advisors). */
export function CommitmentList({ items, label, actions }: { items: CommitmentItem[]; label: string; actions?: CommitmentActions }) {
  return (
    <ul aria-label={label} className="surface divide-y" style={{ borderColor: "var(--border)" }}>
      {items.map((c) => (
        <Row key={c.id} c={c} actions={actions} />
      ))}
    </ul>
  );
}
