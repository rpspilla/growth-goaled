interface HiringPlanProps {
  onNavigate?: (v: string) => void;
}

const current = [
  { role: "Account Executive", count: 5, benchmark: 4, icon: "💼" },
  { role: "SDR / BDR", count: 2, benchmark: 3, icon: "📞" },
  { role: "Marketing", count: 1, benchmark: 2, icon: "📣" },
  { role: "Customer Success", count: 1, benchmark: 2, icon: "⭐" },
  { role: "Partner Manager", count: 0, benchmark: 1, icon: "🤝" },
];

const hires = [
  {
    role: "Enterprise AE",
    quarter: "Q4",
    priority: "high",
    rationale: "Current AEs are capacity-constrained. An enterprise-focused AE with $500K–$1M quota capacity would improve sales cycle and ACV simultaneously.",
    impact: "+$520K ARR within 2 quarters",
  },
  {
    role: "Customer Success Manager",
    quarter: "Q1",
    priority: "high",
    rationale: "CS team is one person covering 87 accounts. As NRR trends below top quartile, adding CS capacity reduces churn risk before it compounds.",
    impact: "NRR improvement est. +4–6%",
  },
  {
    role: "Partner Manager",
    quarter: "Q2",
    priority: "medium",
    rationale: "Partnerships channel is significantly underinvested vs. benchmark. A partner manager would enable the channel strategy rebalancing.",
    impact: "Unlocks 28% channel target",
  },
];

export default function HiringPlan({ onNavigate }: HiringPlanProps) {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Who should you hire next?
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Hiring recommendations based on your constraint analysis and benchmark team composition.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Current vs Benchmark */}
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>Current Team</div>
          <div className="space-y-3">
            {current.map(({ role, count, benchmark, icon }) => (
              <div key={role}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: "var(--muted-foreground)" }}>{icon} {role}</span>
                  <span className="font-mono font-semibold" style={{ color: "var(--foreground)" }}>{count} / {benchmark}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--muted)" }}>
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${Math.min(100, (count / benchmark) * 100)}%`,
                      background: count >= benchmark ? "var(--green)" : count === 0 ? "var(--red)" : "var(--amber)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs mt-4 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            Bar shows headcount relative to benchmark median. Over-indexed in AEs; under-indexed in CS and partnerships.
          </p>
        </div>

        {/* Hire recommendations */}
        <div className="col-span-2 space-y-4">
          <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Recommended Hires</div>
          {hires.map(({ role, quarter, priority, rationale, impact }) => (
            <div
              key={role}
              className="rounded-xl border p-5"
              style={{
                background: "var(--card)",
                borderColor: priority === "high" ? "var(--green)" : "var(--border)",
                borderLeftWidth: priority === "high" ? "3px" : "1px",
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{role}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: priority === "high" ? "var(--green-muted)" : "var(--secondary)",
                        color: priority === "high" ? "var(--green)" : "var(--muted-foreground)",
                      }}
                    >
                      {priority === "high" ? "High priority" : "Medium"}
                    </span>
                  </div>
                </div>
                <span
                  className="text-xs font-semibold font-mono px-2.5 py-1 rounded-lg"
                  style={{ background: "var(--navy)", color: "#6EE7A8" }}
                >
                  {quarter}
                </span>
              </div>
              <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--muted-foreground)" }}>{rationale}</p>
              <div
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: "var(--green-muted)", color: "var(--green)" }}
              >
                ↑ {impact}
              </div>
            </div>
          ))}

          {/* Timeline */}
          <div
            className="rounded-xl border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>Hire Timeline</div>
            <div className="flex items-center gap-2">
              {["Q4 2025", "Q1 2026", "Q2 2026"].map((q, i) => (
                <div key={q} className="flex items-center gap-2 flex-1">
                  <div className="flex-1">
                    <div
                      className="rounded-lg p-3 text-center"
                      style={{
                        background: i === 0 ? "var(--navy)" : i === 1 ? "var(--green-muted)" : "var(--muted)",
                      }}
                    >
                      <div
                        className="font-mono text-xs font-bold mb-1"
                        style={{ color: i === 0 ? "#6EE7A8" : i === 1 ? "var(--green)" : "var(--muted-foreground)" }}
                      >
                        {q}
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: i === 0 ? "#C8D3E0" : "var(--muted-foreground)" }}
                      >
                        {i === 0 ? "Enterprise AE" : i === 1 ? "CS Manager" : "Partner Mgr"}
                      </div>
                    </div>
                  </div>
                  {i < 2 && <div className="text-lg" style={{ color: "var(--muted-foreground)" }}>→</div>}
                </div>
              ))}
            </div>
            <p className="text-xs mt-4" style={{ color: "var(--muted-foreground)" }}>
              Hiring should follow the constraint, not simply the growth target.
            </p>
          </div>
        </div>
      </div>

      {onNavigate && (
        <div className="mt-8 flex items-center justify-between pt-6 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Hiring plan reviewed and approved by your advisor before release.
          </p>
          <button
            onClick={() => onNavigate("deliverables")}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            View All Deliverables →
          </button>
        </div>
      )}
    </div>
  );
}
