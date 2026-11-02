"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { StartState } from "@/app/(founder)/chat/actions";

type Starter = { id: string; starter: string };

function StarterButton({ s, chosen, onChoose }: { s: Starter; chosen: string | null; onChoose: (id: string) => void }) {
  const { pending } = useFormStatus();
  const busy = pending && chosen === s.id;
  return (
    <button
      type="submit"
      name="topic"
      value={s.id}
      disabled={pending}
      onClick={() => onChoose(s.id)}
      className="text-left rounded-xl px-4 py-3 text-base font-medium hover:bg-[var(--muted)] disabled:opacity-60"
      style={{ border: "1px solid var(--border)", color: "var(--foreground)", background: "var(--card)" }}
    >
      {busy ? "Thinking it through…" : s.starter}
    </button>
  );
}

function OtherSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="topic" value="other" disabled={pending} className="btn btn-primary">
      {pending ? "Thinking it through…" : "Ask"}
    </button>
  );
}

/** The conversation starters: one click opens a conversation about that question, already answered. */
export function ChatStart({ starters, start, heading = true }: { starters: Starter[]; start: (prev: StartState, formData: FormData) => Promise<StartState>; heading?: boolean }) {
  const [state, action] = useActionState(start, {});
  const [chosen, setChosen] = useState<string | null>(null);
  const [other, setOther] = useState(false);
  const main = starters.filter((s) => s.id !== "other");
  return (
    <section aria-labelledby={heading ? "chat-start" : undefined} aria-label={heading ? undefined : "Start a conversation"}>
      {heading && (
        <div className="mb-4">
          <h2 id="chat-start" className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>
            What are you trying to figure out?
          </h2>
          <p className="text-lg mt-2" style={{ color: "var(--muted-foreground)" }}>
            Talk it through with your Seed and Series A stage CRO. Free, and it uses what you&apos;ve already shared, so you won&apos;t be asked twice.
          </p>
        </div>
      )}
      <form action={action}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {main.map((s) => (
            <StarterButton key={s.id} s={s} chosen={chosen} onChoose={setChosen} />
          ))}
          <button
            type="button"
            onClick={() => setOther(true)}
            aria-expanded={other}
            className="text-left rounded-xl px-4 py-3 text-base font-medium hover:bg-[var(--muted)]"
            style={{ border: "1px dashed var(--border)", color: "var(--foreground)" }}
          >
            {starters.find((s) => s.id === "other")?.starter ?? "Something else."}
          </button>
        </div>
        {other && (
          <div className="mt-4 surface p-4 space-y-3">
            <label htmlFor="chat-other" className="label">What&apos;s on your mind?</label>
            <textarea id="chat-other" name="text" rows={3} maxLength={4000} className="field w-full" placeholder="Describe the commercial decision you're facing, in your own words." autoFocus />
            <OtherSubmit />
          </div>
        )}
      </form>
      {state.error && (
        <p role="alert" className="text-base mt-3" style={{ color: "var(--red)" }}>
          {state.error}
        </p>
      )}
    </section>
  );
}
