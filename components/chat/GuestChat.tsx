"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ArrowUp, Lock } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import type { RecommendationCard } from "@/lib/db/schema";
import { trackSignupEvent } from "@/app/(auth)/actions";
import { RecommendationCardView } from "./RecommendationCardView";

type Result = { ok: boolean; error?: string };
export type GuestViewData = {
  messages: { role: "user" | "assistant"; content: string }[];
  step: { key: string; kind: "text" | "choice" | "select" | "number"; options: readonly { value: string; label: string }[] | null; optional: boolean; placeholder: string | null } | null;
  card: RecommendationCard | null;
  unlocked: boolean;
  email: string | null;
  outOfTurns: boolean;
};

/**
 * The sign-in page's conversation: "How can we help you grow?", the sign-up questions one at a time
 * (typed like any chat reply: no buttons or dropdowns),
 * then the AI's recommendation, blurred until the visitor gives an email (which also sends the
 * sign-in link that saves it all to their account).
 */
export function GuestChat({ view, reply, giveEmail, restart }: { view: GuestViewData; reply: (text: string) => Promise<Result>; giveEmail: (email: string) => Promise<Result>; restart: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const aiPhase = !view.step;
  // When the recommendation first appears, take the founder back to the top where it is; otherwise
  // keep the latest exchange (and the answer box under it) in view.
  const shownCard = useRef(view.card?.takeaway ?? null);
  useEffect(() => {
    const takeaway = view.card?.takeaway ?? null;
    if (takeaway && takeaway !== shownCard.current) {
      shownCard.current = takeaway;
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (view.messages.length > 1) end.current?.scrollIntoView({ block: "end" });
  }, [view.messages.length, sent, view.card?.takeaway]);
  // The sign-up funnel's first step, counted once per page view (the ref survives dev double-mounts).
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    void trackSignupEvent("signup_viewed");
  }, []);

  const send = (value: string) =>
    start(async () => {
      setError(null);
      setSent(value);
      setText("");
      if (input.current) input.current.style.height = "auto";
      const r = await reply(value);
      if (!r.ok) {
        setText(value);
        setError(r.error ?? "Something went wrong.");
      }
      setSent(null);
      router.refresh();
      input.current?.focus();
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!text.trim()) return;
    send(text);
  };

  const step = view.step;
  return (
    <div className="flex flex-col gap-4 w-full">
      <h2 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>{view.messages[0]?.content}</h2>
      {view.card && <GuestCard card={view.card} unlocked={view.unlocked} email={view.email} giveEmail={giveEmail} />}
      <ol className="space-y-3" aria-label="Conversation">
        {view.messages.map((m, i) =>
          i === 0 ? null : 
          m.role === "user" ? (
            <li key={i} className="flex justify-end">
              <p className="rounded-2xl px-4 py-2.5 text-base max-w-[85%] whitespace-pre-wrap" style={{ background: "var(--navy)", color: "#fff" }}>{m.content}</p>
            </li>
          ) : (
            <li key={i}>
              <p className="text-base whitespace-pre-wrap leading-relaxed" style={{ color: "var(--foreground)" }}>{m.content}</p>
            </li>
          ),
        )}
        {sent && (
          <li className="flex justify-end">
            <p className="rounded-2xl px-4 py-2.5 text-base max-w-[85%] whitespace-pre-wrap" style={{ background: "var(--navy)", color: "#fff" }}>{sent}</p>
          </li>
        )}
        {/* The last sign-up answer (customer success) hands over to the AI, as does any reply after it. */}
        {pending && sent !== null && (
          <li role="status" className="text-base flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
            <span className="flex gap-1" aria-hidden>
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted-foreground)", animationDelay: `${d}ms` }} />
              ))}
            </span>
            {aiPhase || step?.key === "cs" ? "Thinking it through…" : <span className="sr-only">Typing…</span>}
          </li>
        )}
      </ol>

      <form onSubmit={submit} className="rounded-2xl p-2 pl-4 flex items-end gap-2 focus-within:ring-2 focus-within:ring-[var(--green)]" style={{ border: "1px solid var(--border)", background: "var(--card)", boxShadow: "0 1px 3px rgba(13,27,42,0.06)" }}>
        <label htmlFor="guest-input" className="sr-only">Your answer</label>
        <textarea
          id="guest-input"
          ref={input}
          rows={1}
          maxLength={2000}
          className="guest-composer flex-1 resize-none bg-transparent py-2 text-base max-h-48"
          style={{ color: "var(--foreground)", border: 0, boxShadow: "none", outline: "none" }}
          value={text}
          autoFocus
          placeholder={view.outOfTurns ? "Enter your email above to keep going" : (step?.placeholder ?? "Reply…")}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
          disabled={view.outOfTurns}
        />
        <button type="submit" aria-label="Send" title="Send" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40" style={{ background: "var(--navy)", color: "#fff" }} disabled={pending || !text.trim() || view.outOfTurns}>
          <ArrowUp size={18} aria-hidden />
        </button>
      </form>

      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
      {view.messages.length > 1 && (
        <button type="button" className="text-sm link self-start" onClick={() => start(async () => (await restart(), router.refresh()))}>
          Start over
        </button>
      )}
      <div ref={end} />
    </div>
  );
}

/** The recommendation, blurred behind an email until the visitor gives one; then the link that saves it. */
function GuestCard({ card, unlocked, email, giveEmail }: { card: RecommendationCard; unlocked: boolean; email: string | null; giveEmail: (email: string) => Promise<Result> }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string }>({ kind: unlocked ? "sent" : "idle" });
  const router = useRouter();

  async function sendLink(address: string) {
    const { error } = await authClient.signIn.magicLink({ email: address, callbackURL: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/claim")}` });
    if (error) throw new Error(error.message ?? "couldn't send");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const r = await giveEmail(value);
    if (!r.ok) return setState({ kind: "error", message: r.error ?? "Check the address and try again." });
    router.refresh();
    try {
      await sendLink(value.trim().toLowerCase());
      setState({ kind: "sent" });
    } catch {
      setState({ kind: "error", message: "Your recommendation is unlocked, but we couldn't send the sign-in link. Try again below." });
    }
  }

  const view = <RecommendationCardView id="guest" card={card} given={[]} deeper={null} />;
  if (!unlocked) {
    const insights = teaserInsights(card);
    return (
      <section className="surface overflow-hidden" data-testid="guest-recommendation" aria-label="Your recommendation" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }}>
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label" style={{ color: "var(--green)" }}>Your recommendation</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--foreground)" }}>{CONFIDENCE[card.confidence.level]}</span>
          </div>
          <p className="font-display text-2xl sm:text-3xl leading-tight" style={{ color: "var(--foreground)" }}>{card.takeaway}</p>
          {insights.length > 0 && (
            <div>
              <h3 className="label mb-2">What we&apos;re seeing</h3>
              <ul className="space-y-2">
                {insights.map((t) => (
                  <li key={t} className="flex gap-2 items-start text-base" style={{ color: "var(--foreground)" }}>
                    <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--green)" }} aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="relative min-h-[27rem]">
          <div aria-hidden inert className="max-h-[27rem] overflow-hidden" style={{ filter: "blur(7px)", pointerEvents: "none", userSelect: "none" }}>{view}</div>
          <div className="absolute inset-0 flex items-start justify-center p-4" style={{ background: "linear-gradient(rgba(247,248,250,0.4), rgba(247,248,250,0.85))" }}>
            <form onSubmit={onSubmit} className="surface p-5 w-full max-w-sm space-y-3 shadow-lg" aria-label="See your recommendation">
              <Lock size={22} className="mx-auto" style={{ color: "var(--green)" }} aria-hidden />
              <h3 className="text-lg font-semibold text-center" style={{ color: "var(--foreground)" }}>See what to do about it</h3>
              <p className="text-sm text-center" style={{ color: "var(--muted-foreground)" }}>Enter your work email for the full recommendation: what to do, your 30/60/90-day plan and how to measure it. We&apos;ll also send a link to save it. No password needed.</p>
              <label htmlFor="guest-email" className="label">Work email</label>
              <input id="guest-email" type="email" required className="field w-full" placeholder="you@company.com" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="email" />
              <button type="submit" className="btn btn-primary w-full" disabled={state.kind === "sending"}>{state.kind === "sending" ? "Unlocking…" : "See my recommendation"}</button>
              {state.kind === "error" && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{state.message}</p>}
            </form>
          </div>
        </div>
      </section>
    );
  }
  return (
    <div className="space-y-3" data-testid="guest-recommendation">
      {view}
      <div className="rounded-xl px-4 py-3 text-base" style={{ background: "var(--green-muted)", color: "var(--foreground)" }} role="status">
        {state.kind === "error" ? (
          <span>{state.message}</span>
        ) : (
          <span>
            We&apos;ve sent a sign-in link to <strong>{email}</strong>. Open it to save this conversation to your account, then build your action plan from here.
          </span>
        )}{" "}
        <button type="button" className="link text-sm" onClick={() => email && sendLink(email).then(() => setState({ kind: "sent" }), () => setState({ kind: "error", message: "We couldn't send the link. Try again in a minute." }))}>
          Send the link again
        </button>
      </div>
    </div>
  );
}

const CONFIDENCE = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" } as const;

/** The two most telling things in the recommendation, shown before the email: what's happening, and the strongest evidence from their own answers. */
export function teaserInsights(card: RecommendationCard): string[] {
  const firm = card.evidence.find((e) => e.kind === "fact" || e.kind === "figure") ?? card.evidence[0];
  return [card.diagnosis, firm?.text].filter((t): t is string => Boolean(t?.trim())).slice(0, 2);
}
