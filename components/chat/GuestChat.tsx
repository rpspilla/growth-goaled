"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ArrowUp, Check, Loader2, Lock, Mail } from "lucide-react";
import { SPIN_UP, type GuestStep } from "@/lib/guest/steps";
import { understand } from "@/lib/guest/understand";
import { authClient } from "@/lib/auth/client";
import type { RecommendationCard } from "@/lib/db/schema";
import { trackSignupEvent } from "@/app/(auth)/actions";
import { RecommendationCardView } from "./RecommendationCardView";
import { HumanPresence } from "@/components/brand/HumanPresence";

type Result = { ok: boolean; error?: string };
export type GuestViewData = {
  messages: { role: "user" | "assistant"; content: string }[];
  step: { key: string; kind: "text" | "choice" | "select" | "number"; options: readonly { value: string; label: string }[] | null; optional: boolean; placeholder: string | null } | null;
  card: RecommendationCard | null;
  /** They've given their email: the next step is the sign-in link in their inbox. */
  emailed: boolean;
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
export function GuestChat({ view, reply, giveEmail, restart }: { view: GuestViewData; reply: (text: string) => Promise<Result>; giveEmail: (email: string) => Promise<Result>; restart: () => Promise<void> }) {
  const [text, setText] = useState("");
  // The message on its way, shown straight away (outside the transition, whose updates React holds
  // until the server answers) until the transcript has it.
  const [outgoing, setOutgoing] = useState<{ text: string; base: number } | null>(null);
  const sent = outgoing && view.messages.length === outgoing.base ? outgoing.text : null;
  const [error, setError] = useState<string | null>(null);
  // Set by "Get a CRO-built GTM action plan": the sign-in link then opens at the plan offer.
  const [planIntent, setPlanIntent] = useState(false);
  // Whether the sign-in link went out when they gave their email (null: not tried in this visit).
  const [linkSent, setLinkSent] = useState<boolean | null>(null);
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
  // With a recommendation waiting behind the email, only the recommendation and the email box show.
  const locked = Boolean(view.card);
  // The last sign-up answer (if it reads as one) hands over to the AI: say so, and show it working.
  const spinningUp = Boolean(step && sent !== null && step.key === LAST_STEP && understand({ ...step, options: step.options ?? undefined } as GuestStep, sent) !== null);
  // Email given: the full recommendation is behind the sign-in link, so send them to their inbox.
  if (view.emailed && view.email) return <CheckInbox email={view.email} card={view.card} company={view.companyName} planIntent={planIntent} giveEmail={giveEmail} firstSend={linkSent} />;
  return (
    <div className="flex flex-col gap-4 w-full">
      <h2 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>{view.messages[0]?.content}</h2>
      <HumanPresence />
      {view.card && <GuestCard card={view.card} giveEmail={giveEmail} planIntent={planIntent} onSent={setLinkSent} cta={<PlanCta company={view.companyName} onIntent={() => setPlanIntent(true)} where="card" />} />}
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
      {view.card && <PlanCta company={view.companyName} onIntent={() => setPlanIntent(true)} where="chat" />}
      <div ref={end} />
    </div>
  );
}

/** The recommendation's teaser, blurred behind an email: giving it sends the sign-in link to the full recommendation. */
function GuestCard({ card, giveEmail, planIntent, onSent, cta }: { card: RecommendationCard; giveEmail: (email: string) => Promise<Result>; planIntent: boolean; onSent: (sent: boolean) => void; cta: React.ReactNode }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" } | { kind: "error"; message: string }>({ kind: "idle" });
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    const r = await giveEmail(value);
    if (!r.ok) return setState({ kind: "error", message: r.error ?? "Check the address and try again." });
    // Send the link, then show the inbox screen (it offers to send again if this didn't go out).
    onSent(await sendSignInLink(value.trim().toLowerCase(), planIntent).then(() => true, () => false));
    router.refresh();
  }

  const view = <RecommendationCardView id="guest" card={card} given={[]} deeper={null} />;
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
              <p className="text-sm text-center" style={{ color: "var(--muted-foreground)" }}>Enter your work email and we&apos;ll send you a sign-in link to the full recommendation: what to do, your 30/60/90-day plan and how to measure it. No password needed.</p>
              <label htmlFor="guest-email" className="label">Work email</label>
              <input id="guest-email" type="email" required className="field w-full" placeholder="you@company.com" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="email" />
              <button type="submit" className="btn btn-primary w-full" disabled={state.kind === "sending"}>{state.kind === "sending" ? "Sending your link…" : "See my recommendation"}</button>
              {state.kind === "error" && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{state.message}</p>}
            </form>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-5 sm:py-6 border-t" style={{ borderColor: "var(--border)" }}>{cta}</div>
      </section>
    );
}

const MAILBOXES: { name: string; href: string; match: RegExp }[] = [
  { name: "Gmail", href: "https://mail.google.com/mail/u/0/#search/growthgoaled", match: /@(gmail|googlemail)\.com$/i },
  { name: "Outlook", href: "https://outlook.office.com/mail/", match: /@(outlook|hotmail|live|msn)\.[a-z.]+$/i },
];

/**
 * After the email: the full recommendation is in the sign-in link, so the page sends them to their
 * inbox (with a reminder of what's waiting), and lets them resend or fix the address.
 */
function CheckInbox({ email, card, company, planIntent, giveEmail, firstSend }: { email: string; card: RecommendationCard | null; company: string | null; planIntent: boolean; giveEmail: (email: string) => Promise<Result>; firstSend: boolean | null }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">(firstSend === false ? "failed" : "idle");
  const [changing, setChanging] = useState(false);
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const resend = async (address: string) => {
    setStatus("sending");
    setStatus(await sendSignInLink(address, planIntent).then(() => "sent" as const, () => "failed" as const));
  };
  const change = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await giveEmail(next);
    if (!r.ok) return setError(r.error ?? "Check the address and try again.");
    setChanging(false);
    await resend(next.trim().toLowerCase());
    router.refresh();
  };
  const own = MAILBOXES.find((m) => m.match.test(email));
  const boxes = own ? [own] : MAILBOXES;
  return (
    <section aria-label="Check your inbox" className="flex flex-col gap-5 w-full">
      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--green-muted)" }}>
        <Mail size={22} style={{ color: "var(--green)" }} aria-hidden />
      </div>
      <div>
        <h2 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>Check your inbox</h2>
        <p className="text-base mt-2" style={{ color: "var(--muted-foreground)" }}>
          We&apos;ve sent a sign-in link to <strong style={{ color: "var(--foreground)" }}>{email}</strong>. Open it to see your full recommendation{company ? ` for ${company}` : ""}: what to do, your 30/60/90-day plan and how to measure it. No password needed.
        </p>
      </div>
      {card && (
        <div className="rounded-xl px-4 py-3" style={{ background: "var(--muted)" }}>
          <div className="label mb-1" style={{ color: "var(--green)" }}>Waiting for you</div>
          <p className="text-base font-medium" style={{ color: "var(--foreground)" }}>{card.takeaway}</p>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {boxes.map((m) => (
          <a key={m.name} href={m.href} target="_blank" rel="noopener" className="btn btn-primary">
            Open {m.name}
          </a>
        ))}
      </div>
      <div className="text-sm space-y-2" style={{ color: "var(--muted-foreground)" }}>
        {status === "failed" && <p role="alert" style={{ color: "var(--red)" }}>We couldn&apos;t send the link just now. Try sending it again.</p>}
        {status === "sent" && <p role="status" style={{ color: "var(--green)" }}>Sent again. It can take a minute; check spam too.</p>}
        <p>
          Not there after a minute? Check spam, or{" "}
          <button type="button" className="link" disabled={status === "sending"} onClick={() => resend(email)}>
            {status === "sending" ? "sending…" : "send the link again"}
          </button>
          .
        </p>
        {changing ? (
          <form onSubmit={change} className="flex gap-2 flex-wrap items-end" aria-label="Use a different email">
            <label htmlFor="guest-email-change" className="sr-only">Work email</label>
            <input id="guest-email-change" type="email" required className="field flex-1 min-w-[14rem]" placeholder="you@company.com" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="email" />
            <button type="submit" className="btn btn-secondary">Send the link</button>
            {error && <p role="alert" className="w-full" style={{ color: "var(--red)" }}>{error}</p>}
          </form>
        ) : (
          <p>
            Wrong address?{" "}
            <button type="button" className="link" onClick={() => setChanging(true)}>
              Use a different email
            </button>
          </p>
        )}
      </div>
    </section>
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
 * It takes them to the email box; the sign-in link they get then opens at the plan offer.
 */
function PlanCta({ company, onIntent, where }: { company: string | null; onIntent: () => void; where: "card" | "chat" }) {
  const label = `Get a CRO-Built GTM action plan for ${company ?? "your company"}`;
  const click = () => {
    onIntent();
    const box = document.getElementById("guest-email") as HTMLInputElement | null;
    box?.scrollIntoView({ behavior: "smooth", block: "center" });
    box?.focus({ preventScroll: true });
  };
  return (
    <div data-testid={`plan-cta-${where}`}>
      <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={click}>
        {label}
      </button>
    </div>
  );
}
