"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendMagicLink, type MagicLinkState } from "./actions";

const inputClass = "w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2";
const inputStyle = { background: "var(--muted)", borderColor: "var(--border)", color: "var(--foreground)" };

export function MagicLinkForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [state, action, pending] = useActionState<MagicLinkState, FormData>(sendMagicLink, { status: "idle" });

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

  return (
    <form action={action} className="space-y-4">
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
