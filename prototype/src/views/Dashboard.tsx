import { useEffect, useState } from "react";
import { acmeAI } from "../data/mock";

interface DashboardProps {
  onNavigate: (view: string) => void;
}

function MetricCard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: "up" | "down" | "neutral" }) {
  return (
    <div
      className="rounded-xl p-5 border"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </div>
      <div className="font-mono text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        {value}
      </div>
      {sub && (
        <div className="flex items-center gap-1 text-xs mt-1" style={{ color: trend === "up" ? "var(--green)" : trend === "down" ? "var(--red)" : "var(--muted-foreground)" }}>
          {trend === "up" && "↑ "}{trend === "down" && "↓ "}{sub}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [scoreWidth, setScoreWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setScoreWidth(72), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
          Monday, August 25, 2026
        </div>
        <h1 className="font-display text-3xl font-normal mb-1" style={{ color: "var(--foreground)" }}>
          Good morning, Acme AI
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Here's where your growth engine stands today.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        <MetricCard label="ARR" value={acmeAI.arrFormatted} sub="72% YoY" trend="up" />
        <MetricCard label="Growth" value={`${acmeAI.growth}%`} sub="YoY rate" trend="up" />
        <MetricCard label="NRR" value={`${acmeAI.nrr}%`} sub="Trailing 12M" trend="neutral" />
        <MetricCard label="ACV" value={acmeAI.avcFormatted} sub="Per customer" trend="neutral" />
        <MetricCard label="Sales Cycle" value={`${acmeAI.salesCycle}d`} sub="Avg. close" trend="down" />
        <MetricCard label="Customers" value={`${acmeAI.customers}`} sub="Active" trend="up" />
      </div>

      {/* GIS + Actions grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Growth Intelligence Score */}
        <div
          className="col-span-1 rounded-xl border p-6 flex flex-col"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--muted-foreground)" }}>
            Growth Intelligence Score
          </div>

          <div className="flex items-end gap-1.5 mb-1">
            <span className="font-mono text-5xl font-semibold leading-none" style={{ color: "var(--foreground)" }}>72</span>
            <span className="text-xl mb-1" style={{ color: "var(--muted-foreground)" }}>/100</span>
          </div>

          {/* Animated score bar */}
          <div className="h-2 rounded-full mb-3 overflow-hidden" style={{ background: "var(--muted)" }}>
            <div
              className="h-2 rounded-full"
              style={{
                width: `${scoreWidth}%`,
                background: "linear-gradient(90deg, var(--green) 0%, #22C55E 100%)",
                transition: "width 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>

          <div className="text-sm font-medium mb-5 leading-snug" style={{ color: "var(--foreground)" }}>
            {acmeAI.gisLabel}
          </div>

          <div className="space-y-4 flex-1">
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--green)" }}>Strengths</div>
              {["Strong growth rate (top 40%)", "Attractive ACV for stage", "Clear market positioning"].map((s) => (
                <div key={s} className="flex items-start gap-2 text-xs mb-1.5" style={{ color: "var(--foreground)" }}>
                  <span style={{ color: "var(--green)", marginTop: "1px" }}>✓</span> {s}
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--amber)" }}>Watch Areas</div>
              {["Sales cycle (+33 days vs. benchmark)", "AE productivity ($360K below top quartile)", "NRR approaching constraint threshold"].map((s) => (
                <div key={s} className="flex items-start gap-2 text-xs mb-1.5" style={{ color: "var(--foreground)" }}>
                  <span style={{ color: "var(--amber)", marginTop: "1px" }}>⚠</span> {s}
                </div>
              ))}
            </div>
            <div
              className="rounded-lg p-3"
              style={{ background: "var(--navy)", borderLeft: "3px solid var(--green)" }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--green)" }}>Priority</div>
              <div className="text-xs leading-relaxed" style={{ color: "#C8D3E0" }}>
                Improve sales efficiency before increasing headcount.
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate("benchmark")}
            className="mt-4 w-full py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            See Why →
          </button>
        </div>

        {/* Right column */}
        <div className="col-span-2 space-y-4">
          {/* Benchmark preview */}
          <div
            className="rounded-xl border p-5 cursor-pointer transition-all hover:shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={() => onNavigate("benchmark")}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Benchmark Position</div>
              <span className="text-xs" style={{ color: "var(--green)" }}>vs. 14 comparable companies →</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "ARR Growth", acme: "72%", top: "89%", status: "behind" },
                { label: "NRR", acme: "108%", top: "119%", status: "behind" },
                { label: "Sales Cycle", acme: "94d", top: "61d", status: "behind" },
              ].map(({ label, acme, top, status }) => (
                <div key={label} className="rounded-lg p-3" style={{ background: "var(--muted)" }}>
                  <div className="text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                  <div className="font-mono font-semibold text-lg" style={{ color: "var(--foreground)" }}>{acme}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: status === "behind" ? "var(--amber)" : "var(--green)" }} />
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Top: {top}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>
              ⚡ Your biggest gap is sales efficiency, not pipeline generation.
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: "ICP Analysis", description: "Enterprise Technology scores 91 fit", cta: "View ICP →", view: "icp", icon: "🎯", status: "ready" },
              { title: "Channel Strategy", description: "Shift ~15% to partnerships", cta: "Explore →", view: "channels", icon: "📡", status: "ready" },
              { title: "Hiring Plan", description: "3 priority hires for Q4–Q2", cta: "See Plan →", view: "hiring", icon: "👥", status: "ready" },
              { title: "Open Questions", description: "2 data conflicts need your input", cta: "Resolve →", view: "questions", icon: "❓", status: "action" },
            ].map(({ title, description, cta, view: v, icon, status }) => (
              <button
                key={title}
                onClick={() => onNavigate(v)}
                className="rounded-xl border p-4 text-left transition-all hover:shadow-sm"
                style={{
                  background: "var(--card)",
                  borderColor: status === "action" ? "var(--amber)" : "var(--border)",
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--foreground)" }}>{title}</div>
                    <div className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>{description}</div>
                    <div className="text-xs font-semibold" style={{ color: status === "action" ? "var(--amber)" : "var(--green)" }}>{cta}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Advisor review */}
          <div
            className="rounded-xl border p-4 flex items-center gap-4"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0"
              style={{ background: "var(--green-muted)", color: "var(--green)" }}
            >
              JS
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--foreground)" }}>
                Jamie Sterling approved your benchmark
              </div>
              <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                "Sales efficiency diagnosis is accurate. I agree with the recommended priority." · 2 hours ago
              </div>
            </div>
            <button
              onClick={() => onNavigate("deliverables")}
              className="text-xs font-medium px-3 py-1.5 rounded-md shrink-0 transition-all hover:bg-opacity-80"
              style={{ background: "var(--muted)", color: "var(--foreground)" }}
            >
              View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
