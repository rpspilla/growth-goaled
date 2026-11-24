"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { stopSpeaking } from "./Speaker";

/**
 * Talk to Rally (Nov 24, 2026). The browser's own speech recognition writes what the founder says
 * into the box as they talk; when they pause (or tap stop) it's sent, like a conversation. Sending
 * always switches the microphone off and leaves the box empty. After a spoken question, the
 * microphone opens again for the reply once Rally has answered ("voice mode", per browser tab), until
 * they stop without saying anything or type instead. Nothing is recorded or stored by us; browsers
 * without speech recognition (e.g. Firefox) don't show the button.
 */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const recognitionClass = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const noop = () => () => {};
const join = (a: string, b: string) => (a && b ? `${a}${/\s$/.test(a) ? "" : " "}${b}` : a || b);

/** How long a pause ends the question. */
export const PAUSE_MS = 1600;

const VOICE_KEY = "rally-voice";
export const voiceMode = {
  on: () => {
    try {
      sessionStorage.setItem(VOICE_KEY, "1");
    } catch {}
  },
  off: () => {
    try {
      sessionStorage.removeItem(VOICE_KEY);
    } catch {}
  },
  get: () => {
    try {
      return sessionStorage.getItem(VOICE_KEY) === "1";
    } catch {
      return false;
    }
  },
};

export function useDictation(text: string, setText: (t: string) => void, opts: { onSpoken: (said: string) => void }) {
  // Known only in the browser (false on the server and the first render, so they agree).
  const supported = useSyncExternalStore(noop, () => Boolean(recognitionClass()), () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  // Each listen is a session; a finished or cancelled one can't write to the box any more.
  const session = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useRef<() => void>(() => {});
  const textRef = useRef(text);
  const spoken = useRef(opts.onSpoken);
  useEffect(() => {
    textRef.current = text;
    spoken.current = opts.onSpoken;
  });
  useEffect(
    () => () => {
      session.current++;
      rec.current?.abort();
      rec.current = null;
    },
    [],
  );

  /** Switch the microphone off without writing anything more. */
  const cancel = () => {
    session.current++;
    if (timer.current) clearTimeout(timer.current);
    rec.current?.abort();
    rec.current = null;
    setListening(false);
  };

  const start = ({ quiet = false } = {}) => {
    const R = recognitionClass();
    if (!R || rec.current) return;
    // Talking over Rally stops it reading.
    if (!quiet) stopSpeaking();
    setError(null);
    const id = ++session.current;
    const base = textRef.current.trimEnd();
    let finals = "";
    const done = () => {
      if (session.current !== id) return;
      const said = join(base, finals).trim();
      cancel();
      if (finals.trim()) spoken.current(said);
      else {
        // Stopped without a word: voice mode ends, the box keeps what was typed.
        voiceMode.off();
        setText(base);
      }
    };
    finish.current = done;
    const r = new R();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      if (session.current !== id) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const said = (res[0]?.transcript ?? "").trim();
        if (res.isFinal) finals = join(finals, said);
        else interim = join(interim, said);
      }
      setText(join(base, join(finals, interim)));
      if (timer.current) clearTimeout(timer.current);
      // A pause after something was said: send it.
      if (finals && !interim) timer.current = setTimeout(done, PAUSE_MS);
    };
    r.onerror = (e) => {
      if (session.current !== id) return;
      if (e.error === "no-speech" || e.error === "aborted") return;
      voiceMode.off();
      if (quiet) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Allow microphone access in your browser to talk to Rally.");
      else if (e.error === "audio-capture") setError("No microphone was found.");
      else setError("Speech didn't come through. Try again, or type it.");
    };
    // The browser ended it (a long silence, or Safari's single-phrase mode): same as a pause.
    r.onend = done;
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      voiceMode.off();
      if (!quiet) setError("Speech didn't start. Try again, or type it.");
    }
  };

  return {
    supported,
    listening,
    error,
    start,
    cancel,
    /** The button: start listening, or send what's been said (stop with nothing said ends voice mode). */
    toggle: () => (listening ? finish.current() : start()),
  };
}

export type Dictation = ReturnType<typeof useDictation>;

/** The microphone button next to a question box. */
export function DictateButton({ d, disabled, className = "" }: { d: Dictation; disabled?: boolean; className?: string }) {
  if (!d.supported) return null;
  return (
    <button
      type="button"
      onClick={d.toggle}
      disabled={disabled}
      aria-pressed={d.listening}
      aria-label={d.listening ? "Stop and send" : "Talk to Rally"}
      title={d.listening ? "Stop and send" : "Talk instead of typing"}
      className={`btn shrink-0 inline-flex items-center justify-center ${d.listening ? "motion-safe:animate-pulse" : "btn-secondary"} ${className}`}
      style={d.listening ? { background: "var(--red)", color: "#fff" } : undefined}
    >
      {d.listening ? <Square size={16} aria-hidden /> : <Mic size={18} aria-hidden />}
    </button>
  );
}

/** "Listening…" or what went wrong, under the box. */
export function DictationStatus({ d }: { d: Dictation }) {
  if (d.error) return <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{d.error}</p>;
  if (d.listening) return <p role="status" className="text-sm" style={{ color: "var(--muted-foreground)" }}>Listening… Rally sends it when you pause. Tap stop to send now.</p>;
  return null;
}
