interface CompanyViewProps {
  onReview: () => void;
}

export default function CompanyView({ onReview }: CompanyViewProps) {
  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold"
              style={{ background: "var(--secondary)", color: "var(--foreground)" }}
            >
              A
            </div>
            <h1 className="font-display text-3xl font-normal" style={{ color: "var(--foreground)" }}>Acme AI</h1>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: "var(--blue-muted)", color: "var(--blue)" }}
            >
              Series A
            </span>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: "var(--amber-muted)", color: "var(--amber)" }}
            >
              Attention required
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>AI / Automation · acme-ai.com</p>
        </div>
        <button
          onClick={onReview}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: "var(--green)", color: "#fff" }}
        >
          Review AI Analysis →
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "ARR", value: "$4.2M" },
          { label: "Growth", value: "72%" },
          { label: "NRR", value: "108%" },
          { label: "ACV", value: "$42K" },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
            <div className="font-mono text-xl font-semibold" style={{ color: "var(--foreground)" }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* GIS */}
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>
            Growth Intelligence Score
          </div>
          <div className="font-mono text-4xl font-semibold mb-1" style={{ color: "var(--foreground)" }}>72</div>
          <div className="h-1.5 rounded-full mb-2" style={{ background: "var(--muted)" }}>
            <div className="h-1.5 rounded-full" style={{ width: "72%", background: "var(--green)" }} />
          </div>
          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Strong foundation. Efficiency is the constraint.</div>

          <div className="mt-4 pt-4 border-t space-y-1" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs font-semibold mb-2" style={{ color: "var(--muted-foreground)" }}>Benchmark position</div>
            {[
              { label: "ARR Growth", pos: "60th pct." },
              { label: "AE Productivity", pos: "35th pct." },
              { label: "Win Rate", pos: "72nd pct." },
            ].map(({ label, pos }) => (
              <div key={label} className="flex justify-between text-xs">
                <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
                <span className="font-mono" style={{ color: "var(--foreground)" }}>{pos}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Current phase */}
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>
            Current Phase
          </div>
          <div className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Benchmark</div>
          <div className="space-y-2">
            {["Profile", "Intake", "Benchmark", "Baseline", "ICP", "Channels"].map((p, i) => (
              <div key={p} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center"
                  style={{
                    background: i < 3 ? "var(--green)" : i === 3 ? "var(--amber)" : "var(--muted)",
                  }}
                >
                  {i < 3 && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-xs" style={{ color: i < 3 ? "var(--foreground)" : "var(--muted-foreground)" }}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Open questions */}
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>
            AI Confidence
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ background: "var(--green-muted)", color: "var(--green)" }}
            >
              High
            </div>
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Overall recommendation</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span style={{ color: "var(--muted-foreground)" }}>Data completeness</span>
              <span className="font-mono font-medium" style={{ color: "var(--foreground)" }}>92%</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--muted-foreground)" }}>Consistency</span>
              <span className="font-mono font-medium" style={{ color: "var(--foreground)" }}>96%</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--muted-foreground)" }}>Open questions</span>
              <span className="font-mono font-medium" style={{ color: "var(--amber)" }}>2</span>
            </div>
          </div>
        </div>
      </div>

      {/* Advisor summary */}
      <div
        className="mt-6 rounded-xl border-l-4 p-5"
        style={{ background: "var(--navy)", borderLeftColor: "var(--green)" }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--green)" }}>
          Advisor Summary
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "#E2EAF4" }}>
          Acme's primary constraint appears to be sales efficiency rather than pipeline generation. Win rate is above benchmark, suggesting the product and positioning are working. Focus should be on sales cycle reduction and AE productivity before expanding headcount.
        </p>
        <p className="text-xs mt-2" style={{ color: "#7A98B4" }}>Jamie Sterling · Today, 11:42 AM</p>
      </div>
    </div>
  );
}
