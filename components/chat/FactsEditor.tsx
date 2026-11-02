"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pill } from "@/components/ui/Pill";

type Fact = { id: string; label: string; value: string; status: "stated" | "assumption" | "verified" };
type Result = { ok: boolean; error?: string };

const STATUS = { stated: { label: "You said", tone: "blue" }, assumption: { label: "Your estimate", tone: "amber" }, verified: { label: "Confirmed", tone: "green" } } as const;

/** What Growth Goaled remembers from conversations: the founder can correct (which confirms it) or remove each fact. */
export function FactsEditor({ facts, update, remove }: { facts: Fact[]; update: (id: string, value: string) => Promise<Result>; remove: (id: string) => Promise<Result> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) {
        setEditing(null);
        router.refresh();
      } else setError(r.error ?? "Couldn't save that.");
    });

  if (!facts.length) {
    return <p className="text-base" style={{ color: "var(--muted-foreground)" }}>Nothing yet. Facts you mention in conversations (team size, deal size, plans…) appear here.</p>;
  }
  return (
    <div>
      <ul className="surface divide-y" style={{ borderColor: "var(--border)" }}>
        {facts.map((f) => (
          <li key={f.id} className="p-4 flex gap-3 items-center flex-wrap" style={{ borderColor: "var(--border)" }}>
            <span className="text-base font-semibold min-w-[10rem]" style={{ color: "var(--foreground)" }}>{f.label}</span>
            {editing === f.id ? (
              <form
                className="flex gap-2 flex-1 flex-wrap"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => update(f.id, draft));
                }}
              >
                <label htmlFor={`fact-${f.id}`} className="sr-only">{f.label}</label>
                <input id={`fact-${f.id}`} className="field flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} autoFocus />
                <button type="submit" className="btn btn-primary" disabled={pending}>Save</button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span className="text-base flex-1 min-w-0" style={{ color: "var(--foreground)" }}>{f.value}</span>
                <Pill tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Pill>
                <button type="button" className="text-sm link" onClick={() => (setEditing(f.id), setDraft(f.value))} aria-label={`Correct ${f.label}`}>Correct</button>
                <button type="button" className="text-sm link" disabled={pending} onClick={() => run(() => remove(f.id))} aria-label={`Remove ${f.label}`}>Remove</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm mt-2" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
