import type { PeerMetric } from "@/lib/mockups/acme-hiring";

/**
 * Where the company sits against peers: bottom quartile → median → top quartile on one bar,
 * with a marker for the company. Direction-aware: for lower-is-better metrics the bar is
 * flipped so "better" is always to the right.
 */
export function QuartileBar({ m }: { m: PeerMetric }) {
  const { p25, median, p75 } = m.peers;
  const lo = Math.min(p25, p75, m.value);
  const hi = Math.max(p25, p75, m.value);
  const pad = (hi - lo) * 0.15 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const pos = (v: number) => {
    const t = (v - min) / (max - min);
    return (m.lowerIsBetter ? 1 - t : t) * 100;
  };
  const better = m.lowerIsBetter ? m.value <= median : m.value >= median;
  const top = m.lowerIsBetter ? m.value <= p75 : m.value >= p75;
  const tone = top ? "var(--green)" : better ? "var(--green-light)" : "var(--amber)";
  const word = top ? "Top quartile" : better ? "Above median" : "Below median";
  const a = Math.min(pos(p25), pos(p75));
  const b = Math.max(pos(p25), pos(p75));

  return (
    <div className="py-2" role="img" aria-label={`${m.label}: ${m.display}. Peers: bottom quartile ${m.format(p25)}, median ${m.format(median)}, top quartile ${m.format(p75)}. ${word}.`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{m.label}</span>
        <span className="text-xs font-semibold" style={{ color: tone }}>
          <span className="font-mono">{m.display}</span> · {word}
        </span>
      </div>
      <div className="relative h-7">
        <div className="absolute top-3 left-0 right-0 h-1.5 rounded-full" style={{ background: "var(--muted)" }} />
        <div className="absolute top-3 h-1.5 rounded-full" style={{ left: `${a}%`, width: `${b - a}%`, background: "#CBD5E1" }} />
        <div className="absolute top-2 w-0.5 h-3.5" style={{ left: `${pos(median)}%`, background: "var(--subtle-foreground)" }} />
        <div
          className="absolute top-1 w-4 h-4 -ml-2 rounded-full border-2"
          style={{ left: `${pos(m.value)}%`, background: tone, borderColor: "#fff", boxShadow: "0 0 0 1px " + tone }}
        />
      </div>
      <div className="relative h-4 text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }}>
        <span className="absolute -translate-x-1/2" style={{ left: `${pos(p25)}%` }}>{m.format(p25)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pos(median)}%` }}>{m.format(median)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pos(p75)}%` }}>{m.format(p75)}</span>
      </div>
    </div>
  );
}
