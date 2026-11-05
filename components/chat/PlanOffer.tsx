"use client";

import { useState, useTransition } from "react";
import { CUSTOM, DIAGNOSE, EXECUTE, EXPLORE, type OfferPoint } from "@/lib/plan-offer";

type Buy = (conversationId: string, tier: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;

/**
 * The packaging under a recommendation: Explore (free), Diagnose (the $499 action plan), Execute &
 * Monitor (monthly, with a CRO advisor) and custom projects. Each paid offer can be bought straight
 * away or talked through with an advisor first.
 */
export function PlanOffer({ conversationId, planPrice, supportedPrice, buy, bookHref }: { conversationId: string; planPrice: string; supportedPrice: string; buy: Buy; /** The advisor booking route; the offer is added to it. */ bookHref: string }) {
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = (tier: "plan" | "supported") =>
    start(async () => {
      setError(null);
      setChosen(tier);
      const r = await buy(conversationId, tier);
      if (r.ok) window.location.href = r.url;
      else setError(r.error);
    });
  const explore = () => {
    const box = document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Your reply'], #chat-reply");
    box?.scrollIntoView({ behavior: "smooth", block: "center" });
    box?.focus({ preventScroll: true });
  };

  const points = (list: OfferPoint[]) => (
    <ul className="text-sm divide-y flex-1" style={{ color: "var(--foreground)", borderColor: "var(--border)" }}>
      {list.map((p) => (
        <li key={p.text} className="py-2" style={{ borderColor: "var(--border)" }}>
          {p.text}
          {p.soon && (
            <span className="ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              Coming soon
            </span>
          )}
        </li>
      ))}
    </ul>
  );
  const card = (o: { name: string; tagline: string; lead?: string; points: OfferPoint[] }, price: string, per: string | null, featured: boolean, actions: React.ReactNode) => (
    <div role="group" aria-label={o.name} className="rounded-xl p-5 flex flex-col gap-4" style={{ border: `1px solid ${featured ? "var(--green)" : "var(--border)"}`, boxShadow: featured ? "0 0 0 1px var(--green)" : undefined, background: "var(--card)" }}>
      <div>
        <div className="font-display text-lg" style={{ color: "var(--foreground)" }}>{o.name}</div>
        <div className="mt-2">
          <span className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>{price}</span>
          {per && <span className="text-sm ml-1.5" style={{ color: "var(--muted-foreground)" }}>{per}</span>}
        </div>
        <p className="text-sm italic mt-2" style={{ color: "var(--muted-foreground)" }}>{o.tagline}</p>
      </div>
      {o.lead && <div className="text-sm font-semibold -mb-2" style={{ color: "var(--foreground)" }}>{o.lead}</div>}
      {points(o.points)}
      <div className="flex flex-col gap-2">{actions}</div>
    </div>
  );
  const talk = (offer: string) => (
    <a href={`${bookHref}${bookHref.includes("?") ? "&" : "?"}offer=${offer}`} className="btn btn-secondary w-full text-center">
      Talk to an advisor first
    </a>
  );

  return (
    <section id="build-plan" aria-label="Build my action plan" className="space-y-4 scroll-mt-20">
      <div className="grid md:grid-cols-3 gap-4 items-stretch">
        {card(EXPLORE, "Free", null, false, (
          <button type="button" className="btn btn-secondary w-full" onClick={explore}>
            {EXPLORE.cta}
          </button>
        ))}
        {card(DIAGNOSE, planPrice, "one-time", false, (
          <>
            <button type="button" className="btn btn-primary w-full" disabled={pending} onClick={() => go("plan")}>
              {pending && chosen === "plan" ? "Opening checkout…" : DIAGNOSE.cta}
            </button>
            {talk("diagnose")}
          </>
        ))}
        {card(EXECUTE, supportedPrice, "/month", true, (
          <>
            <button type="button" className="btn btn-primary w-full" disabled={pending} onClick={() => go("supported")}>
              {pending && chosen === "supported" ? "Opening checkout…" : EXECUTE.cta}
            </button>
            {talk("execute")}
          </>
        ))}
      </div>
      <div role="group" aria-label={CUSTOM.name} className="rounded-xl p-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-center" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
        <div>
          <div className="font-display text-lg" style={{ color: "var(--foreground)" }}>{CUSTOM.name}</div>
          <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{CUSTOM.from}</div>
          <p className="text-sm italic mt-1" style={{ color: "var(--muted-foreground)" }}>{CUSTOM.tagline}</p>
        </div>
        <div>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" style={{ color: "var(--foreground)" }}>
            {CUSTOM.points.map((p) => (
              <li key={p} className="flex gap-2 items-start">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--green)" }} aria-hidden />
                {p}
              </li>
            ))}
          </ul>
          <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>{CUSTOM.note}</p>
        </div>
        <a href={`${bookHref}${bookHref.includes("?") ? "&" : "?"}offer=custom`} className="btn btn-secondary">
          {CUSTOM.cta}
        </a>
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </section>
  );
}
