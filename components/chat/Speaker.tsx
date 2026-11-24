"use client";

import { Square, Volume2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { speakableText } from "@/lib/chat/speakable";

/**
 * Rally reads its answers aloud (Nov 24, 2026): in the voice of the CRO who gave it when they've set
 * one up (streamed from /api/speak), otherwise in the browser's own voice. One answer plays at a
 * time; talking or typing stops it.
 */

export type Spoken = { id: string; text: string; voiced: boolean; who: string | null };

let current: { id: string; audio: HTMLAudioElement | null; done: () => void } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function stopSpeaking() {
  if (!current) return;
  const c = current;
  current = null;
  c.audio?.pause();
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  emit();
}

export const speakingNow = () => current?.id ?? null;

function browserVoice(text: string, onEnd: () => void) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return onEnd();
  const said = speakableText(text);
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    clearTimeout(silent);
    clearTimeout(limit);
    onEnd();
  };
  const u = new SpeechSynthesisUtterance(said);
  u.lang = navigator.language || "en-US";
  u.onstart = () => clearTimeout(silent);
  u.onend = end;
  u.onerror = end;
  // Some browsers never start (no voices installed) or never report the end: don't wait forever.
  const silent = setTimeout(end, 3000);
  const limit = setTimeout(end, 5000 + said.split(/\s+/).length * 600);
  synth.speak(u);
}

/** Read one answer aloud; onEnd runs when it finishes (not when it's stopped). */
export function speak(a: Spoken, onEnd?: () => void) {
  stopSpeaking();
  const me = { id: a.id, audio: null as HTMLAudioElement | null, done: () => {} };
  const finish = () => {
    if (current !== me) return;
    current = null;
    emit();
    onEnd?.();
  };
  me.done = finish;
  current = me;
  emit();
  if (a.voiced) {
    const audio = new Audio(`/api/speak/${a.id}`);
    me.audio = audio;
    audio.onended = finish;
    // The CRO's voice didn't come through: the browser's voice reads it instead.
    const fallback = () => current === me && browserVoice(a.text, finish);
    audio.onerror = fallback;
    audio.play().catch(fallback);
  } else browserVoice(a.text, finish);
}

export const useSpeaking = () => useSyncExternalStore(subscribe, () => current?.id ?? null, () => null);

/** "Listen" under an answer; while it plays, says whose AI voice it is. */
export function ListenButton({ answer }: { answer: Spoken }) {
  const playing = useSpeaking() === answer.id;
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => (playing ? stopSpeaking() : speak(answer))}
        aria-pressed={playing}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
        style={{ borderColor: playing ? "var(--green)" : "var(--border)", color: playing ? "var(--green)" : "var(--muted-foreground)", background: playing ? "var(--green-muted)" : "transparent" }}
      >
        {playing ? <Square size={12} aria-hidden /> : <Volume2 size={13} aria-hidden />} {playing ? "Stop" : "Listen"}
      </button>
      {playing && (
        <span role="status" style={{ color: "var(--muted-foreground)" }}>
          {answer.voiced && answer.who ? `Playing ${answer.who}'s AI voice` : "Playing Rally's voice"}
        </span>
      )}
    </span>
  );
}
