"use client";

import { useEffect, useRef, useState } from "react";

/** The founder whose face and name sit on every conversation and action plan. */
export const FOUNDER = { name: "Ryan Spillane", title: "CEO & Founder", photo: "/team/ryan-spillane.jpg", initials: "RS" };
/** The experience behind the advice, said softly wherever it appears. */
export const PEDIGREE = "Built on a Series A raise, 2 IPOs and 2,000+ startup investments";

/** Ryan's photo, or his initials until the photo file is in public/team/. */
export function FounderAvatar({ size = 40 }: { size?: number }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // An image that failed before React hydrated never fires onError; check once mounted.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  const style = { width: size, height: size, minWidth: size };
  if (failed)
    return (
      <span className="rounded-full flex items-center justify-center font-semibold text-white" style={{ ...style, background: "var(--green)", fontSize: size * 0.38 }} aria-label={FOUNDER.name} role="img">
        {FOUNDER.initials}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small static headshot with a fallback; no optimisation needed
    <img ref={img} src={FOUNDER.photo} alt={FOUNDER.name} width={size} height={size} className="rounded-full object-cover" style={{ ...style, objectPosition: "50% 25%" }} onError={() => setFailed(true)} />
  );
}

/**
 * The person behind the conversation: Ryan's face and name, that a human CRO reviews every action
 * plan (and, when the company has one, that their advisor can join), and the experience it's built on.
 */
export function HumanPresence({ advisorName, variant = "chat" }: { advisorName?: string | null; variant?: "chat" | "plan" }) {
  if (variant === "plan")
    return (
      <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "var(--muted)" }} data-testid="human-presence-plan">
        <FounderAvatar size={48} />
        <div className="min-w-0 text-sm">
          <div style={{ color: "var(--foreground)" }}>
            <strong>{FOUNDER.name}</strong>, {FOUNDER.title}
          </div>
          <div style={{ color: "var(--muted-foreground)" }}>
            Reviewed and approved by a Growth Goaled CRO{advisorName ? ` (${advisorName})` : ""}. {PEDIGREE}.
          </div>
        </div>
      </div>
    );
  return (
    <div className="flex items-center gap-3" data-testid="human-presence">
      <FounderAvatar size={36} />
      <p className="text-sm min-w-0" style={{ color: "var(--muted-foreground)" }}>
        <span style={{ color: "var(--foreground)" }}>
          <strong>{FOUNDER.name}</strong>, {FOUNDER.title}
        </span>
        {" · "}
        {advisorName ? `Your advisor, ${advisorName}, can join this conversation, and a CRO reviews every action plan.` : "A real CRO reviews every action plan."}{" "}
        <span>{PEDIGREE}.</span>
      </p>
    </div>
  );
}
