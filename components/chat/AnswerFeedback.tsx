"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

type Result = { ok: true; prompt?: boolean } | { ok: false; error: string };

/** The full decision card, one click away under the answer (Rally Beta: the answer reads like a CRO talking, not a report). */
export function FullReasoning({ children }: { children: ReactNode }) {
  return (
    <details className="group/reason">
      <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--green)" }}>
        See the full reasoning <span aria-hidden className="transition-transform group-open/reason:rotate-90">›</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/**
 * Helpful / Not helpful under each answer (Rally Beta): quiet, optional, changeable. "Not helpful"
 * asks for a short reason. After the founder's second helpful answer, one invitation to say what
 * would make Rally indispensable (once).
 */
export function AnswerFeedback({ messageId, given, rate }: { messageId: string; given: boolean | null; rate: (messageId: string, helpful: boolean, note: string | null) => Promise<Result> }) {
  const [value, setValue] = useState<boolean | null>(given);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [thanks, setThanks] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [pending, start] = useTransition();
  const send = (helpful: boolean, why: string | null) =>
    start(async () => {
      const r = await rate(messageId, helpful, why);
      if (!r.ok) return setThanks(r.error);
      setValue(helpful);
      setThanks(helpful ? "Thanks. Glad it helped." : why ? "Thanks. That helps us improve Rally." : null);
      if (r.prompt) setInvite(true);
    });
  const btn = (on: boolean) => ({ borderColor: on ? "var(--green)" : "var(--border)", color: on ? "var(--green)" : "var(--muted-foreground)", background: on ? "var(--green-muted)" : "transparent" });
  return (
    <div className="space-y-2" role="group" aria-label="Was this helpful?">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <button type="button" disabled={pending} aria-pressed={value === true} onClick={() => send(true, null)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1" style={btn(value === true)}>
          <ThumbsUp size={13} aria-hidden /> Helpful
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={value === false}
          onClick={() => {
            setAsking(true);
            send(false, null);
          }}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
          style={btn(value === false)}
        >
          <ThumbsDown size={13} aria-hidden /> Not helpful
        </button>
        {thanks && <span role="status" style={{ color: "var(--muted-foreground)" }}>{thanks}</span>}
      </div>
      {asking && value === false && !thanks && (
        <form
          className="flex gap-2 items-center flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) send(false, note.trim());
            setAsking(false);
          }}
        >
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="field py-1 text-sm flex-1 min-w-[14rem]" placeholder="What was missing or wrong? (optional)" aria-label="What was missing or wrong?" />
          <button type="submit" className="btn btn-secondary text-sm py-1" disabled={pending}>Send</button>
        </form>
      )}
      {invite && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--green-muted)", color: "var(--foreground)" }}>
          You&apos;re in the Rally Beta: what would make Rally indispensable to your business? <a href="/feedback?from=helpful" className="link font-semibold">Tell us in a minute</a>
        </p>
      )}
    </div>
  );
}
