import { useState, useEffect } from "react";
import { icpSegments } from "../data/mock";

export default function ICP({ onNavigate }: { onNavigate?: (v: string) => void }) {
  const [selected, setSelected] = useState(0);
  const [barWidth, setBarWidth] = useState<Record<number, number>>({});
  const seg = icpSegments[selected];

  useEffect(() => {
    // Animate all bars on mount
    const t = setTimeout(() => {
      const all: Record<number, number> = {};
      icpSegments.forEach((s, i) => { all[i] = s.fitScore; });
      setBarWidth(all);
    }, 150);
    return () => clearTimeout(t);
  }, []);

  function scoreColor(s: number) {
    return s >= 80 ? "var(--green)" : s >= 60 ? "var(--amber)" : "#94A3B8";
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Who should you really be selling to?
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          ICP analysis based on your closed-won data, benchmark cohort, and GTM profile.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Segment list */}
        <div className="space-y-3">
          {icpSegments.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setSelected(i)}
              className="w-full rounded-xl border p-4 text-left transition-all"
              style={{
                background: selected === i ? "var(--navy)" : "var(--card)",
                borderColor: selected === i ? "var(--green)" : "var(--border)",
                transform: selected === i ? "translateX(2px)" : "none",
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div
                  className="text-sm font-semibold"
                  style={{ color: selected === i ? "#fff" : "var(--foreground)" }}
                >
                  {s.name}
                </div>
                {i === 0 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{
                      background: selected === 0 ? "rgba(21,90,60,0.4)" : "var(--green-muted)",
                      color: selected === 0 ? "#6EE7A8" : "var(--green)",
                      fontSize: "10px",
                    }}
                  >
                    Primary ICP
                  </span>
                )}
              </div>
              {/* Score bar */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: selected === i ? "rgba(255,255,255,0.1)" : "var(--muted)" }}>
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${barWidth[i] ?? 0}%`,
                      background: scoreColor(s.fitScore),
                      transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  />
                </div>
                <span
                  className="font-mono text-sm font-bold w-7 text-right"
                  style={{ color: scoreColor(s.fitScore) }}
                >
                  {s.fitScore}
                </span>
              </div>
              <div
                className="text-xs"
                style={{ color: selected === i ? "#6A8DA8" : "var(--muted-foreground)" }}
              >
                {s.description.substring(0, 52)}…
              </div>
            </button>
          ))}

        </div>

        {/* Segment detail */}
        <div className="col-span-2 space-y-4">
          <div
            key={selected}
            className="rounded-xl border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)", animation: "fadeIn 0.2s ease-out" }}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>
                  ICP Segment Analysis
                </div>
                <h2 className="font-display text-2xl font-normal" style={{ color: "var(--foreground)" }}>
                  {seg.name}
                </h2>
                <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{seg.description}</p>
              </div>
              <div className="text-right ml-4">
                <div className="font-mono text-4xl font-semibold" style={{ color: scoreColor(seg.fitScore) }}>{seg.fitScore}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Fit score</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Win Rate", value: seg.winRate },
                { label: "ACV", value: seg.acv },
                { label: "Sales Cycle", value: seg.salesCycle },
                { label: "Retention", value: seg.retention },
                { label: "Expansion", value: seg.expansion },
                { label: "Benchmark Fit", value: seg.benchmarkFit },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg p-3" style={{ background: "var(--muted)" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                  <div className="font-mono font-semibold text-sm" style={{ color: "var(--foreground)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {selected === 0 && (
            <div
              className="rounded-xl p-5 border-l-4"
              style={{ background: "var(--navy)", borderLeftColor: "var(--green)", animation: "fadeInUp 0.3s ease-out" }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--green)" }}>
                Primary ICP Recommendation
              </div>
              <p className="text-base font-medium mb-2" style={{ color: "#E2EAF4" }}>
                Focus GTM resources on Enterprise Technology accounts with 500–5,000 employees.
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#7A98B4" }}>
                This segment delivers the highest combination of win rate, ACV, and retention. Your current deal mix underweights this segment relative to benchmark top performers. Shifting 20–30% of outbound effort here could add $600K–$900K ARR within two quarters.
              </p>
            </div>
          )}

          {selected === 1 && (
            <div
              className="rounded-xl p-5 border-l-4"
              style={{ background: "var(--card)", borderLeftColor: "var(--blue)", animation: "fadeInUp 0.3s ease-out" }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--blue)" }}>
                Secondary ICP
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                Mid-Market SaaS is your current primary segment and a strong secondary target. Maintain focus here while building the Enterprise Technology motion in parallel.
              </p>
            </div>
          )}

          {selected === 2 && (
            <div
              className="rounded-xl p-5 border-l-4"
              style={{ background: "#FFFBEB", borderLeftColor: "var(--amber)", animation: "fadeInUp 0.3s ease-out" }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--amber)" }}>
                Opportunistic — With Caution
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#92400E" }}>
                Financial Services offers high ACV but 142-day sales cycles will stretch your team. Consider only if you have enterprise-dedicated capacity.
              </p>
            </div>
          )}

          {selected === 3 && (
            <div
              className="rounded-xl p-5 border-l-4"
              style={{ background: "#FEF2F2", borderLeftColor: "var(--red)", animation: "fadeInUp 0.3s ease-out" }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--red)" }}>
                Do Not Pursue
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#991B1B" }}>
                SMB segment shows high volume but structurally mismatches your ACV and motion. Expanding here would increase CAC payback and strain CS capacity at this stage.
              </p>
            </div>
          )}
        </div>
      </div>

      {onNavigate && (
        <div className="mt-8 flex justify-end pt-6 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => onNavigate("channels")}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            View Channel Strategy →
          </button>
        </div>
      )}
    </div>
  );
}

