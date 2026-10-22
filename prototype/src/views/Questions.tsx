import { useState } from "react";

const questions = [
  {
    id: "q1",
    type: "conflict",
    title: "Conflicting sales-cycle data",
    body: "We found conflicting sales-cycle data between your board deck (62 days) and your current CRM operating data (94 days). This gap materially affects your benchmark position.",
    options: ["Use board deck (62 days)", "Use CRM data (94 days)", "Mark as unknown"],
    selected: null as string | null,
  },
  {
    id: "q2",
    type: "missing",
    title: "Gross margin not provided",
    body: "Gross margin is required to calculate your CAC payback period accurately. Your financial model did not include this figure.",
    options: ["Enter now", "Upload document", "Mark as unknown"],
    selected: null as string | null,
  },
  {
    id: "q3",
    type: "assumption",
    title: "Assumption: SDR quota",
    body: "We assumed a $500K pipeline quota per SDR based on benchmark cohort norms. Confirm or correct this assumption.",
    options: ["Confirm assumption", "Enter actual", "Mark as unknown"],
    selected: null as string | null,
  },
];

const registers = [
  { category: "Missing information", count: 3, color: "var(--amber)" },
  { category: "Unresolved questions", count: 2, color: "var(--red)" },
  { category: "Data conflicts", count: 1, color: "var(--amber)" },
  { category: "Assumptions", count: 4, color: "var(--blue)" },
  { category: "Follow-ups", count: 2, color: "var(--muted-foreground)" },
];

export default function Questions() {
  const [items, setItems] = useState(questions);
  const [activeTab, setActiveTab] = useState<"questions" | "registers">("questions");

  function resolve(id: string, option: string) {
    setItems((prev) => prev.map((q) => (q.id === id ? { ...q, selected: option } : q)));
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Questions we need you to answer
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Resolving these will improve the accuracy of your Growth Intelligence profile.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: "var(--muted)", width: "fit-content" }}>
        {(["questions", "registers"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2 rounded-md text-sm font-medium capitalize transition-all"
            style={{
              background: activeTab === tab ? "var(--card)" : "transparent",
              color: activeTab === tab ? "var(--foreground)" : "var(--muted-foreground)",
              boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {tab === "questions" ? `Questions (${items.filter((q) => !q.selected).length})` : "Registers"}
          </button>
        ))}
      </div>

      {activeTab === "questions" ? (
        <div className="space-y-4">
          {items.map((q) => (
            <div
              key={q.id}
              className="rounded-xl border p-5 transition-all"
              style={{
                background: q.selected ? "var(--green-muted)" : "var(--card)",
                borderColor: q.selected ? "var(--green)" : q.type === "conflict" ? "var(--amber)" : "var(--border)",
              }}
            >
              <div className="flex items-start gap-3 mb-3">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium mt-0.5"
                  style={{
                    background: q.type === "conflict" ? "var(--amber-muted)" : q.type === "missing" ? "#FEE2E2" : "var(--blue-muted)",
                    color: q.type === "conflict" ? "var(--amber)" : q.type === "missing" ? "var(--red)" : "var(--blue)",
                  }}
                >
                  {q.type === "conflict" ? "Data conflict" : q.type === "missing" ? "Missing data" : "Assumption"}
                </span>
                {q.selected && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
                    ✓ Resolved
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>{q.title}</div>
              <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>{q.body}</p>
              {!q.selected ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => resolve(q.id, opt)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:border-green-600"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "transparent" }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs font-medium" style={{ color: "var(--green)" }}>
                  Selected: {q.selected}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {registers.map(({ category, count, color }) => (
            <div
              key={category}
              className="rounded-xl border p-4 flex items-center justify-between"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{category}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="font-mono font-semibold text-sm"
                  style={{ color: count > 2 ? "var(--amber)" : "var(--green)" }}
                >
                  {count}
                </span>
                <button
                  className="text-xs px-3 py-1 rounded-md"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
