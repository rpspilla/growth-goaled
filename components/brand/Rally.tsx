/** Rally's mark: a green tile with a rising chevron (Rally Beta, Nov 24, 2026). */
export function RallyMark({ size = 28 }: { size?: number }) {
  return (
    <span className="rounded-lg flex items-center justify-center shrink-0" style={{ width: size, height: size, background: "var(--green)" }} aria-hidden>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 16 16" fill="none">
        <path d="M2.5 11.5 6.5 7.5 9 10l4.5-5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 4.5h3.5V8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** "Rally | Beta", with "By Growth Goaled" under it. `tone` is the background it sits on. */
export function RallyLogo({ tone = "dark", byline = true, size = 28 }: { tone?: "dark" | "light"; byline?: boolean; size?: number }) {
  const fg = tone === "dark" ? "#fff" : "var(--foreground)";
  const sub = tone === "dark" ? "#8FA3B8" : "var(--muted-foreground)";
  return (
    <span className="flex items-center gap-2.5">
      <RallyMark size={size} />
      <span className="leading-tight">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-lg tracking-tight" style={{ color: fg }}>Rally</span>
          <span className="text-[11px] font-semibold px-1.5 py-px rounded-full border" style={{ color: sub, borderColor: tone === "dark" ? "#2A4157" : "var(--border)" }}>Beta</span>
        </span>
        {byline && <span className="block text-xs" style={{ color: sub }}>By Growth Goaled</span>}
      </span>
    </span>
  );
}

export const RALLY = {
  tagline: "Your CRO. Ready when you are.",
  description: "Expert CRO judgment for the decisions that drive your growth. Powered by real revenue leaders, proprietary intelligence, and industry best practices.",
  transparency: "An AI-powered CRO experience built on real operator expertise, proprietary growth frameworks, and the judgment of experienced revenue leaders.",
  beta: "Free during Beta. Help shape the future of CRO support for founders.",
  landing: "1,000s of GTM experiences, brought to you in conversation, so you can get the next decision right.",
  promise: "Experienced operators. Different perspectives. Better growth decisions.",
  /** The one way in (Nov 25, 2026): every sign-up button says this. */
  cta: "Get Access to Rally",
} as const;

/**
 * The Rally lockup at hero size (the landing page): the mark with a soft green glow, a large
 * gradient wordmark, Beta, and "By Growth Goaled".
 */
export function RallyHeroLogo() {
  return (
    <span className="flex items-center gap-4">
      <span className="relative inline-flex">
        <span aria-hidden className="absolute -inset-3 rounded-3xl blur-xl motion-safe:animate-pulse" style={{ background: "radial-gradient(circle, rgba(61,220,151,0.55), transparent 70%)" }} />
        <span className="relative rounded-2xl flex items-center justify-center" style={{ width: 60, height: 60, background: "linear-gradient(135deg, #1A7049 0%, #155A3C 55%, #0E3F2A 100%)", boxShadow: "0 0 0 1px rgba(61,220,151,0.45), 0 10px 30px -8px rgba(61,220,151,0.6)" }} aria-hidden>
          <svg width={34} height={34} viewBox="0 0 16 16" fill="none">
            <path d="M2.5 11.5 6.5 7.5 9 10l4.5-5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 4.5h3.5V8" stroke="#3DDC97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      <span className="leading-none">
        <span className="flex items-center gap-3">
          <span className="font-bold tracking-tight text-[2.75rem] sm:text-5xl" style={{ background: "linear-gradient(90deg, #FFFFFF 0%, #D9FBEA 45%, #3DDC97 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            Rally
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ color: "#3DDC97", border: "1px solid rgba(61,220,151,0.5)", background: "rgba(61,220,151,0.08)" }}>Beta</span>
        </span>
        <span className="block text-sm mt-1.5" style={{ color: "#8FA3B8" }}>By Growth Goaled</span>
      </span>
    </span>
  );
}
