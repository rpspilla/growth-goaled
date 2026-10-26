"use client";

const KIND_LABEL: Record<string, string> = {
  data_point: "Company data",
  benchmark_metric: "Benchmark",
  document: "Data you shared",
  founder_answer: "Your answer",
  methodology: "Methodology",
  analysis: "Calculated from your data",
};

type TrailClaim = { text: string; confidence?: string | null; sources: { kind: string; title: string; detail: string | null }[] };

/** Side panel listing the sources behind one claim. `note` says how the claim was verified. */
export function SourceTrailPanel({ claim, onClose, note = "QA Agent verified; approved by your advisor." }: { claim: TrailClaim | null; onClose: () => void; note?: string }) {
  if (!claim) return null;
  const confidence = claim.confidence;
  const evidence = claim.sources.filter((s) => s.kind !== "methodology");
  const methodology = claim.sources.find((s) => s.kind === "methodology");

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-96 h-full overflow-y-auto p-6 shadow-2xl"
        style={{ background: "var(--card)", borderLeft: "1px solid var(--border)", animation: "fadeIn 0.15s ease-out" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Sources"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="font-semibold" style={{ color: "var(--foreground)" }}>Evidence</div>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--muted-foreground)", fontSize: "20px", lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div className="space-y-5">
          <div className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{claim.text}</div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>
              Data Sources
            </div>
            {evidence.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 py-2 border-b text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: "var(--green)" }} />
                <div className="min-w-0">
                  <div className="text-xs font-medium mb-0.5" style={{ color: "var(--muted-foreground)" }}>{KIND_LABEL[s.kind]}</div>
                  <div style={{ color: "var(--foreground)" }}>{s.title}</div>
                  {s.detail && <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{s.detail}</div>}
                </div>
              </div>
            ))}
            {evidence.length === 0 && (
              <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>No sources recorded.</div>
            )}
          </div>
          <div className="rounded-lg p-4" style={{ background: "var(--green-muted)" }}>
            {confidence && <div className="text-xs font-semibold mb-1 capitalize" style={{ color: "var(--green)" }}>Confidence: {confidence}</div>}
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {evidence.length} {evidence.length === 1 ? "source" : "sources"}. {note}
            </div>
          </div>
          {methodology?.detail && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                Cohort Matching Methodology
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{methodology.detail}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
