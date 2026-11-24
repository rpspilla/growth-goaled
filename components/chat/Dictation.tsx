"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Speak instead of type (Nov 24, 2026): the browser's own speech recognition writes what the founder
 * says into the box as they talk; they can edit it before sending. Nothing is recorded or stored by
 * us. Browsers without speech recognition (e.g. Firefox) don't show the button.
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

export function useDictation(text: string, setText: (t: string) => void) {
  // Known only in the browser (false on the server and the first render, so they agree).
  const supported = useSyncExternalStore(noop, () => Boolean(recognitionClass()), () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => () => rec.current?.abort(), []);

  const stop = () => rec.current?.stop();
  const start = () => {
    const R = recognitionClass();
    if (!R) return;
    setError(null);
    const base = textRef.current.trimEnd();
    let finals = "";
    const r = new R();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const said = res[0]?.transcript ?? "";
        if (res.isFinal) finals = join(finals, said.trim());
        else interim = join(interim, said.trim());
      }
      setText(join(base, join(finals, interim)));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Allow microphone access in your browser to speak your question.");
      else if (e.error === "audio-capture") setError("No microphone was found.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError("Speech didn't come through. Try again, or type it.");
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      setText(join(base, finals));
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Speech didn't start. Try again, or type it.");
    }
  };
  return { supported, listening, error, toggle: () => (listening ? stop() : start()), stop };
}

/** The microphone button next to a question box. */
export function DictateButton({ d, disabled, className = "" }: { d: ReturnType<typeof useDictation>; disabled?: boolean; className?: string }) {
  if (!d.supported) return null;
  return (
    <button
      type="button"
      onClick={d.toggle}
      disabled={disabled}
      aria-pressed={d.listening}
      aria-label={d.listening ? "Stop speaking" : "Speak your question"}
      title={d.listening ? "Stop" : "Speak instead of typing"}
      className={`btn shrink-0 inline-flex items-center justify-center ${d.listening ? "motion-safe:animate-pulse" : "btn-secondary"} ${className}`}
      style={d.listening ? { background: "var(--red)", color: "#fff" } : undefined}
    >
      {d.listening ? <Square size={16} aria-hidden /> : <Mic size={18} aria-hidden />}
    </button>
  );
}

/** "Listening…" or what went wrong, under the box. */
export function DictationStatus({ d }: { d: ReturnType<typeof useDictation> }) {
  if (d.error) return <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{d.error}</p>;
  if (d.listening) return <p role="status" className="text-sm" style={{ color: "var(--muted-foreground)" }}>Listening… tap stop when you&apos;re done, then edit or send.</p>;
  return null;
}
