"use client";

import { useState, useTransition } from "react";

export function AdvisoryRequestForm({
  useCase,
  request,
}: {
  useCase: string;
  request: (useCase: string, message: string) => Promise<{ ok: true; created: boolean } | { ok: false; error: string }>;
}) {
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<null | "created" | "exists">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) {
    return (
      <p className="text-sm" role="status" style={{ color: "var(--green)" }}>
        {done === "created" ? "Thanks. We'll email you within two working days to find a time." : "You've already asked recently; we'll be in touch soon."}
      </p>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await request(useCase, message);
          if (res.ok) setDone(res.created ? "created" : "exists");
          else setError(res.error);
        });
      }}
    >
      <label htmlFor="advisory-message" className="block text-sm font-medium" style={{ color: "var(--foreground)" }}>What would you like to work through? (optional)</label>
      <textarea
        id="advisory-message"
        rows={4}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm"
        style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
        placeholder="e.g. Which of the recommendations to tackle first, and whether to hire this quarter"
      />
      <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "var(--green)", color: "#fff" }}>
        {pending ? "Sending…" : "Request a session"}
      </button>
      {error && <p className="text-xs" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </form>
  );
}
