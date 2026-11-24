"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useFormStatus } from "react-dom";
import type { StartState } from "@/app/(founder)/chat/actions";
import type { Suggestion } from "@/lib/chat/suggestions";
import { CroIdentity, type CroCard } from "./CroIdentity";
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
 * Rally's front door (Rally Beta, Nov 24, 2026): who you're talking to (with their face and
 * credentials), "What's the growth decision in front of you?", four suggestions for the company's
 * stage, and the box to type your own. With a conversation under way, "Continue" comes first.
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
}: {
  start: (prev: StartState, formData: FormData) => Promise<StartState>;
  cros: CroCard[];
  collective: CroCard[];
  defaultCroId: string | null;
  suggestions: Suggestion[];
  firstName: string | null;
  companyName: string;
  continueWith: { id: string; title: string } | null;
}) {
  const [state, action] = useActionState(start, {});
  const [croId, setCroId] = useState(cros.some((c) => c.id === defaultCroId) ? defaultCroId! : "");
  const [text, setText] = useState("");
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
      <CroIdentity
        cro={cro}
        collective={collective}
        size="lg"
        action={
          cros.length > 0 && (
            <label className="block">
              <span className="sr-only">Who to ask</span>
              <select value={croId} onChange={(e) => setCroId(e.target.value)} className="field py-1.5 text-sm" aria-label="Who to ask">
                <option value="">Growth Goaled Collective</option>
                {cros.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )
        }
      />
      <h1 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>
        What&apos;s the growth decision in front of you{firstName ? `, ${firstName}` : ""}?
      </h1>
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
        <div role="group" aria-label="Suggested questions" className="grid sm:grid-cols-2 gap-2">
          {suggestions.map((s) => (
            <SuggestionButton key={s.text} s={s} />
          ))}
        </div>
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
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Rally knows {companyName}&apos;s context, so you won&apos;t be asked twice.</span>
            <span className="flex items-center gap-2">
              <DictateButton d={dictation} />
              <Send />
            </span>
          </div>
        </div>
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
