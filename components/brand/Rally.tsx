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
} as const;
