"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { Pill } from "@/components/ui/Pill";

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
};

type SetStatus = (id: string, status: "open" | "done" | "dropped") => Promise<{ ok: boolean; error?: string }>;

function Row({ c: saved, setStatus }: { c: CommitmentItem; setStatus?: SetStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The tick shows at once; the list catches up when the page refreshes.
  const [status, setShown] = useOptimistic(saved.status);
  const c = { ...saved, status };
  const run = (next: "open" | "done" | "dropped") =>
    start(async () => {
      setError(null);
      setShown(next);
      const r = await setStatus!(c.id, next);
      if (!r.ok) setError(r.error ?? "That didn't save. Try again.");
    });
  const closed = c.status !== "open";
  return (
    <li className="p-4 flex gap-3 items-start" style={{ borderColor: "var(--border)" }}>
      {setStatus ? (
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
            <span className="inline-flex items-center gap-1" style={c.overdue ? { color: "var(--red)" } : undefined}>
              <CalendarCheck size={13} aria-hidden /> {c.overdue ? `Overdue: was due ${c.dueLabel}` : `by ${c.dueLabel}`}
            </span>
          )}
          {c.status === "done" && <Pill tone="green">Done</Pill>}
          {c.status === "dropped" && <Pill tone="neutral">Dropped</Pill>}
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
        {error && <p role="alert" className="text-sm mt-1" style={{ color: "var(--red)" }}>{error}</p>}
      </div>
      {setStatus && c.status === "open" && (
        <button type="button" className="link text-sm shrink-0" disabled={pending} onClick={() => run("dropped")} aria-label={`Drop: ${c.title}`}>
          Drop
        </button>
      )}
      {setStatus && c.status === "dropped" && (
        <button type="button" className="link text-sm shrink-0" disabled={pending} onClick={() => run("open")} aria-label={`Reopen: ${c.title}`}>
          Reopen
        </button>
      )}
    </li>
  );
}

/** The company's commitments: tick done, drop or reopen (founders); read-only without `setStatus` (advisors). */
export function CommitmentList({ items, label, setStatus }: { items: CommitmentItem[]; label: string; setStatus?: SetStatus }) {
  return (
    <ul aria-label={label} className="surface divide-y" style={{ borderColor: "var(--border)" }}>
      {items.map((c) => (
        <Row key={c.id} c={c} setStatus={setStatus} />
      ))}
    </ul>
  );
}
