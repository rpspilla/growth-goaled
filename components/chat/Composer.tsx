"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { ok: boolean; error?: string };

/** The founder's reply box. Shows their message straight away while the answer is prepared. */
export function Composer({
  conversationId,
  send,
  retry,
  awaitingAnswer,
}: {
  conversationId: string;
  send: (conversationId: string, text: string) => Promise<Result>;
  retry: (conversationId: string) => Promise<Result>;
  /** The last message is the founder's and has no answer (an earlier turn failed). */
  awaitingAnswer: boolean;
}) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<Result>, message: string | null) =>
    start(async () => {
      setError(null);
      setSent(message);
      const r = await fn();
      if (r.ok) setText("");
      else setError(r.error ?? "Something went wrong.");
      setSent(null);
      router.refresh();
    });

  const submit = () => {
    const t = text.trim();
    if (t && !pending) run(() => send(conversationId, t), t);
  };

  return (
    <div className="space-y-3">
      {sent && (
        <div className="flex justify-end">
          <p className="rounded-2xl px-4 py-3 text-base max-w-[85%] whitespace-pre-wrap" style={{ background: "var(--navy)", color: "#fff" }}>{sent}</p>
        </div>
      )}
      {pending && (
        <p className="text-base" role="status" style={{ color: "var(--muted-foreground)" }}>
          Thinking it through with what we know about your company…
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-lg px-4 py-3 text-base flex items-center gap-3 flex-wrap" style={{ background: "var(--red-muted, var(--muted))", color: "var(--foreground)" }}>
          <span className="flex-1">{error}</span>
        </div>
      )}
      {awaitingAnswer && !pending && (
        <button type="button" className="btn btn-secondary" onClick={() => run(() => retry(conversationId), null)}>
          Get the answer again
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="surface p-3 flex gap-3 items-end"
      >
        <label htmlFor="chat-reply" className="sr-only">Your reply</label>
        <textarea
          id="chat-reply"
          rows={2}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Reply, add detail, or ask a follow-up…"
          className="field flex-1 resize-y"
          disabled={pending}
        />
        <button type="submit" className="btn btn-primary" disabled={pending || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
