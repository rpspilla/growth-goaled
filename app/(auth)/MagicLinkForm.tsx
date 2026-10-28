"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import { trackSignupEvent } from "./actions";

type State = { status: "idle" | "sending" } | { status: "sent"; email: string } | { status: "error"; message: string };

const emailSchema = z.email("Enter a valid email address, like you@company.com.").trim().toLowerCase();

/** Turns auth errors into plain language, and a category for the funnel (never the address). */
function explain(error: { message?: string; status?: number } | null): { message: string; reason: "rate_limited" | "auth_error" } {
  const m = error?.message ?? "";
  if (error?.status === 429 || /too many|rate/i.test(m)) return { message: "Too many attempts in a short time. Wait a minute, then try again.", reason: "rate_limited" };
  return { message: m ? `We couldn't send your link: ${m}` : "We couldn't send your link. Check the address and try again.", reason: "auth_error" };
}

/**
 * Passwordless email sign-in and sign-up (Neon Auth magic links). Sign-up asks only for a work email;
 * your name and company come next, after you've confirmed the address. `next` is where to land after
 * the link; `lockedEmail` fixes the address (invites only work for the invited email).
 */
export function MagicLinkForm({ mode, next, lockedEmail, cta }: { mode: "sign-in" | "sign-up"; next?: string; lockedEmail?: string; cta?: string }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const started = useRef(false);
  const signup = mode === "sign-up" && !lockedEmail;

  async function send(email: string) {
    setState({ status: "sending" });
    // /auth/callback finishes the session in the browser. Origin must be a Neon Auth trusted domain.
    try {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`,
      });
      if (error) {
        const e = explain(error);
        setState({ status: "error", message: e.message });
        if (signup) void trackSignupEvent("signup_failed", e.reason);
        return;
      }
      setState({ status: "sent", email });
      if (signup) void trackSignupEvent("signup_link_sent");
    } catch {
      setState({ status: "error", message: "We couldn't reach the sign-in service. Check your connection and try again." });
      if (signup) void trackSignupEvent("signup_failed", "network");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(new FormData(event.currentTarget).get("email"));
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      if (signup) void trackSignupEvent("signup_failed", "invalid_email");
      return;
    }
    setFieldError(null);
    if (signup) void trackSignupEvent("signup_submitted");
    await send(parsed.data);
  }

  if (state.status === "sent") {
    return (
      <div role="status" style={{ animation: "fadeIn 0.2s ease-out" }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-5" style={{ background: "var(--green-muted)" }} aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 7l9 6 9-6M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h2 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Check your inbox</h2>
        <p className="text-base mt-2" style={{ color: "var(--muted-foreground)" }}>
          We sent a secure link to <span className="font-semibold" style={{ color: "var(--foreground)" }}>{state.email}</span>. Open it on this device to {signup ? "finish creating your account" : "sign in"}. It expires shortly.
        </p>
        <div className="flex items-center gap-4 mt-6 text-sm">
          <button type="button" className="link" onClick={() => send(state.email)}>Send it again</button>
          {!lockedEmail && <button type="button" className="link" onClick={() => setState({ status: "idle" })}>Use a different email</button>}
        </div>
        <p className="text-sm mt-6" style={{ color: "var(--muted-foreground)" }}>Can&apos;t find it? Check your spam or promotions folder.</p>
      </div>
    );
  }

  const pending = state.status === "sending";
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          defaultValue={lockedEmail}
          readOnly={!!lockedEmail}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "email-error" : undefined}
          onInput={() => {
            if (fieldError) setFieldError(null);
            if (signup && !started.current) {
              started.current = true;
              void trackSignupEvent("signup_started");
            }
          }}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && !emailSchema.safeParse(v).success) setFieldError("That doesn't look like an email address.");
          }}
          className="field"
        />
        {fieldError && <p id="email-error" className="text-sm mt-1.5" style={{ color: "var(--red)" }}>{fieldError}</p>}
      </div>

      {state.status === "error" && (
        <div className="rounded-lg px-3.5 py-2.5 text-sm" role="alert" style={{ background: "var(--red-muted)", color: "#B91C1C" }}>
          {state.message}
        </div>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? "Sending your link…" : (cta ?? (mode === "sign-in" ? "Email me a sign-in link" : "Create account"))}
      </button>
      <p className="text-sm text-center" style={{ color: "var(--muted-foreground)" }}>No password needed. We&apos;ll email you a secure link.</p>

      {!lockedEmail && (
        <p className="text-sm text-center pt-2" style={{ color: "var(--muted-foreground)" }}>
          {mode === "sign-in" ? (
            <>New to Growth Goaled? <Link href="/sign-up" className="link">Create a free account</Link></>
          ) : (
            <>Already have an account? <Link href="/sign-in" className="link">Sign in</Link></>
          )}
        </p>
      )}
    </form>
  );
}
