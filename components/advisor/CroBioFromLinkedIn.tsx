"use client";

import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * The professional biography, written by AI from the CRO's LinkedIn profile. LinkedIn doesn't let
 * other sites read a profile from its link, so the CRO drops in the PDF LinkedIn makes ("Save to PDF").
 */
export function CroBioFromLinkedIn({ bio, hasLinkedin, generate }: { bio: string | null; hasLinkedin: boolean; generate: (f: FormData) => Promise<Result<{ bio: string }>> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(bio ?? "");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function send(file: File | undefined) {
    if (!file || busy) return;
    setMsg(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setMsg({ kind: "error", text: "Drop the PDF LinkedIn makes (Save to PDF)." });
    if (file.size > 5 * 1024 * 1024) return setMsg({ kind: "error", text: "That file is over 5 MB." });
    setBusy(true);
    try {
      const f = new FormData();
      f.set("linkedin", file);
      const r = await generate(f);
      if (r.ok) {
        setText(r.bio);
        setMsg({ kind: "ok", text: "Biography written from LinkedIn and saved. Edit it below if you like, then Save profile." });
        router.refresh();
      } else setMsg({ kind: "error", text: r.error });
    } catch {
      setMsg({ kind: "error", text: "That didn't work. Try again." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2" role="group" aria-label="Professional biography">
      <span className="label">Professional biography</span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send(e.dataTransfer.files[0]);
        }}
        aria-label="Drop the LinkedIn PDF"
        className="rounded-lg border-2 border-dashed p-4 flex items-center gap-3 flex-wrap text-sm transition-colors"
        style={{ borderColor: over ? "var(--primary)" : "var(--border)", background: over ? "var(--muted)" : "transparent" }}
      >
        <FileUp aria-hidden className="w-6 h-6 shrink-0" style={{ color: "var(--muted-foreground)" }} />
        <div className="flex-1 min-w-[16rem]" style={{ color: "var(--muted-foreground)" }}>
          {busy ? (
            <span style={{ color: "var(--foreground)" }}>Writing the biography from LinkedIn…</span>
          ) : (
            <>
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>Write it from LinkedIn:</span> on {hasLinkedin ? "the" : "your"} LinkedIn profile, click <b>Resources</b> (or <b>More</b>) → <b>Save to PDF</b>, then drop the PDF here or{" "}
              <button type="button" className="link" onClick={() => input.current?.click()}>
                choose it
              </button>
              . LinkedIn doesn&apos;t let other sites read a profile from its link alone.
            </>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="LinkedIn PDF" onChange={(e) => void send(e.target.files?.[0])} />
      {msg && (
        <p role="status" className="text-sm" style={{ color: msg.kind === "error" ? "var(--red)" : "var(--green)" }}>
          {msg.text}
        </p>
      )}
      <textarea name="bio" value={text} onChange={(e) => setText(e.target.value)} rows={5} className="field w-full" aria-label="Professional biography text" />
    </div>
  );
}
