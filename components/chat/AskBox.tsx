"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { flushSync, useFormStatus } from "react-dom";
import { DictateButton, DictationStatus, useDictation, voiceMode } from "./Dictation";
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
export function AskBox({
  starters,
  startersLabel = "or start from a common question",
  start,
  lead,
  cros = [],
  fixedCro,
  initialText = "",
  title = "What are you working through?",
  defaultCroId = null,
  voice = { transcribe: false, voiced: false, name: null },
}: {
  starters: Starter[];
  /** The line before the starter questions (a CRO's page: "Questions {name} can help with"). */
  startersLabel?: string;
  start: (prev: StartState, formData: FormData) => Promise<StartState>;
  lead?: string;
  /** Published CROs the founder can talk to instead of the Collective. */
  cros?: { id: string; name: string }[];
  /** On a CRO's page: always that CRO's AI. */
  fixedCro?: { id: string; name: string };
  /** Words already in the box (the weekly check-in's summary). */
  initialText?: string;
  title?: string;
  /** The company's default (who the ask box starts on). */
  defaultCroId?: string | null;
  /** Talking to Rally: transcription for browsers without speech recognition; the greeting's voice and name. */
  voice?: { transcribe: boolean; voiced: boolean; name: string | null };
}) {
  const [state, action] = useActionState(start, {});
  const [text, setText] = useState(initialText);
  const form = useRef<HTMLFormElement>(null);
  const spokenSubmit = useRef(false);
  // Spoken: asked as soon as they pause; the conversation then reads the answer and listens.
  const dictation = useDictation(text, setText, {
    onSpoken: (said) => {
      const f = form.current;
      if (!f) return;
      voiceMode.on();
      spokenSubmit.current = true;
      flushSync(() => setText(said));
      f.requestSubmit(f.querySelector<HTMLButtonElement>("button[value=other]"));
    },
    transcribe: voice.transcribe,
    greeting: { name: voice.name, voiced: voice.voiced },
  });
  const common = starters.filter((s) => s.id !== "other");
  return (
    <section aria-labelledby="ask-cro" className="surface p-5 sm:p-6 space-y-4">
      <div>
        <h2 id="ask-cro" className="font-display text-2xl sm:text-3xl leading-tight" style={{ color: "var(--foreground)" }}>
          {title}
        </h2>
        <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>
          {lead ?? "Ask your CRO about any growth decision. It knows your company, your numbers and the work under way, so you won't be asked twice."}
        </p>
      </div>
      <form
        ref={form}
        action={action}
        className="space-y-3"
        onSubmit={() => {
          dictation.cancel();
          if (!spokenSubmit.current) voiceMode.off();
          spokenSubmit.current = false;
        }}
      >
        {fixedCro ? (
          <input type="hidden" name="cro" value={fixedCro.id} />
        ) : (
          cros.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>Ask</span>
              <select name="cro" defaultValue={cros.some((c) => c.id === defaultCroId) ? (defaultCroId ?? "") : ""} className="field py-1.5" aria-label="Who to ask">
                <option value="">The Rally Collective (all our CROs){!defaultCroId ? " · your default" : ""}</option>
                {cros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}&apos;s AI CRO{c.id === defaultCroId ? " · your default" : ""}
                  </option>
                ))}
              </select>
              <Link href="/cros" className="link">Meet the CROs</Link>
            </div>
          )
        )}
        <label htmlFor="ask-text" className="sr-only">What are you working through?</label>
        <textarea
          id="ask-text"
          name="text"
          rows={3}
          maxLength={4000}
          value={text}
          onChange={(e) => {
            if (dictation.listening) {
              dictation.cancel();
              voiceMode.off();
            }
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) e.currentTarget.form?.requestSubmit(e.currentTarget.form.querySelector<HTMLButtonElement>("button[value=other]"));
          }}
          className="field w-full text-base"
          placeholder="e.g. Our pipeline doubled but we're closing fewer deals. What's going on?"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <AskButton />
          <DictateButton d={dictation} />
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{startersLabel}:</span>
        </div>
        <DictationStatus d={dictation} />
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
