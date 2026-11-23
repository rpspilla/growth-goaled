"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { StartState } from "@/app/(founder)/chat/actions";

type Starter = { id: string; starter: string };

function AskButton() {
  const { pending, data } = useFormStatus();
  const busy = pending && data?.get("topic") === "other";
  return (
    <button type="submit" name="topic" value="other" disabled={pending} className="btn btn-primary">
      {busy ? "Thinking it through…" : "Ask"}
    </button>
  );
}

function StarterChip({ s }: { s: Starter }) {
  const { pending, data } = useFormStatus();
  const busy = pending && data?.get("topic") === s.id;
  return (
    <button
      type="submit"
      name="topic"
      value={s.id}
      disabled={pending}
      className="rounded-full px-3.5 py-1.5 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-60 text-left"
      style={{ border: "1px solid var(--border)", color: "var(--foreground)", background: "var(--card)" }}
    >
      {busy ? "Thinking it through…" : s.starter}
    </button>
  );
}

/**
 * The AI CRO's front door (AI CRO sprint, Nov 23, 2026): "What are you working through?" in the
 * founder's own words first, the common questions as chips under it. Either opens a conversation,
 * already answered with what Growth Goaled knows about the company.
 */
export function AskBox({ starters, start, lead }: { starters: Starter[]; start: (prev: StartState, formData: FormData) => Promise<StartState>; lead?: string }) {
  const [state, action] = useActionState(start, {});
  const [text, setText] = useState("");
  const common = starters.filter((s) => s.id !== "other");
  return (
    <section aria-labelledby="ask-cro" className="surface p-5 sm:p-6 space-y-4">
      <div>
        <h2 id="ask-cro" className="font-display text-2xl sm:text-3xl leading-tight" style={{ color: "var(--foreground)" }}>
          What are you working through?
        </h2>
        <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>
          {lead ?? "Ask your CRO about any growth decision. It knows your company, your numbers and the work under way, so you won't be asked twice."}
        </p>
      </div>
      <form action={action} className="space-y-3">
        <label htmlFor="ask-text" className="sr-only">What are you working through?</label>
        <textarea
          id="ask-text"
          name="text"
          rows={3}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) e.currentTarget.form?.requestSubmit(e.currentTarget.form.querySelector<HTMLButtonElement>("button[value=other]"));
          }}
          className="field w-full text-base"
          placeholder="e.g. Our pipeline doubled but we're closing fewer deals. What's going on?"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <AskButton />
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>or start from a common question:</span>
        </div>
        <div role="group" aria-label="Common questions" className="flex flex-wrap gap-2">
          {common.map((s) => (
            <StarterChip key={s.id} s={s} />
          ))}
        </div>
      </form>
      {state.error && (
        <p role="alert" className="text-base" style={{ color: "var(--red)" }}>
          {state.error}
        </p>
      )}
    </section>
  );
}
