"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useFormStatus } from "react-dom";
import type { StartState } from "@/app/(founder)/chat/actions";
import type { Suggestion } from "@/lib/chat/suggestions";
import { WhoToAsk } from "./WhoToAsk";
import type { CroCard } from "./CroIdentity";
import { DictateButton, DictationStatus, useDictation, voiceMode } from "./Dictation";

function Send() {
  const { pending, data } = useFormStatus();
  const busy = pending && !data?.get("question");
  return (
    <button
      type="submit"
      name="topic"
      value="other"
      disabled={pending}
      className="btn btn-primary"
      onClick={(e) => {
        // Typed words, not an earlier suggestion's.
        (e.currentTarget.form!.elements.namedItem("question") as HTMLInputElement).value = "";
      }}
    >
      {busy ? "Thinking it through…" : "Ask"}
    </button>
  );
}

function SuggestionButton({ s }: { s: Suggestion }) {
  const { pending, data } = useFormStatus();
  const busy = pending && data?.get("question") === s.text;
  return (
    <button
      type="submit"
      formNoValidate
      onClick={(e) => {
        // The suggestion's topic and words go with this submit only.
        const f = e.currentTarget.form!;
        (f.elements.namedItem("question") as HTMLInputElement).value = s.text;
      }}
      name="topic"
      value={s.topic}
      disabled={pending}
      className="rounded-xl px-4 py-3 text-sm text-left font-medium hover:bg-[var(--muted)] disabled:opacity-60"
      style={{ border: "1px solid var(--border)", color: "var(--foreground)", background: "var(--card)" }}
    >
      {busy ? "Thinking it through…" : s.text}
    </button>
  );
}

/**
 * Rally's front door (Nov 25, 2026): "What's the growth decision in front of you?", who to ask (the
 * Rally Collective or one CRO, as cards), the box to type or say it, then suggestions under it. With a
 * conversation under way, "Continue" comes first.
 */
export function RallyEntry({
  start,
  cros,
  collective,
  defaultCroId,
  suggestions,
  firstName,
  companyName,
  continueWith,
  initialQuestion = "",
  voice = { transcribe: false, voiced: false },
}: {
  start: (prev: StartState, formData: FormData) => Promise<StartState>;
  cros: CroCard[];
  collective: CroCard[];
  defaultCroId: string | null;
  suggestions: Suggestion[];
  firstName: string | null;
  companyName: string;
  continueWith: { id: string; title: string } | null;
  /** The challenge they gave when setting up their company, waiting in the box. */
  initialQuestion?: string;
  /** transcribe: speech for browsers without their own recognition; voiced: Rally has a real voice (the greeting). */
  voice?: { transcribe: boolean; voiced: boolean };
}) {
  const [state, action] = useActionState(start, {});
  const [croId, setCroId] = useState(cros.some((c) => c.id === defaultCroId) ? defaultCroId! : "");
  const [text, setText] = useState(initialQuestion);
  const form = useRef<HTMLFormElement>(null);
  const spokenSubmit = useRef(false);
  // Spoken: asked as soon as they pause; the conversation then listens for the reply.
  const dictation = useDictation(text, setText, {
    onSpoken: (said) => {
      const f = form.current;
      if (!f) return;
      voiceMode.on();
      spokenSubmit.current = true;
      flushSync(() => setText(said));
      (f.elements.namedItem("question") as HTMLInputElement).value = "";
      f.requestSubmit(f.querySelector<HTMLButtonElement>("button.btn-primary"));
    },
    transcribe: voice.transcribe,
    greeting: { name: firstName, voiced: voice.voiced },
  });
  const cro = cros.find((c) => c.id === croId) ?? null;
  const who = cro ? cro.name.split(" ")[0] : "Rally";
  return (
    <section aria-label="Start a conversation" className="space-y-7">
      {continueWith && (
        <Link href={`/chat/${continueWith.id}`} className="surface flex items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]">
          <span className="text-sm font-semibold" style={{ color: "var(--green)" }}>Continue</span>
          <span className="flex-1 min-w-0 truncate text-base" style={{ color: "var(--foreground)" }}>{continueWith.title}</span>
          <span aria-hidden style={{ color: "var(--muted-foreground)" }}>→</span>
        </Link>
      )}
      <h1 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>
        What&apos;s the growth decision in front of you{firstName ? `, ${firstName}` : ""}?
      </h1>
      <WhoToAsk cros={cros} collective={collective} value={croId} onChange={setCroId} />
      <form
        ref={form}
        action={action}
        className="space-y-4"
        onSubmit={() => {
          // Sending always switches the microphone off; typed or picked questions end voice mode.
          dictation.cancel();
          if (!spokenSubmit.current) voiceMode.off();
          spokenSubmit.current = false;
        }}
      >
        <input type="hidden" name="cro" value={croId} />
        <input type="hidden" name="question" defaultValue="" />
        <div className="rounded-2xl border p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <label htmlFor="ask-text" className="sr-only">Ask {who}</label>
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
              if (e.key === "Enter" && !e.shiftKey && text.trim()) {
                e.preventDefault();
                const f = e.currentTarget.form!;
                (f.elements.namedItem("question") as HTMLInputElement).value = "";
                f.requestSubmit(f.querySelector<HTMLButtonElement>("button.btn-primary"));
              }
            }}
            className="w-full text-base resize-none outline-none bg-transparent"
            placeholder={`Ask ${who} anything about growing ${companyName}…`}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Type or talk</span>
            <span className="flex items-center gap-2">
              <DictateButton d={dictation} />
              <Send />
            </span>
          </div>
        </div>
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>Or start with one of these</div>
            <div role="group" aria-label="Suggested questions" className="grid sm:grid-cols-2 gap-2">
              {suggestions.map((s) => (
                <SuggestionButton key={s.text} s={s} />
              ))}
            </div>
          </div>
        )}
      </form>
      <DictationStatus d={dictation} />
      {state.error && (
        <p role="alert" className="text-base" style={{ color: "var(--red)" }}>
          {state.error}
        </p>
      )}
    </section>
  );
}
