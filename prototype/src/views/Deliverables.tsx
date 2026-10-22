interface DeliverablesProps {
  onNavigate: (v: string) => void;
}

const deliverables = [
  { title: "Benchmark Analysis", view: "benchmark", status: "complete", date: "Aug 25", advisor: "Approved by Jamie S." },
  { title: "GTM Baseline", view: "baseline", status: "complete", date: "Aug 24", advisor: "Approved by Jamie S." },
  { title: "ICP Analysis", view: "icp", status: "complete", date: "Aug 23", advisor: "Pending review" },
  { title: "Channel Strategy", view: "channels", status: "complete", date: "Aug 23", advisor: "Pending review" },
  { title: "Hiring Plan", view: "hiring", status: "complete", date: "Aug 22", advisor: "Pending review" },
  { title: "Action Plan", view: "dashboard", status: "in_progress", date: "—", advisor: "—" },
];

export default function Deliverables({ onNavigate }: DeliverablesProps) {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Your Deliverables
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Growth Intelligence outputs generated for Acme AI.
        </p>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div
          className="grid grid-cols-4 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider"
          style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          <div>Deliverable</div>
          <div>Status</div>
          <div>Generated</div>
          <div>Advisor Review</div>
        </div>
        {deliverables.map(({ title, view, status, date, advisor }) => (
          <div
            key={title}
            className="grid grid-cols-4 items-center px-5 py-4 border-b cursor-pointer hover:bg-opacity-50 transition-all"
            style={{ borderColor: "var(--border)" }}
            onClick={() => onNavigate(view)}
          >
            <div className="text-sm font-medium" style={{ color: "var(--green)", textDecoration: "underline", textDecorationColor: "transparent" }}>
              {title} →
            </div>
            <div>
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  background: status === "complete" ? "var(--green-muted)" : "var(--amber-muted)",
                  color: status === "complete" ? "var(--green)" : "var(--amber)",
                }}
              >
                {status === "complete" ? "Complete" : "In progress"}
              </span>
            </div>
            <div className="text-sm font-mono" style={{ color: "var(--muted-foreground)" }}>{date}</div>
            <div className="text-xs" style={{ color: advisor.includes("Approved") ? "var(--green)" : "var(--muted-foreground)" }}>
              {advisor}
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-6 rounded-xl p-5 flex items-start gap-4"
        style={{ background: "var(--card)", borderColor: "var(--border)", border: "1px solid var(--border)" }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0"
          style={{ background: "var(--green-muted)", color: "var(--green)" }}
        >
          JS
        </div>
        <div>
          <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
            Jamie Sterling — Lead Advisor
          </div>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            "Benchmark and baseline approved. Channel strategy and hiring plan are in review. I'll have notes back within 24 hours. Overall the analysis is directionally correct — sales efficiency is the right call."
          </p>
          <div className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Today, 11:42 AM</div>
        </div>
      </div>
    </div>
  );
}
