"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { ok: true } | { ok: false; error: string };

/** Two founder scenarios the CRO answers in their own words; the AI fills in their philosophy and communication style from them. */
export function CroVoiceQuestions({ questions, answers, generate }: { questions: { q1: string; q2: string }; answers: { q1?: string; q2?: string }; generate: (a: { q1: string; q2: string }) => Promise<Result> }) {
  const router = useRouter();
  const [a, setA] = useState({ q1: answers.q1 ?? "", q2: answers.q2 ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const ready = a.q1.trim().length >= 40 && a.q2.trim().length >= 40;

  async function fill() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await generate(a);
      setMsg(r.ok ? { kind: "ok", text: "Philosophy and communication style filled in from your answers. Review them below, edit anything that isn't you, then Save profile." } : { kind: "error", text: r.error });
      router.refresh();
    } catch {
      setMsg({ kind: "error", text: "That didn't work. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface p-5 space-y-4" aria-label="In your own words">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>In your own words: two questions</h2>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Answer the way you&apos;d talk to the founder. Your answers are the examples the AI uses to fill in every box under Philosophy and How they communicate, and the way it learns to sound like you.
        </p>
      </div>
      {(["q1", "q2"] as const).map((k, i) => (
        <label key={k} className="block">
          <span className="label">Question {i + 1}</span>
          <span className="block text-sm mt-0.5" style={{ color: "var(--foreground)" }}>{questions[k]}</span>
          <textarea name={`voice.${k}`} value={a[k]} onChange={(e) => setA({ ...a, [k]: e.target.value })} rows={6} className="field w-full mt-2" aria-label={`Answer to question ${i + 1}`} />
        </label>
      ))}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" className="btn btn-secondary text-sm py-1.5 inline-flex items-center gap-1.5" onClick={fill} disabled={busy || !ready}>
          <Sparkles aria-hidden className="w-4 h-4" /> {busy ? "Filling in…" : "Fill in philosophy and communication from my answers"}
        </button>
        {!ready && !busy && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Answer both questions in a few sentences first.</span>}
        {msg && (
          <span role="status" className="text-sm" style={{ color: msg.kind === "error" ? "var(--red)" : "var(--green)" }}>
            {msg.text}
          </span>
        )}
      </div>
    </section>
  );
}
