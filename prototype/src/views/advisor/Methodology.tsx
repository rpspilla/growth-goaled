export default function Methodology() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          How Growth Goaled knows
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          The intelligence behind your recommendations.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {[
          { label: "Data completeness", value: "92%", color: "var(--green)", desc: "Percentage of required data fields populated across the company profile and uploaded documents." },
          { label: "Consistency score", value: "96%", color: "var(--green)", desc: "Agreement between data sources. High consistency indicates few conflicts between provided data points." },
          { label: "Confidence level", value: "High", color: "var(--green)", desc: "Overall confidence in the Growth Intelligence analysis based on data quality and cohort match quality." },
        ].map(({ label, value, color, desc }) => (
          <div
            key={label}
            className="rounded-xl border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="font-mono text-3xl font-semibold mb-1" style={{ color }}>{value}</div>
            <div className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>{label}</div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Data sources */}
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>Data Sources</div>
          {[
            { label: "Company-provided data", items: ["Intake form responses", "Operating metrics", "Team structure"] },
            { label: "Uploaded documents", items: ["Board deck", "Financial model", "GTM plan"] },
            { label: "Benchmark intelligence", items: ["Growth Goaled cohort (n=14)", "Industry benchmarks", "Stage norms"] },
          ].map(({ label, items }) => (
            <div key={label} className="mb-4">
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--muted-foreground)" }}>{label}</div>
              {items.map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs mb-1" style={{ color: "var(--foreground)" }}>
                  <div className="w-1 h-1 rounded-full" style={{ background: "var(--green)" }} />
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Cohort matching */}
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>Cohort Matching</div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--muted-foreground)" }}>
            Companies are matched using a multi-factor algorithm across 6 dimensions. Each dimension is weighted by its predictive validity for GTM outcomes at the given stage.
          </p>
          {[
            { dim: "Funding stage", weight: "High" },
            { dim: "ARR band ($2M–$10M)", weight: "High" },
            { dim: "GTM motion (founder-led)", weight: "High" },
            { dim: "ACV range ($30K–$60K)", weight: "Medium" },
            { dim: "Vertical (B2B SaaS/AI)", weight: "Medium" },
            { dim: "Team structure", weight: "Low" },
          ].map(({ dim, weight }) => (
            <div
              key={dim}
              className="flex justify-between items-center text-xs py-1.5 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span style={{ color: "var(--foreground)" }}>{dim}</span>
              <span
                className="font-medium"
                style={{ color: weight === "High" ? "var(--green)" : weight === "Medium" ? "var(--amber)" : "var(--muted-foreground)" }}
              >
                {weight}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Intelligence flywheel */}
      <div
        className="mt-6 rounded-xl p-6"
        style={{ background: "var(--navy)" }}
      >
        <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--green)" }}>
          The Compounding Intelligence Model
        </div>
        <p className="text-base font-medium mb-3" style={{ color: "#E2EAF4" }}>
          Every company makes the system smarter.
        </p>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          {["Company Data", "Normalized Metrics", "Cohort Matching", "Benchmark Intelligence", "Better Recommendations", "More Companies"].map((step, i, arr) => (
            <div key={step} className="flex items-center gap-3">
              <span
                className="text-xs px-2.5 py-1.5 rounded-md font-medium"
                style={{ background: "rgba(255,255,255,0.06)", color: "#C8D3E0" }}
              >
                {step}
              </span>
              {i < arr.length - 1 && <span style={{ color: "#5A7A96" }}>→</span>}
            </div>
          ))}
        </div>
        <div
          className="rounded-lg px-4 py-3 text-xs leading-relaxed"
          style={{ background: "rgba(21,90,60,0.2)", color: "#7A98B4", border: "1px solid rgba(21,90,60,0.3)" }}
        >
          Company data remains private. Aggregated patterns strengthen Growth Goaled's benchmark intelligence. No individual company's data is exposed to other customers.
        </div>
      </div>
    </div>
  );
}
