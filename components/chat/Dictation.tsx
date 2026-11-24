"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { greet, speakingNow, stopSpeaking } from "./Speaker";

/**
 * Talk to Rally (Nov 24, 2026). The browser's own speech recognition writes what the founder says
 * into the box as they talk; browsers without it (Firefox, some phone browsers) record instead and
 * the words come back from /api/transcribe. Either way a pause (or tapping stop) sends it, and
 * sending always switches the microphone off and leaves the box empty. After a spoken question Rally
 * reads its answer aloud and listens again ("voice mode", per browser tab) until they stop without
 * saying anything or type instead. The first tap in a tab plays Rally's greeting, then listens.
 * Nothing is recorded or stored by us beyond the moment of transcription.
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
const canRecord = () => typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

const noop = () => () => {};
const join = (a: string, b: string) => (a && b ? `${a}${/\s$/.test(a) ? "" : " "}${b}` : a || b);

/** How long a pause ends the question. */
export const PAUSE_MS = 1600;
/** Recording mode: give up if nothing is said for this long, and never record longer than this. */
const NOTHING_SAID_MS = 8000;
const MAX_RECORD_MS = 90_000;

const VOICE_KEY = "rally-voice";
const GREETED_KEY = "rally-greeted";
const store = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k) === "1";
    } catch {
      return false;
    }
  },
  set: (k: string, on: boolean) => {
    try {
      if (on) sessionStorage.setItem(k, "1");
      else sessionStorage.removeItem(k);
    } catch {}
  },
};
export const voiceMode = { on: () => store.set(VOICE_KEY, true), off: () => store.set(VOICE_KEY, false), get: () => store.get(VOICE_KEY) };

export function useDictation(
  text: string,
  setText: (t: string) => void,
  opts: {
    onSpoken: (said: string) => void;
    /** Server-side transcription is available (browsers without speech recognition record instead). */
    transcribe?: boolean;
    /** The first tap in a tab plays Rally's greeting first. */
    greeting?: { name: string | null; voiced: boolean } | null;
  },
) {
  const recognition = useSyncExternalStore(noop, () => Boolean(recognitionClass()), () => false);
  const recordable = useSyncExternalStore(noop, canRecord, () => false);
  const supported = recognition || (Boolean(opts.transcribe) && recordable);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const media = useRef<{ recorder: MediaRecorder; stream: MediaStream; ctx: AudioContext; poll: ReturnType<typeof setInterval> } | null>(null);
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

  const release = () => {
    const m = media.current;
    media.current = null;
    if (!m) return;
    clearInterval(m.poll);
    if (m.recorder.state !== "inactive") m.recorder.stop();
    m.stream.getTracks().forEach((t) => t.stop());
    void m.ctx.close().catch(() => {});
  };

  /** Switch the microphone off without writing anything more. */
  const cancel = () => {
    session.current++;
    if (timer.current) clearTimeout(timer.current);
    rec.current?.abort();
    rec.current = null;
    release();
    setListening(false);
    setTranscribing(false);
    setGreeting(false);
  };
  useEffect(
    () => () => {
      session.current++;
      rec.current?.abort();
      rec.current = null;
      release();
    },
    [],
  );

  const sendOrEnd = (id: number, base: string, said: string) => {
    if (session.current !== id) return;
    cancel();
    if (said.trim()) spoken.current(join(base, said.trim()).trim());
    else {
      // Stopped without a word: voice mode ends, the box keeps what was typed.
      voiceMode.off();
      setText(base);
    }
  };

  const fail = (id: number, quiet: boolean, message: string) => {
    if (session.current !== id) return;
    cancel();
    voiceMode.off();
    if (!quiet) setError(message);
  };

  /** Browsers with speech recognition: words appear as they're said. */
  const startRecognition = (quiet: boolean) => {
    const R = recognitionClass()!;
    const id = ++session.current;
    const base = textRef.current.trimEnd();
    let finals = "";
    const done = () => sendOrEnd(id, base, finals);
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
      if (session.current !== id || e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") fail(id, quiet, "Allow microphone access in your browser to talk to Rally.");
      else if (e.error === "audio-capture") fail(id, quiet, "No microphone was found.");
      else fail(id, quiet, "Speech didn't come through. Try again, or type it.");
    };
    // The browser ended it (a long silence, or Safari's single-phrase mode): same as a pause.
    r.onend = done;
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      fail(id, quiet, "Speech didn't start. Try again, or type it.");
    }
  };

  /** Other browsers: record, end on a pause (measured from the microphone level), then transcribe. */
  const startRecording = async (quiet: boolean) => {
    const id = ++session.current;
    const base = textRef.current.trimEnd();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return fail(id, quiet, "Allow microphone access in your browser to talk to Rally.");
    }
    if (session.current !== id) return stream.getTracks().forEach((t) => t.stop());
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const began = Date.now();
    let heard = false;
    let lastLoud = began;
    const stopAndSend = () => {
      if (session.current !== id || !media.current) return;
      const m = media.current;
      clearInterval(m.poll);
      m.recorder.onstop = async () => {
        m.stream.getTracks().forEach((t) => t.stop());
        void m.ctx.close().catch(() => {});
        media.current = null;
        if (session.current !== id) return;
        setListening(false);
        if (!heard) return sendOrEnd(id, base, "");
        setTranscribing(true);
        try {
          const form = new FormData();
          const type = m.recorder.mimeType || "audio/webm";
          form.set("audio", new File(chunks, `speech.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`, { type }));
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const r = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; text?: string; error?: string };
          if (session.current !== id) return;
          setTranscribing(false);
          if (!r.ok) return fail(id, quiet, r.error ?? "That didn't come through. Try again, or type it.");
          setText(join(base, r.text ?? ""));
          sendOrEnd(id, base, r.text ?? "");
        } catch {
          fail(id, quiet, "That didn't come through. Try again, or type it.");
        }
      };
      if (m.recorder.state !== "inactive") m.recorder.stop();
    };
    finish.current = stopAndSend;
    const poll = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const rms = Math.sqrt(sum / samples.length);
      const now = Date.now();
      if (rms > 0.02) {
        heard = true;
        lastLoud = now;
      }
      if ((heard && now - lastLoud > PAUSE_MS) || (!heard && now - began > NOTHING_SAID_MS) || now - began > MAX_RECORD_MS) stopAndSend();
    }, 100);
    media.current = { recorder, stream, ctx, poll };
    recorder.start(250);
    setListening(true);
  };

  const start = ({ quiet = false } = {}) => {
    if (!supported || rec.current || media.current) return;
    // Talking over Rally stops it reading.
    if (!quiet) stopSpeaking();
    setError(null);
    if (recognition) startRecognition(quiet);
    else void startRecording(quiet);
  };

  return {
    supported,
    listening,
    transcribing,
    greeting,
    error,
    start,
    cancel,
    /** The button: greet (first tap in a tab), start listening, or send what's been said. */
    toggle: () => {
      if (listening) return finish.current();
      if (greeting || speakingNow() === "greeting") {
        // Tapped during the greeting: skip it and listen.
        stopSpeaking();
        setGreeting(false);
        return start();
      }
      if (opts.greeting && !store.get(GREETED_KEY)) {
        store.set(GREETED_KEY, true);
        setGreeting(true);
        greet(opts.greeting.name, opts.greeting.voiced, () => {
          setGreeting(false);
          start({ quiet: false });
        });
        return;
      }
      start();
    },
  };
}

export type Dictation = ReturnType<typeof useDictation>;

/** The microphone button next to a question box. */
export function DictateButton({ d, disabled, className = "", label = "Talk to Rally" }: { d: Dictation; disabled?: boolean; className?: string; label?: string }) {
  if (!d.supported) return null;
  const active = d.listening || d.greeting;
  return (
    <button
      type="button"
      onClick={d.toggle}
      disabled={disabled || d.transcribing}
      aria-pressed={active}
      aria-label={d.listening ? "Stop and send" : d.greeting ? "Skip the greeting and talk" : label}
      title={d.listening ? "Stop and send" : "Talk instead of typing"}
      className={`btn shrink-0 inline-flex items-center justify-center ${active ? "motion-safe:animate-pulse" : "btn-secondary"} ${className}`}
      style={active ? { background: d.greeting ? "var(--green)" : "var(--red)", color: "#fff" } : undefined}
    >
      {d.transcribing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : d.listening ? <Square size={16} aria-hidden /> : <Mic size={18} aria-hidden />}
    </button>
  );
}

/** "Listening…", the greeting, or what went wrong, under the box. */
export function DictationStatus({ d }: { d: Dictation }) {
  if (d.error) return <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{d.error}</p>;
  if (d.greeting) return <p role="status" className="text-sm" style={{ color: "var(--muted-foreground)" }}>Rally is saying hello… it will listen as soon as it&apos;s done (tap to talk now).</p>;
  if (d.transcribing) return <p role="status" className="text-sm" style={{ color: "var(--muted-foreground)" }}>Getting your words…</p>;
  if (d.listening) return <p role="status" className="text-sm" style={{ color: "var(--muted-foreground)" }}>Listening… Rally sends it when you pause. Tap stop to send now.</p>;
  return null;
}
