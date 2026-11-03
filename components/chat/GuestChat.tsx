"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ArrowUp, Check, Loader2, Lock } from "lucide-react";
import { SPIN_UP, type GuestStep } from "@/lib/guest/steps";
import { understand } from "@/lib/guest/understand";
import { authClient } from "@/lib/auth/client";
import type { RecommendationCard } from "@/lib/db/schema";
import { trackSignupEvent } from "@/app/(auth)/actions";
import { RecommendationCardView } from "./RecommendationCardView";
import { HumanPresence } from "@/components/brand/HumanPresence";
import { RecommendationLegend } from "./RecommendationLegend";

type Result = { ok: boolean; error?: string };
export type GuestViewData = {
  messages: { role: "user" | "assistant"; content: string }[];
  step: { key: string; kind: "text" | "choice" | "select" | "number"; options: readonly { value: string; label: string }[] | null; optional: boolean; placeholder: string | null } | null;
  card: RecommendationCard | null;
  unlocked: boolean;
  email: string | null;
  companyName: string | null;
  outOfTurns: boolean;
};

/**
 * The sign-in page's conversation: "How can we help you grow?", the sign-up questions one at a time
 * (typed like any chat reply: no buttons or dropdowns),
 * then the AI's recommendation, blurred until the visitor gives an email (which also sends the
 * sign-in link that saves it all to their account).
 */
export function GuestChat({ view, reply, giveEmail, restart, prices }: { view: GuestViewData; reply: (text: string) => Promise<Result>; giveEmail: (email: string) => Promise<Result>; restart: () => Promise<void>; prices: { plan: string; supported: string } }) {
  const [text, setText] = useState("");
  // The message on its way, shown straight away (outside the transition, whose updates React holds
  // until the server answers) until the transcript has it.
  const [outgoing, setOutgoing] = useState<{ text: string; base: number } | null>(null);
  const sent = outgoing && view.messages.length === outgoing.base ? outgoing.text : null;
  const [error, setError] = useState<string | null>(null);
  // Set by "Get a CRO-built GTM action plan": the sign-in link then opens at the plan offer.
  const [planIntent, setPlanIntent] = useState(false);
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

  const send = (value: string) => {
    setError(null);
    setOutgoing({ text: value, base: view.messages.length });
    setText("");
    if (input.current) input.current.style.height = "auto";
    start(async () => {
      const r = await reply(value);
      if (!r.ok) {
        setOutgoing(null);
        setText(value);
        setError(r.error ?? "Something went wrong.");
      }
      router.refresh();
      input.current?.focus();
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pending || sent !== null) return;
    if (!text.trim()) return;
    send(text);
  };

  const step = view.step;
  // With a recommendation still behind the email, only the recommendation and the email box show:
  // the conversation and the chat box come back once they've given it.
  const locked = Boolean(view.card && !view.unlocked);
  // The last sign-up answer (if it reads as one) hands over to the AI: say so, and show it working.
  const spinningUp = Boolean(step && sent !== null && step.key === LAST_STEP && understand({ ...step, options: step.options ?? undefined } as GuestStep, sent) !== null);
  return (
    <div className="flex flex-col gap-4 w-full">
      <h2 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>{view.messages[0]?.content}</h2>
      <HumanPresence />
      {view.card && <GuestCard card={view.card} unlocked={view.unlocked} email={view.email} giveEmail={giveEmail} planIntent={planIntent} cta={<PlanCta company={view.companyName} unlocked={view.unlocked} email={view.email} onIntent={() => setPlanIntent(true)} where="card" />} />}
      {view.card && view.unlocked && <RecommendationLegend stage="recommendation" planPrice={prices.plan} supportedPrice={prices.supported} />}
      {!locked && (
        <>
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
        {sent !== null && (spinningUp ? (
          <li role="status" aria-live="polite" className="space-y-2">
            <p className="text-base flex items-start gap-2 leading-relaxed" style={{ color: "var(--foreground)" }}>
              <Loader2 size={18} className="animate-spin shrink-0 mt-1" style={{ color: "var(--green)" }} aria-hidden />
              <span>{SPIN_UP}</span>
            </p>
            <SpinUpProgress />
          </li>
        ) : (
          <li role="status" className="text-base flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
            <span className="flex gap-1" aria-hidden>
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted-foreground)", animationDelay: `${d}ms` }} />
              ))}
            </span>
            {aiPhase ? "Thinking it through…" : <span className="sr-only">Typing…</span>}
          </li>
        ))}
      </ol>

      <form onSubmit={submit} className="rounded-2xl p-2 pl-4 flex items-end gap-2 focus-within:ring-2 focus-within:ring-[var(--green)]" style={{ border: "1px solid var(--border)", background: "var(--card)", boxShadow: "0 1px 3px rgba(13,27,42,0.06)" }}>
        <label htmlFor="guest-input" className="sr-only">Your answer</label>
        <textarea
          id="guest-input"
          ref={input}
          rows={2}
          maxLength={2000}
          className="guest-composer flex-1 resize-none bg-transparent py-2 text-base max-h-48"
          style={{ color: "var(--foreground)", border: 0, boxShadow: "none", outline: "none" }}
          value={text}
          autoFocus
          placeholder={view.outOfTurns ? "Enter your email above to keep going" : spinningUp ? "Building your recommendation…" : (step?.placeholder ?? "Reply…")}
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
        <button type="submit" aria-label="Send" title="Send" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40" style={{ background: "var(--navy)", color: "#fff" }} disabled={pending || sent !== null || !text.trim() || view.outOfTurns}>
          <ArrowUp size={18} aria-hidden />
        </button>
      </form>

      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
        </>
      )}
      {view.messages.length > 1 && (
        <button type="button" className="text-sm link self-start" onClick={() => start(async () => (await restart(), router.refresh()))}>
          Start over
        </button>
      )}
      {view.card && <PlanCta company={view.companyName} unlocked={view.unlocked} email={view.email} onIntent={() => setPlanIntent(true)} where="chat" />}
      <div ref={end} />
    </div>
  );
}

/** The recommendation, blurred behind an email until the visitor gives one; then the link that saves it. */
function GuestCard({ card, unlocked, email, giveEmail, planIntent, cta }: { card: RecommendationCard; unlocked: boolean; email: string | null; giveEmail: (email: string) => Promise<Result>; planIntent: boolean; cta: React.ReactNode }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string }>({ kind: unlocked ? "sent" : "idle" });
  const router = useRouter();

  const sendLink = (address: string) => sendSignInLink(address, planIntent);

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
        <div className="px-5 sm:px-6 py-5 sm:py-6 border-t" style={{ borderColor: "var(--border)" }}>{cta}</div>
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
      {cta}
    </div>
  );
}

const CONFIDENCE = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" } as const;

/** The two most telling things in the recommendation, shown before the email: what's happening, and the strongest evidence from their own answers. */
export function teaserInsights(card: RecommendationCard): string[] {
  const firm = card.evidence.find((e) => e.kind === "fact" || e.kind === "figure") ?? card.evidence[0];
  return [card.diagnosis, firm?.text].filter((t): t is string => Boolean(t?.trim())).slice(0, 2);
}

const LAST_STEP = "cs";

const SPIN_UP_STEPS = [
  "Reading your answers",
  "Matching you with companies at your stage and in your vertical",
  "Checking your numbers against industry benchmarks",
  "Weighing the options for your situation",
  "Writing your recommendation and 30/60/90-day plan",
];

/**
 * While the first recommendation is written (up to about a minute): a bar that keeps filling, the step
 * it's on, and a running clock, so the wait never looks frozen.
 */
function SpinUpProgress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // Eases towards full without reaching it; the answer replaces this when it's ready.
  const share = Math.min(0.96, 1 - Math.exp(-seconds / 25));
  const at = Math.min(SPIN_UP_STEPS.length - 1, Math.floor(seconds / 11));
  const clock = `0:${String(Math.min(seconds, 59)).padStart(2, "0")}`;
  return (
    <div className="ml-7 space-y-2">
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }} role="progressbar" aria-label="Building your recommendation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, share * 100)}%`, background: "var(--green)", transition: "width 1s linear" }} />
      </div>
      <ol className="space-y-1 text-sm" aria-label="Progress">
        {SPIN_UP_STEPS.slice(0, at + 1).map((label, i) => (
          <li key={label} className="flex items-center gap-2" style={{ color: i === at ? "var(--foreground)" : "var(--muted-foreground)" }}>
            {i === at ? <Loader2 size={14} className="animate-spin shrink-0" style={{ color: "var(--green)" }} aria-hidden /> : <Check size={14} className="shrink-0" style={{ color: "var(--green)" }} aria-hidden />}
            {label}
            {i === at && "…"}
          </li>
        ))}
      </ol>
      <p className="text-xs tabular-nums" style={{ color: "var(--muted-foreground)" }}>
        {seconds < 60 ? clock : "Taking a little longer than usual. Hang tight, it's still working."}
      </p>
    </div>
  );
}

async function sendSignInLink(address: string, plan: boolean) {
  const next = plan ? "/claim?plan=1" : "/claim";
  const { error } = await authClient.signIn.magicLink({ email: address, callbackURL: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` });
  if (error) throw new Error(error.message ?? "couldn't send");
}

/**
 * "Get a CRO-built GTM action plan for <company>": under the recommendation and at the end of the chat.
 * Before the email it takes them to the email box (the link then opens at the plan offer); after it,
 * it sends that link.
 */
function PlanCta({ company, unlocked, email, onIntent, where }: { company: string | null; unlocked: boolean; email: string | null; onIntent: () => void; where: "card" | "chat" }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const label = `Get a CRO-Built GTM action plan for ${company ?? "your company"}`;
  const click = async () => {
    onIntent();
    if (!unlocked || !email) {
      const box = document.getElementById("guest-email") as HTMLInputElement | null;
      box?.scrollIntoView({ behavior: "smooth", block: "center" });
      box?.focus({ preventScroll: true });
      return;
    }
    setState("sending");
    try {
      await sendSignInLink(email, true);
      setState("sent");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="space-y-2" data-testid={`plan-cta-${where}`}>
      <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={state === "sending"} onClick={click}>
        {state === "sending" ? "Sending your link…" : label}
      </button>
      {state === "sent" && (
        <p className="text-sm" role="status" style={{ color: "var(--foreground)" }}>
          We&apos;ve sent a link to <strong>{email}</strong>. Open it to build your action plan{company ? ` for ${company}` : ""}.
        </p>
      )}
      {state === "error" && <p className="text-sm" role="alert" style={{ color: "var(--red)" }}>We couldn&apos;t send the link. Try again in a minute.</p>}
    </div>
  );
}
