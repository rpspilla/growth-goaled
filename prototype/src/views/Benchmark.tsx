import { useState, useEffect } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { benchmarkMetrics, benchmarkCohort } from "../data/mock";

const radarData = [
  { subject: "Growth", acme: 72, benchmark: 89 },
  { subject: "NRR", acme: 72, benchmark: 90 },
  { subject: "Win Rate", acme: 90, benchmark: 75 },
  { subject: "AE Prod.", acme: 58, benchmark: 85 },
  { subject: "CAC PBK", acme: 55, benchmark: 78 },
  { subject: "Retention", acme: 76, benchmark: 90 },
];

const scoreBreakdown = [
  { label: "Sales efficiency", score: 45 },
  { label: "Growth rate", score: 78 },
  { label: "Retention", score: 71 },
  { label: "Pipeline quality", score: 84 },
];

interface BenchmarkProps {
  onNavigate?: (v: string) => void;
}

export default function Benchmark({ onNavigate }: BenchmarkProps) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [barWidths, setBarWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      const w: Record<string, number> = {};
      scoreBreakdown.forEach(({ label, score }) => { w[label] = score; });
      setBarWidths(w);
    }, 300);
    return () => clearTimeout(t);
  }, []);

  function StatusPill({ status }: { status: string }) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
        style={{
          background: status === "ahead" ? "var(--green-muted)" : "var(--amber-muted)",
          color: status === "ahead" ? "var(--green)" : "var(--amber)",
        }}
      >
        {status === "ahead" ? "↑ Ahead" : "↓ Behind"}
      </span>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Source drawer */}
      {sourceOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSourceOpen(false)}>
          <div
            className="w-96 h-full overflow-y-auto p-6 shadow-2xl"
            style={{ background: "var(--card)", borderLeft: "1px solid var(--border)", animation: "fadeIn 0.15s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="font-semibold" style={{ color: "var(--foreground)" }}>Growth Intelligence Analysis</div>
              <button onClick={() => setSourceOpen(false)} style={{ color: "var(--muted-foreground)", fontSize: "20px", lineHeight: 1 }}>×</button>
            </div>
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>Data Sources</div>
                {["Company-provided operating data", "Uploaded financial model (Q3 2024)", "CRM-derived pipeline metrics", "Growth Goaled benchmark cohort (n=14)", "SaaS Capital Industry Benchmark 2024"].map((s) => (
                  <div key={s} className="flex items-center gap-2.5 py-2 border-b text-sm" style={{ borderColor: "var(--border)" }}>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--green)" }} />
                    {s}
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--green-muted)" }}>
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--green)" }}>Confidence: High</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>5 sources, high consistency. QA Agent verified.</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>Cohort Matching Methodology</div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                  Companies matched using: funding stage, ARR band ($2M–$10M), primary GTM motion (founder-led), vertical (B2B SaaS/AI), ACV range ($30K–$60K), and team structure. Cohort size n=14. Outliers excluded at ±2σ.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          How do you compare?
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          We compared Acme AI against companies with similar stage, ARR, business model and GTM characteristics.
        </p>
      </div>

      {/* Cohort badge */}
      <div
        className="inline-flex items-center gap-4 rounded-xl border px-5 py-3 mb-8 flex-wrap"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Benchmark Cohort</div>
          <div className="font-semibold text-sm mt-0.5" style={{ color: "var(--foreground)" }}>{benchmarkCohort.count} comparable companies</div>
        </div>
        <div className="w-px h-8" style={{ background: "var(--border)" }} />
        {[benchmarkCohort.stage, benchmarkCohort.arrRange, benchmarkCohort.model, benchmarkCohort.gtm].map((tag) => (
          <span
            key={tag}
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main comparison table */}
        <div className="col-span-2 space-y-4">
          <div
            className="rounded-xl border overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="grid grid-cols-4 px-5 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
              {["Metric", "Acme AI", "Top Quartile", "Status"].map((h) => (
                <div key={h} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{h}</div>
              ))}
            </div>

            {benchmarkMetrics.map((row) => (
              <div
                key={row.metric}
                className="grid grid-cols-4 items-center px-5 py-4 border-b cursor-pointer transition-all"
                style={{
                  borderColor: "var(--border)",
                  background: hoveredRow === row.metric ? "var(--muted)" : "var(--card)",
                }}
                onMouseEnter={() => setHoveredRow(row.metric)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => setSourceOpen(true)}
              >
                <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{row.metric}</div>
                <div>
                  <div className="font-mono font-semibold text-sm" style={{ color: "var(--foreground)" }}>{row.acme}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Median: {row.median}</div>
                </div>
                <div className="font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>{row.topQuartile}</div>
                <div className="flex items-center gap-2">
                  <StatusPill status={row.status} />
                  {hoveredRow === row.metric && (
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>View source →</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Key insight */}
          <div
            className="rounded-xl p-5 border-l-4"
            style={{ background: "var(--navy)", borderLeftColor: "var(--green)" }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--green)" }}>
              Growth Intelligence Analysis
            </div>
            <p className="text-base font-medium leading-relaxed mb-2" style={{ color: "#E2EAF4" }}>
              Your biggest gap is sales efficiency, not pipeline generation.
            </p>
            <p className="text-sm leading-relaxed mb-3" style={{ color: "#7A98B4" }}>
              Acme AI outperforms the cohort on win rate, suggesting the top-of-funnel and product are strong. The constraint is in the sales cycle (94 vs. 61 days) and AE productivity ($840K vs. $1.2M). Expanding headcount before fixing efficiency would increase burn without improving growth rate.
            </p>
            <div className="flex items-center gap-4">
              <button
                className="text-xs font-semibold"
                style={{ color: "var(--green)" }}
                onClick={() => setSourceOpen(true)}
              >
                View methodology and sources →
              </button>
              {onNavigate && (
                <button
                  className="text-xs font-semibold"
                  style={{ color: "#5A7A96" }}
                  onClick={() => onNavigate("baseline")}
                >
                  See full baseline →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Radar + scores */}
        <div className="space-y-4">
          <div
            className="rounded-xl border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>Performance Radar</div>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#E2E8F0" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 9, fill: "#64748B" }}
                />
                <Radar
                  name="Benchmark"
                  dataKey="benchmark"
                  stroke="#CBD5E1"
                  fill="#CBD5E1"
                  fillOpacity={0.2}
                  strokeWidth={1.5}
                />
                <Radar
                  name="Acme AI"
                  dataKey="acme"
                  stroke="#155A3C"
                  fill="#155A3C"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "11px" }}
                />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-1 justify-center">
              {[["var(--green)", "Acme AI"], ["#CBD5E1", "Cohort median"]].map(([color, label]) => (
                <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  <div className="w-3 h-0.5 rounded" style={{ background: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Score breakdown */}
          <div
            className="rounded-xl border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>Score Breakdown</div>
            <div className="space-y-3">
              {scoreBreakdown.map(({ label, score }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
                    <span className="font-mono font-semibold" style={{ color: "var(--foreground)" }}>{score}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${barWidths[label] ?? 0}%`,
                        background: score >= 75 ? "var(--green)" : score >= 55 ? "var(--amber)" : "var(--red)",
                        transition: `width ${0.6 + scoreBreakdown.findIndex(s => s.label === label) * 0.1}s cubic-bezier(0.16, 1, 0.3, 1)`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer nav */}
      {onNavigate && (
        <div className="mt-8 flex items-center justify-between pt-6 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Click any row to view sources and methodology.
          </div>
          <button
            onClick={() => onNavigate("baseline")}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            View Baseline →
          </button>
        </div>
      )}
    </div>
  );
}
