import { useState } from "react";
import { reviewQueue } from "../../data/mock";

export default function ReviewQueue() {
  const [selected, setSelected] = useState(0);
  const [approved, setApproved] = useState<number | null>(null);
  const item = reviewQueue[selected];

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Review Queue
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          AI-generated deliverables awaiting advisor review before release to founders.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Queue list */}
        <div className="space-y-3">
          {reviewQueue.map((q, i) => (
            <button
              key={i}
              onClick={() => { setSelected(i); setApproved(null); }}
              className="w-full rounded-xl border p-4 text-left transition-all"
              style={{
                background: selected === i ? "var(--navy)" : "var(--card)",
                borderColor: selected === i ? "var(--green)" : "var(--border)",
              }}
            >
              <div className="flex items-start justify-between mb-1">
                <div
                  className="text-sm font-semibold"
                  style={{ color: selected === i ? "#fff" : "var(--foreground)" }}
                >
                  {q.company}
                </div>
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{
                    background: q.advisorReview === "required" ? "rgba(220,38,38,0.2)" : "rgba(255,255,255,0.1)",
                    color: q.advisorReview === "required" ? "#FCA5A5" : "#7A98B4",
                    fontSize: "10px",
                  }}
                >
                  {q.advisorReview === "required" ? "REVIEW NOW" : "PENDING"}
                </span>
              </div>
              <div className="text-xs mb-2" style={{ color: selected === i ? "#7A98B4" : "var(--muted-foreground)" }}>
                {q.deliverable}
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1 text-xs"
                  style={{ color: selected === i ? "#6EE7A8" : "var(--green)" }}
                >
                  <span>Draft ✓</span>
                </div>
                <span style={{ color: "#5A7A96" }}>·</span>
                <div className="text-xs" style={{ color: q.qaAgent === "complete" ? (selected === i ? "#6EE7A8" : "var(--green)") : "var(--amber)" }}>
                  QA {q.qaAgent === "complete" ? "✓" : "…"}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="col-span-2 space-y-4">
          <div
            className="rounded-xl border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>
                  Deliverable
                </div>
                <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
                  {item.company} — {item.deliverable}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                  Draft completed {item.completedAt}
                </div>
              </div>
            </div>

            {/* Two agents */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="rounded-lg p-4" style={{ background: "var(--muted)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: "var(--navy)" }}
                  >
                    <span style={{ color: "#6EE7A8", fontSize: "10px" }}>D</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>Draft Agent</span>
                  <span className="ml-auto text-xs" style={{ color: "var(--green)" }}>Complete ✓</span>
                </div>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Generated the deliverable using company data, benchmark cohort, and Growth Goaled methodology.
                </p>
              </div>
              <div className="rounded-lg p-4" style={{ background: "var(--muted)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: "var(--navy)" }}
                  >
                    <span style={{ color: "#7DD3FC", fontSize: "10px" }}>Q</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>QA Agent</span>
                  <span className="ml-auto text-xs" style={{ color: item.qaAgent === "complete" ? "var(--green)" : "var(--amber)" }}>
                    {item.qaAgent === "complete" ? "Complete ✓" : "Running..."}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Independently verified data consistency, methodology, source trails, and recommendation logic.
                </p>
              </div>
            </div>

            {/* QA checks */}
            {item.qaChecks.length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-semibold mb-3" style={{ color: "var(--muted-foreground)" }}>QA Verification</div>
                <div className="space-y-2">
                  {item.qaChecks.map(({ label, pass, note }) => (
                    <div key={label} className="flex items-center gap-2.5">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: pass ? "var(--green)" : "var(--red)" }}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span className="text-sm" style={{ color: "var(--foreground)" }}>{label}</span>
                      {note && (
                        <span className="text-xs" style={{ color: "var(--amber)" }}>· {note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Advisor action */}
            {approved === selected ? (
              <div
                className="rounded-lg p-4 flex items-center gap-3"
                style={{ background: "var(--green-muted)", border: "1px solid var(--green)" }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "var(--green)" }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--green)" }}>Approved and released to founder</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Acme AI will be notified.</div>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs font-semibold mb-3" style={{ color: "var(--muted-foreground)" }}>Advisor Approval</div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setApproved(selected)}
                    className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: "var(--green)", color: "#fff" }}
                  >
                    Approve & Release
                  </button>
                  <button
                    className="px-4 py-2.5 rounded-lg text-sm font-medium border transition-all"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "transparent" }}
                  >
                    Request Changes
                  </button>
                  <button
                    className="px-4 py-2.5 rounded-lg text-sm font-medium border transition-all"
                    style={{ borderColor: "var(--border)", color: "var(--muted-foreground)", background: "transparent" }}
                  >
                    Send Back to AI
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
