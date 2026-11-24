"use client";

import { Mic, Play, Square, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type Result = { ok: true } | { ok: false; error: string };

const SCRIPT = `Most founders I work with don't have a demand problem. They have a focus problem. When growth stalls, the instinct is to add more: more channels, more reps, more features. I'd rather start with what's already working. Which customers bought fastest, at the best price, and why? What did the founder do in those deals that nobody has written down yet? Once we can answer that, hiring gets easier, the pipeline gets cleaner, and the next ninety days get a lot simpler. So, before we spend another dollar, let's look at the last ten deals you won, and the last ten you lost.`;

/**
 * The CRO's own voice for Rally (Nov 24, 2026): record a minute in the browser (reading a short
 * script) or add recordings, confirm consent, and Rally reads their AI's answers in it. Only the CRO
 * themselves sets it up; founders are told it's an AI voice.
 */
export function CroVoice({
  croId,
  name,
  voiceReady,
  isRallyVoice = false,
  setRally,
  configured,
  link,
  remove,
}: {
  croId: string;
  name: string;
  voiceReady: boolean;
  /** Their voice also speaks for Rally (the Collective, the website chat, the greeting). */
  isRallyVoice?: boolean;
  setRally?: (croId: string, on: boolean) => Promise<Result>;
  configured: boolean;
  link: (croId: string, voiceId: string, consent: boolean) => Promise<Result>;
  remove: (croId: string) => Promise<Result>;
}) {
  const router = useRouter();
  const first = name.split(" ")[0];
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [pending, start] = useTransition();
  const recorder = useRef<MediaRecorder | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function record() {
    setMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        setFiles((f) => [...f, new File(chunks, `recording-${f.length + 1}.${ext}`, { type })]);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      tick.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setMsg({ kind: "error", text: "Allow microphone access in your browser to record." });
    }
  }
  function stopRecording() {
    recorder.current?.stop();
    recorder.current = null;
    if (tick.current) clearInterval(tick.current);
    setRecording(false);
  }
  const addFiles = (list: FileList | null) => {
    const audio = [...(list ?? [])].filter((f) => f.type.startsWith("audio/") || /\.(mp3|m4a|wav|webm|ogg|aac)$/i.test(f.name));
    if (list?.length && !audio.length) setMsg({ kind: "error", text: "Use audio files: MP3, M4A, WAV, WebM or OGG." });
    setFiles((f) => [...f, ...audio].slice(0, 5));
  };

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f, f.name));
      form.set("consent", consent ? "yes" : "no");
      const res = await fetch(`/api/cro-voice/${croId}`, { method: "POST", body: form });
      const r = (await res.json().catch(() => ({ ok: false, error: "The recording didn't arrive. Try again." }))) as Result;
      if (r.ok) {
        setFiles([]);
        setMsg({ kind: "ok", text: "Your voice is ready. Rally will read your AI's answers in it." });
        router.refresh();
      } else setMsg({ kind: "error", text: r.error });
    } finally {
      setBusy(false);
    }
  }

  // Fetched first so a problem (e.g. the API key) can be shown in words, then played.
  const sample = async () => {
    setMsg(null);
    try {
      const res = await fetch(`/api/cro-voice/${croId}?t=${Date.now()}`);
      if (!res.ok) return setMsg({ kind: "error", text: (await res.text()) || "The sample couldn't play." });
      const a = new Audio(URL.createObjectURL(await res.blob()));
      await a.play();
    } catch {
      setMsg({ kind: "error", text: "The sample couldn't play. Check your sound and try again." });
    }
  };

  const total = files.reduce((n, f) => n + f.size, 0);
  const muted = { color: "var(--muted-foreground)" };
  return (
    <section className="surface p-5 space-y-4" aria-label="Your voice">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Your voice</h2>
        <p className="text-sm max-w-3xl" style={muted}>
          {voiceReady
            ? `Rally reads ${first}'s AI answers in your voice. Founders see it's an AI voice built from yours, never you live.`
            : "Record about a minute of yourself and Rally will read your AI's answers in your own voice. Founders see it's an AI voice, never you live."}
        </p>
      </div>
      {!configured && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--amber-muted)", color: "var(--foreground)" }}>
          Voices aren&apos;t switched on yet: an admin adds <code>ELEVENLABS_API_KEY</code> in Vercel (Settings → Environment Variables).
        </p>
      )}
      {voiceReady && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: "var(--green)" }}>✓ Voice ready</span>
          <button type="button" className="btn btn-secondary text-sm py-1.5 inline-flex items-center gap-1.5" onClick={sample}>
            <Play size={14} aria-hidden /> Hear a sample
          </button>
          <button
            type="button"
            className="link text-sm inline-flex items-center gap-1"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await remove(croId);
                setMsg(r.ok ? { kind: "ok", text: "Voice removed." } : { kind: "error", text: r.error });
                router.refresh();
              })
            }
          >
            <Trash2 size={14} aria-hidden /> Remove my voice
          </button>
        </div>
      )}
      {voiceReady && setRally && (
        <label className="flex items-start gap-2 text-sm max-w-3xl rounded-lg px-3 py-2" style={{ background: "var(--green-muted)", color: "var(--foreground)" }}>
          <input
            type="checkbox"
            className="mt-1"
            checked={isRallyVoice}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                const r = await setRally(croId, e.target.checked);
                setMsg(r.ok ? { kind: "ok", text: e.target.checked ? "Rally now speaks in your voice." : "Rally's own voice is back to the standard one." } : { kind: "error", text: r.error });
                router.refresh();
              })
            }
          />
          <span>
            <span className="font-semibold">Use my voice as Rally&apos;s voice.</span> The Collective&apos;s answers, the website chat on the landing page and Rally&apos;s greeting speak in your voice too (labelled as an AI voice). One CRO&apos;s voice at a time.
          </span>
        </label>
      )}

      <div className="space-y-3">
        <h3 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{voiceReady ? "Re-record it" : "Record yourself"}</h3>
        <p className="text-sm" style={muted}>Somewhere quiet, at your normal pace. Read this aloud (about a minute):</p>
        <blockquote className="text-base rounded-lg px-4 py-3 max-w-3xl" style={{ background: "var(--muted)", color: "var(--foreground)" }}>{SCRIPT}</blockquote>
        <div className="flex items-center gap-3 flex-wrap">
          {recording ? (
            <button type="button" className="btn text-sm inline-flex items-center gap-1.5 motion-safe:animate-pulse" style={{ background: "var(--red)", color: "#fff" }} onClick={stopRecording}>
              <Square size={14} aria-hidden /> Stop recording ({seconds}s)
            </button>
          ) : (
            <button type="button" className="btn btn-secondary text-sm inline-flex items-center gap-1.5" onClick={record} disabled={busy}>
              <Mic size={16} aria-hidden /> {files.length ? "Record another" : "Start recording"}
            </button>
          )}
          <span className="text-sm" style={muted}>or</span>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              addFiles(e.dataTransfer.files);
            }}
            aria-label="Drop recordings here"
            className="text-sm rounded-lg border-2 border-dashed px-3 py-2 cursor-pointer inline-flex items-center gap-1.5"
            style={{ borderColor: over ? "var(--primary)" : "var(--border)", color: "var(--foreground)" }}
          >
            <Upload size={14} aria-hidden /> Drop or choose recordings (a phone voice memo is fine)
            <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg" multiple className="sr-only" aria-label="Voice recordings" onChange={(e) => addFiles(e.target.files)} />
          </label>
        </div>
        {files.length > 0 && (
          <ul aria-label="Recordings" className="text-sm space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 flex-wrap">
                <span style={{ color: "var(--foreground)" }}>{f.name}</span>
                <span style={muted}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <audio controls src={URL.createObjectURL(f)} className="h-8" />
                <button type="button" className="link" onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <label className="flex items-start gap-2 text-sm max-w-3xl" style={{ color: "var(--foreground)" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>This is my own voice. I agree to Rally creating an AI voice from these recordings (with ElevenLabs) and using it to read my AI CRO&apos;s answers to founders, labelled as an AI voice. I can remove it at any time.</span>
        </label>
        <button type="button" className="btn btn-primary text-sm" disabled={busy || recording || !files.length || !consent || total > 4 * 1024 * 1024} onClick={create}>
          {busy ? "Creating your voice…" : voiceReady ? "Replace my voice" : "Create my voice"}
        </button>
        {total > 4 * 1024 * 1024 && <p className="text-sm" style={{ color: "var(--red)" }}>Up to 4 MB in all: 1–2 minutes is plenty.</p>}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer link">Already made your voice in ElevenLabs? Use its voice ID</summary>
        <div className="flex gap-2 items-center flex-wrap mt-2">
          <input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="field py-1.5 text-sm w-72" placeholder="e.g. 21m00Tcm4TlvDq8ikWAM" aria-label="ElevenLabs voice ID" />
          <button
            type="button"
            className="btn btn-secondary text-sm py-1.5"
            disabled={pending || !voiceId.trim() || !consent}
            onClick={() =>
              start(async () => {
                const r = await link(croId, voiceId, consent);
                setMsg(r.ok ? { kind: "ok", text: "Voice linked." } : { kind: "error", text: r.error });
                if (r.ok) setVoiceId("");
                router.refresh();
              })
            }
          >
            Use this voice
          </button>
          {!consent && <span style={muted}>Tick the consent box above first.</span>}
        </div>
      </details>

      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className="text-sm" style={{ color: msg.kind === "error" ? "var(--red)" : "var(--green)" }}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
