import { useEffect, useState } from "react";

const flowSteps = [
  { label: "Company Data", sub: "Founder-provided metrics, documents, CRM" },
  { label: "Normalized GTM Data", sub: "Standardized across stage, model, ACV" },
  { label: "Cohort Matching", sub: "Algorithmically matched benchmark peers" },
  { label: "Benchmark Intelligence", sub: "Aggregated patterns across 400+ companies" },
  { label: "Better Recommendations", sub: "Precision improves with every new company" },
];

const companyNodes = [
  { x: 12, y: 18, label: "Acme AI" },
  { x: 30, y: 8, label: "Beta Health" },
  { x: 55, y: 12, label: "Gamma Fintech" },
  { x: 75, y: 20, label: "Delta AI" },
  { x: 20, y: 40, label: "Epsilon SaaS" },
  { x: 42, y: 35, label: "Zeta Commerce" },
  { x: 65, y: 42, label: "Eta Robotics" },
  { x: 85, y: 30, label: "Theta Tech" },
  { x: 35, y: 58, label: "Iota Health" },
  { x: 60, y: 65, label: "Kappa AI" },
  { x: 80, y: 58, label: "Lambda SaaS" },
  { x: 10, y: 65, label: "Mu Fintech" },
];

export default function CompoundingIntelligence() {
  const [lit, setLit] = useState<number[]>([]);

  useEffect(() => {
    companyNodes.forEach((_, i) => {
      setTimeout(() => setLit((prev) => [...prev, i]), i * 180 + 400);
    });
  }, []);

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-4"
          style={{ background: "var(--green-muted)", color: "var(--green)" }}
        >
          Network Intelligence
        </div>
        <h1 className="font-display text-3xl font-normal mb-3" style={{ color: "var(--foreground)" }}>
          Every company makes the system smarter.
        </h1>
        <p className="text-base max-w-2xl leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
          As more companies share their anonymized GTM data, Growth Goaled's benchmark intelligence becomes richer, its cohort matching more precise, and its recommendations more accurate.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-8 items-start mb-10">
        {/* Flow diagram */}
        <div className="col-span-2 space-y-2">
          {flowSteps.map(({ label, sub }, i) => (
            <div key={label}>
              <div
                className="rounded-xl p-4 border transition-all"
                style={{
                  background: "var(--card)",
                  borderColor: i === 0 ? "var(--green)" : "var(--border)",
                  borderLeftWidth: i === 0 ? "3px" : "1px",
                }}
              >
                <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--foreground)" }}>{label}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{sub}</div>
              </div>
              {i < flowSteps.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="w-0.5 h-4 rounded" style={{ background: "var(--border)" }} />
                </div>
              )}
            </div>
          ))}
          <div className="flex justify-center py-1">
            <div className="w-0.5 h-4 rounded" style={{ background: "var(--border)" }} />
          </div>
          {/* Loop back */}
          <div
            className="rounded-xl p-4 border"
            style={{ background: "var(--navy)", borderColor: "var(--green)", borderLeftWidth: "3px" }}
          >
            <div className="text-sm font-semibold mb-0.5" style={{ color: "#6EE7A8" }}>More Companies</div>
            <div className="text-xs" style={{ color: "#5A7A96" }}>Network effect compounds with each new company</div>
          </div>
          {/* Arrow back up */}
          <div
            className="mt-2 text-xs font-medium text-center"
            style={{ color: "var(--green)" }}
          >
            ↺ cycle repeats
          </div>
        </div>

        {/* Network visualization */}
        <div className="col-span-3">
          <div
            className="rounded-2xl border p-6 relative overflow-hidden"
            style={{ background: "var(--navy)", borderColor: "rgba(21,90,60,0.3)", minHeight: "340px" }}
          >
            {/* Background grid */}
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 50%, rgba(21,90,60,0.3) 0%, transparent 70%)`,
              }}
            />

            <div className="text-xs font-semibold mb-4" style={{ color: "#5A7A96" }}>
              Anonymous benchmark network · {companyNodes.length} companies shown
            </div>

            {/* SVG network */}
            <svg
              viewBox="0 0 100 80"
              className="w-full"
              style={{ height: "240px" }}
            >
              {/* Center node — Growth Goaled */}
              <circle cx="47" cy="40" r="5" fill="#155A3C" opacity="0.9" />
              <circle cx="47" cy="40" r="8" fill="none" stroke="#155A3C" strokeWidth="0.5" opacity="0.4">
                <animate attributeName="r" values="8;12;8" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" />
              </circle>
              <text x="47" y="51" textAnchor="middle" fontSize="3" fill="#6EE7A8" fontFamily="JetBrains Mono, monospace" fontWeight="600">
                GROWTH GOALED
              </text>

              {/* Connection lines */}
              {companyNodes.map(({ x, y }, i) =>
                lit.includes(i) ? (
                  <line
                    key={`line-${i}`}
                    x1={47}
                    y1={40}
                    x2={x}
                    y2={y}
                    stroke="#155A3C"
                    strokeWidth="0.3"
                    opacity="0.35"
                  />
                ) : null
              )}

              {/* Company nodes */}
              {companyNodes.map(({ x, y, label }, i) => (
                <g key={label}>
                  <circle
                    cx={x}
                    cy={y}
                    r={lit.includes(i) ? "2.5" : "2"}
                    fill={lit.includes(i) ? "#1A7049" : "#1A2D42"}
                    stroke={lit.includes(i) ? "#6EE7A8" : "#2A4560"}
                    strokeWidth="0.5"
                    style={{ transition: "all 0.4s ease" }}
                  />
                  {lit.includes(i) && (
                    <text
                      x={x + 3.5}
                      y={y + 1}
                      fontSize="2.2"
                      fill="#5A8070"
                      fontFamily="Inter, sans-serif"
                    >
                      {label}
                    </text>
                  )}
                </g>
              ))}
            </svg>

            {/* Privacy note */}
            <div
              className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed"
              style={{ background: "rgba(21,90,60,0.15)", color: "#7A98B4", border: "1px solid rgba(21,90,60,0.25)" }}
            >
              🔒 Company data remains private. Aggregated patterns strengthen Growth Goaled's benchmark intelligence. No individual company's data is exposed to other customers.
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Companies in network", value: "400+", trend: "+48 this quarter" },
          { label: "Benchmark data points", value: "2.4M", trend: "Across all cohorts" },
          { label: "Cohort match accuracy", value: "94%", trend: "+6% vs. 12 months ago" },
          { label: "Recommendation precision", value: "↑ 31%", trend: "Year over year improvement" },
        ].map(({ label, value, trend }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="font-mono text-2xl font-semibold mb-1" style={{ color: "var(--green)" }}>{value}</div>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>{label}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{trend}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
