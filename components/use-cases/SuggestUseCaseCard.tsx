"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, MessageSquarePlus } from "lucide-react";

/**
 * The last card in the library: "Don't see what you're looking for?" Opens a short form (what
 * you're trying to decide, email pre-filled) that records the request and emails the team. No checkout.
 */
export function SuggestUseCaseCard({ defaultEmail, submit }: { defaultEmail: string; submit: (decision: string, email: string) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  return (
    <article className="surface p-4 flex flex-col gap-3" style={{ borderStyle: "dashed" }} aria-label="Don't see what you're looking for?">
      <MessageSquarePlus size={28} style={{ color: "var(--green)" }} aria-hidden />
      <h2 className="font-display text-2xl leading-tight" style={{ color: "var(--foreground)" }}>
        Don&apos;t see what you&apos;re looking for?
      </h2>
      {done ? (
        <p className="text-sm flex gap-2 items-start" role="status" style={{ color: "var(--foreground)" }}>
          <CheckCircle2 size={18} className="shrink-0" style={{ color: "var(--green)" }} aria-hidden />
          Thanks. We&apos;ll be in touch at {email} about how we can help.
        </p>
      ) : !open ? (
        <>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Tell us the decision you&apos;re facing. We&apos;ll get back to you about how we can help.
          </p>
          <div className="mt-auto pt-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
              Tell us what you need
            </button>
          </div>
        </>
      ) : (
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await submit(decision, email);
              if (res.ok) setDone(true);
              else setError(res.error);
            });
          }}
        >
          <div>
            <label htmlFor="suggest-decision" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
              What are you trying to decide?
            </label>
            <textarea id="suggest-decision" rows={4} className="field" value={decision} onChange={(e) => setDecision(e.target.value)} />
          </div>
          <div>
            <label htmlFor="suggest-email" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
              Your email
            </label>
            <input id="suggest-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && (
            <p className="text-sm" role="alert" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </article>
  );
}
