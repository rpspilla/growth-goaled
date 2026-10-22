interface BaselineProps {
  onNavigate: (view: string) => void;
}

const findings = [
  {
    num: "01",
    title: "Growth is strong",
    body: "Acme is growing faster than the median company in its benchmark cohort. At 72% YoY, Acme sits in the 60th percentile for stage — above median but with meaningful runway to top-quartile (89%). Growth is not the immediate constraint.",
    status: "positive",
    metrics: [
      { label: "Acme growth", value: "72%" },
      { label: "Cohort median", value: "58%" },
      { label: "Top quartile", value: "89%" },
    ],
  },
  {
    num: "02",
    title: "Sales efficiency is lagging",
    body: "Sales cycle and AE productivity are materially below top-quartile performance. Acme's 94-day average close time is 54% longer than top performers. AE productivity at $840K is 30% below the $1.2M top-quartile benchmark.",
    status: "warning",
    metrics: [
      { label: "Sales cycle gap", value: "+33 days" },
      { label: "AE prod. gap", value: "-$360K" },
      { label: "CAC payback gap", value: "+5 months" },
    ],
  },
  {
    num: "03",
    title: "Retention is becoming a constraint",
    body: "NRR of 108% is healthy and above the cohort median, but below the 119% top-quartile threshold required to sustain efficient growth at Acme's stage. Gross retention at 91% should be monitored — churn is beginning to compound.",
    status: "warning",
    metrics: [
      { label: "NRR", value: "108%" },
      { label: "Top quartile", value: "119%" },
      { label: "Gross retention", value: "91%" },
    ],
  },
];

export default function Baseline({ onNavigate }: BaselineProps) {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Your GTM Baseline
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Three major findings from your Growth Intelligence analysis.
        </p>
      </div>

      <div className="space-y-4 mb-8">
        {findings.map((f) => (
          <div
            key={f.num}
            className="rounded-xl border p-6 grid grid-cols-4 gap-6 items-start"
            style={{ background: "var(--card)", borderColor: f.status === "warning" ? "var(--amber)" : "var(--green)", borderLeftWidth: "4px" }}
          >
            <div className="col-span-3">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-xs font-bold" style={{ color: "var(--muted-foreground)" }}>{f.num}</span>
                <h3 className="font-semibold text-base" style={{ color: "var(--foreground)" }}>{f.title}</h3>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: f.status === "positive" ? "var(--green-muted)" : "var(--amber-muted)",
                    color: f.status === "positive" ? "var(--green)" : "var(--amber)",
                  }}
                >
                  {f.status === "positive" ? "Strength" : "Watch area"}
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{f.body}</p>
            </div>
            <div className="space-y-2">
              {f.metrics.map(({ label, value }) => (
                <div key={label} className="rounded-lg p-2.5" style={{ background: "var(--muted)" }}>
                  <div className="text-xs mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                  <div className="font-mono font-semibold text-sm" style={{ color: "var(--foreground)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Core Diagnosis */}
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: "var(--navy)" }}
      >
        <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--green)" }}>
          The Core Diagnosis
        </div>
        <blockquote
          className="font-display text-3xl font-normal leading-snug mb-4"
          style={{ color: "#FFFFFF" }}
        >
          "Acme does not have a pipeline problem.
          <br />
          <em>Acme has a sales efficiency problem.</em>"
        </blockquote>
        <p className="text-sm max-w-lg mx-auto mb-6" style={{ color: "#7A98B4" }}>
          Win rate is above benchmark, signaling the top of funnel and product are working. The constraint is in how fast and efficiently deals close once they enter the pipeline.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => onNavigate("channels")}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            See Channel Recommendations →
          </button>
          <button
            onClick={() => onNavigate("benchmark")}
            className="px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.08)", color: "#C8D3E0" }}
          >
            Review Benchmark
          </button>
        </div>
      </div>
    </div>
  );
}
