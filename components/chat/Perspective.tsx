"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { ok: true } | { ok: false; error: string };
type Cro = { id: string; name: string; slug: string };

/**
 * Who's answering in this conversation, and switching it (multi-CRO, Nov 24, 2026): a CRO's AI or the
 * Rally Collective. Switching changes the perspective and the knowledge it draws on, never
 * the company record or what's been said: earlier answers keep their own CRO.
 */
export function PerspectiveSwitch({ conversationId, current, cros, switchTo, strongest }: { conversationId: string; current: Cro | null; cros: Cro[]; switchTo: (conversationId: string, croId: string | null) => Promise<Result>; strongest: Cro[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const go = (croId: string | null) =>
    start(async () => {
      setError(null);
      const r = await switchTo(conversationId, croId);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  const others = strongest.filter((c) => c.id !== current?.id);
  return (
    <div aria-label="Change who you're talking to" className="text-sm space-y-1" style={{ color: "var(--muted-foreground)" }}>
      {cros.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <label htmlFor="perspective" className="sr-only">Continue with</label>
          <select id="perspective" aria-label="Continue with" value={current?.id ?? ""} disabled={pending} onChange={(e) => go(e.target.value || null)} className="field py-1 text-sm">
            <option value="">Rally Collective Brain</option>
            {cros.map((c) => (
              <option key={c.id} value={c.id}>{c.name}&apos;s CRO-Brain</option>
            ))}
          </select>
          {others.length > 0 && (
            <span className="text-xs">
              Strongest on this:{" "}
              {others.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <button type="button" className="link" disabled={pending} onClick={() => go(c.id)} aria-label={`Continue with ${c.name}'s CRO-Brain`}>{c.name}</button>
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      {error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}

/** Under a CRO's recommendation: the network's view, once, without leaving the CRO. */
export function SecondOpinion({ conversationId, cro, ask }: { conversationId: string; cro: string; ask: (conversationId: string) => Promise<Result> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await ask(conversationId);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
      >
        {pending ? "Asking the network…" : "Get a second opinion from the network"}
      </button>
      <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>The Collective weighs in once; you stay with {cro}&apos;s AI.</span>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}

/** "Make my default": who the company's founders talk to unless they choose otherwise. */
export function DefaultCroButton({ croId, isDefault, label, set }: { croId: string | null; isDefault: boolean; label: string; set: (croId: string | null) => Promise<Result> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (isDefault) return <span className="text-sm font-semibold" style={{ color: "var(--green)" }}>Your default</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="link text-sm"
        disabled={pending}
        aria-label={`Make ${label} my default`}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await set(croId);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
      >
        Make my default
      </button>
      {error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</span>}
    </span>
  );
}
