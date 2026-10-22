"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { authClient } from "@/lib/auth/client";

type State = { status: "idle" | "sending" } | { status: "sent"; email: string } | { status: "error"; message: string };

const input = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  name: z.string().trim().max(120).optional(),
});

const inputClass = "w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2";
const inputStyle = { background: "var(--muted)", borderColor: "var(--border)", color: "var(--foreground)" };

export function MagicLinkForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = input.safeParse({ email: form.get("email"), name: form.get("name") || undefined });
    if (!parsed.success) {
      setState({ status: "error", message: parsed.error.issues[0]?.message ?? "Check your details and try again." });
      return;
    }

    setState({ status: "sending" });
    const { email, name } = parsed.data;
    // "/" routes the signed-in user to their home by role. Origin must be a Neon Auth trusted domain.
    const { error } = await authClient.signIn.magicLink({
      email,
      name,
      callbackURL: `${window.location.origin}/`,
    });
    if (error) {
      setState({ status: "error", message: error.message || "We couldn't send your sign-in link. Try again." });
      return;
    }
    setState({ status: "sent", email });
  }

  if (state.status === "sent") {
    return (
      <div className="text-center" style={{ animation: "fadeIn 0.2s ease-out" }}>
        <div className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>Check your email</div>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          We sent a sign-in link to <span className="font-medium" style={{ color: "var(--foreground)" }}>{state.email}</span>.
          It expires shortly, so open it on this device.
        </p>
      </div>
    );
  }

  const pending = state.status === "sending";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "sign-up" && (
        <div>
          <label htmlFor="name" className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-foreground)" }}>
            Your name
          </label>
          <input id="name" name="name" type="text" autoComplete="name" required className={inputClass} style={inputStyle} />
        </div>
      )}
      <div>
        <label htmlFor="email" className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-foreground)" }}>
          Work email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} style={inputStyle} />
      </div>

      {state.status === "error" && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--red-muted)", color: "var(--red)" }}>
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
        style={{ background: "var(--green)", color: "#fff" }}
      >
        {pending ? "Sending link…" : mode === "sign-in" ? "Email me a sign-in link" : "Create account"}
      </button>

      <p className="text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
        {mode === "sign-in" ? (
          <>New to Growth Goaled? <Link href="/sign-up" style={{ color: "var(--green)" }}>Create an account</Link></>
        ) : (
          <>Already have an account? <Link href="/sign-in" style={{ color: "var(--green)" }}>Sign in</Link></>
        )}
      </p>
    </form>
  );
}
