import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { channels } from "../data/mock";

const chartData = channels.map((c) => ({
  name: c.name.replace(" / ", "/").replace("Enterprise ", "Ent. "),
  Current: c.current,
  Benchmark: c.benchmark,
  Recommended: c.recommended,
}));

export default function ChannelStrategy({ onNavigate }: { onNavigate?: (v: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);

  return (
    <div className="p-8 max-w-5xl">
      {sourceOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSourceOpen(false)}>
          <div
            className="w-96 h-full overflow-y-auto p-6 shadow-2xl"
            style={{ background: "var(--card)", borderLeft: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="font-semibold" style={{ color: "var(--foreground)" }}>Why this recommendation?</div>
              <button onClick={() => setSourceOpen(false)} style={{ color: "var(--muted-foreground)", fontSize: "20px", lineHeight: 1 }}>×</button>
            </div>
            <div className="space-y-4">
              <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                Top-quartile companies in Acme's benchmark cohort allocate 28% of GTM spend to partnerships vs. Acme's current 12%. Partnerships show 2.3x higher ACV and 31% faster sales cycles in the cohort.
              </p>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>Sources</div>
                {["Benchmark cohort channel analysis (n=14)", "Acme closed-won deal attribution data", "Partner-sourced deal performance vs. direct", "Growth Goaled channel efficiency index"].map((s) => (
                  <div key={s} className="flex items-center gap-2.5 py-2 border-b text-sm" style={{ borderColor: "var(--border)" }}>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--green)" }} />
                    {s}
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--green-muted)" }}>
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--green)" }}>Confidence: High</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Where should the next dollar go?
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Channel allocation analysis based on your GTM data and benchmark cohort performance.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Chart */}
        <div
          className="col-span-2 rounded-xl border p-5"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Channel Allocation (% of GTM spend)</div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded" style={{ background: "#CBD5E1" }} />
                <span style={{ color: "var(--muted-foreground)" }}>Current</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded" style={{ background: "var(--green)" }} />
                <span style={{ color: "var(--muted-foreground)" }}>Recommended</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded" style={{ background: "#E2E8F0" }} />
                <span style={{ color: "var(--muted-foreground)" }}>Benchmark</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2} barCategoryGap="30%">
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px" }}
                formatter={(value) => [`${value}%`]}
              />
              <Bar dataKey="Current" fill="#CBD5E1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Recommended" fill="#155A3C" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Benchmark" fill="#E2E8F0" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Priority list */}
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>Recommended Priority</div>
          <div className="space-y-3">
            {[
              { rank: "1", label: "Partnerships", change: "+16%", dir: "up", color: "var(--green)" },
              { rank: "2", label: "Enterprise outbound", change: "+7%", dir: "up", color: "var(--green)" },
              { rank: "3", label: "Content / organic", change: "−4%", dir: "neutral", color: "var(--muted-foreground)" },
              { rank: "↓", label: "Paid acquisition", change: "−14%", dir: "down", color: "var(--red)" },
              { rank: "↓", label: "Events", change: "−5%", dir: "down", color: "var(--red)" },
            ].map(({ rank, label, change, color }) => (
              <div
                key={label}
                className="flex items-center gap-3 py-2 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <span
                  className="font-mono text-xs font-bold w-5 text-center"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {rank}
                </span>
                <span className="flex-1 text-sm" style={{ color: "var(--foreground)" }}>{label}</span>
                <span className="font-mono text-xs font-semibold" style={{ color }}>{change}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendation card */}
      <div
        className="rounded-xl border-l-4 p-6"
        style={{ background: "var(--navy)", borderLeftColor: "var(--green)" }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--green)" }}>
          Growth Intelligence Recommendation
        </div>
        <p className="text-base font-medium mb-3" style={{ color: "#E2EAF4" }}>
          Shift approximately 15% of GTM investment toward partnerships and enterprise outbound.
        </p>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "#7A98B4" }}>
          Your current paid acquisition spend (21%) is 2.6× the benchmark. Top-quartile companies in your cohort drive disproportionate revenue through partnership channels. Rebalancing would improve CAC payback by an estimated 3–4 months within two quarters.
        </p>
        <button
          className="text-xs font-semibold"
          style={{ color: "var(--green)" }}
          onClick={() => setSourceOpen(true)}
        >
          Why this recommendation? View sources →
        </button>
      </div>

      {onNavigate && (
        <div className="mt-8 flex justify-end pt-6 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => onNavigate("hiring")}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            View Hiring Plan →
          </button>
        </div>
      )}
    </div>
  );
}
