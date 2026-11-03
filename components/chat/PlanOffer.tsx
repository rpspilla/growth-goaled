"use client";

import { useState, useTransition } from "react";
import { PLAN_INCLUDES, SUPPORTED_INCLUDES, type OfferPoint } from "@/lib/plan-offer";

type Buy = (conversationId: string, tier: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;

/** Turns the conversation's recommendation into an action plan: $499 once, or $799 a month with an advisor (unlimited chat, 2 hours live a month). */
export function PlanOffer({ conversationId, planPrice, supportedPrice, buy }: { conversationId: string; planPrice: string; supportedPrice: string; buy: Buy }) {
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
  const option = (tier: "plan" | "supported", title: string, price: string, per: string, points: OfferPoint[], primary: boolean) => (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ border: `1px solid ${primary ? "var(--green)" : "var(--border)"}`, background: "var(--card)" }}>
      <div>
        <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{title}</div>
        <div className="mt-1">
          <span className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>{price}</span>
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}> {per}</span>
        </div>
      </div>
      <ul className="text-sm space-y-1 list-disc pl-4 flex-1" style={{ color: "var(--foreground)" }}>
        {points.map((p) => (
          <li key={p.text}>
            {p.text}
            {p.soon && (
              <span className="ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                Coming soon
              </span>
            )}
          </li>
        ))}
      </ul>
      <button type="button" disabled={pending} onClick={() => go(tier)} className={`btn ${primary ? "btn-primary" : "btn-secondary"}`}>
        {pending && chosen === tier ? "Opening checkout…" : tier === "plan" ? "Buy the action plan" : "Start the supported plan"}
      </button>
    </div>
  );
  return (
    <section id="build-plan" aria-label="Build my action plan" className="rounded-xl p-4 sm:p-5 space-y-3 scroll-mt-20" style={{ background: "var(--green-muted)" }}>
      <div>
        <h4 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Build my action plan</h4>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Turn this into a 30/60/90-day plan. We gather what it needs right here in the conversation, files included.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {option("plan", "Action plan", planPrice, "once", PLAN_INCLUDES, false)}
        {option("supported", "Supported plan", supportedPrice, "a month", SUPPORTED_INCLUDES, true)}
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--red)" }}>{error}</p>}
    </section>
  );
}
