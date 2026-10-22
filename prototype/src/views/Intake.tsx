import { useState } from "react";

const sections = [
  {
    id: "company",
    label: "Company",
    fields: [
      { id: "name", label: "Company name", type: "text", value: "Acme AI", placeholder: "" },
      { id: "website", label: "Website", type: "text", value: "acme-ai.com", placeholder: "" },
      { id: "industry", label: "Industry", type: "select", value: "AI / Automation", options: ["AI / Automation", "B2B SaaS", "Fintech", "HealthTech", "Other"] },
      { id: "stage", label: "Stage", type: "select", value: "Series A", options: ["Pre-seed", "Seed", "Series A", "Series B+"] },
      { id: "arr", label: "ARR ($)", type: "text", value: "4,200,000", placeholder: "" },
      { id: "growth", label: "YoY Growth (%)", type: "text", value: "72", placeholder: "" },
      { id: "funding", label: "Total Funding", type: "text", value: "$8.5M", placeholder: "" },
      { id: "employees", label: "Employees", type: "text", value: "38", placeholder: "" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    fields: [
      { id: "count", label: "Customer count", type: "text", value: "87", placeholder: "" },
      { id: "acv", label: "ACV ($)", type: "text", value: "42,000", placeholder: "" },
      { id: "nrr", label: "NRR (%)", type: "text", value: "108", placeholder: "" },
      { id: "gross_retention", label: "Gross retention (%)", type: "text", value: "91", placeholder: "" },
      { id: "sales_cycle", label: "Avg. sales cycle (days)", type: "text", value: "94", placeholder: "" },
      { id: "segment", label: "Primary segment", type: "select", value: "Mid-market", options: ["SMB", "Mid-market", "Enterprise", "Mixed"] },
    ],
  },
  {
    id: "gtm",
    label: "GTM",
    fields: [
      { id: "sales_reps", label: "Sales reps (AE)", type: "text", value: "5", placeholder: "" },
      { id: "sdrs", label: "SDRs / BDRs", type: "text", value: "2", placeholder: "" },
      { id: "marketing", label: "Marketing team", type: "text", value: "1", placeholder: "" },
      { id: "partnerships", label: "Partnership team", type: "text", value: "0", placeholder: "" },
      { id: "channels", label: "Primary channels", type: "text", value: "Outbound, content, events", placeholder: "" },
      { id: "model", label: "Sales model", type: "select", value: "Founder-led", options: ["Founder-led", "Product-led", "Sales-led", "Hybrid"] },
    ],
  },
  {
    id: "icp",
    label: "ICP",
    fields: [
      { id: "industries", label: "Target industries", type: "text", value: "B2B SaaS, AI/tech companies", placeholder: "" },
      { id: "size", label: "Company size", type: "text", value: "100–2,000 employees", placeholder: "" },
      { id: "buyer", label: "Primary buyer", type: "text", value: "VP Sales, CRO, CEO", placeholder: "" },
      { id: "geo", label: "Geography", type: "select", value: "North America", options: ["North America", "North America + EU", "Global", "Europe"] },
      { id: "usecase", label: "Primary use case", type: "text", value: "GTM automation and intelligence", placeholder: "" },
    ],
  },
];

export default function Intake({ onContinue }: { onContinue?: () => void }) {
  const [activeSection, setActiveSection] = useState("company");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const current = sections.find((s) => s.id === activeSection)!;
  const progress = 32;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            Company Profile
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--green)" }}>
            <span className="font-semibold font-mono">{progress}% complete</span>
          </div>
        </div>
        <div className="h-1.5 rounded-full mb-4" style={{ background: "var(--muted)" }}>
          <div className="h-1.5 rounded-full" style={{ width: `${progress}%`, background: "var(--green)" }} />
        </div>
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Tell us about your company
        </h1>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          This data forms the foundation of your Growth Intelligence profile.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Section tabs */}
        <div className="w-40 shrink-0 space-y-1">
          {sections.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all"
              style={{
                background: activeSection === s.id ? "var(--navy)" : "transparent",
                color: activeSection === s.id ? "#fff" : "var(--muted-foreground)",
              }}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={{
                  background: i === 0 ? "var(--green)" : activeSection === s.id ? "rgba(21,90,60,0.5)" : "var(--muted)",
                  color: i === 0 ? "#fff" : activeSection === s.id ? "#6EE7A8" : "var(--muted-foreground)",
                }}
              >
                {i === 0 ? "✓" : i + 1}
              </span>
              {s.label}
            </button>
          ))}
          {/* Hiring */}
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left"
            style={{ color: "var(--muted-foreground)" }}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              5
            </span>
            Hiring
          </button>
        </div>

        {/* Form */}
        <div className="flex-1">
          <div
            className="rounded-xl border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="text-sm font-semibold mb-5" style={{ color: "var(--foreground)" }}>
              {current.label}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {current.fields.map((f) => (
                <div key={f.id}>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                    {f.label}
                  </label>
                  {f.type === "select" ? (
                    <select
                      defaultValue={f.value}
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        background: "var(--muted)",
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                      }}
                    >
                      {f.options?.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      defaultValue={f.value}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2"
                      style={{
                        background: "var(--muted)",
                        borderColor: "var(--border)",
                        color: "var(--foreground)",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-6 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
              <button
                className="text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                Save for later
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 rounded-lg text-sm font-medium border transition-all"
                  style={{
                    borderColor: saved ? "var(--green)" : "var(--border)",
                    color: saved ? "var(--green)" : "var(--foreground)",
                    background: "transparent",
                  }}
                >
                  {saved ? "✓ Saved" : "Save"}
                </button>
                <button
                  onClick={() => {
                    const idx = sections.findIndex((s) => s.id === activeSection);
                    if (idx < sections.length - 1) {
                      setActiveSection(sections[idx + 1].id);
                    } else {
                      onContinue?.();
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                  style={{ background: "var(--green)", color: "#fff" }}
                >
                  {sections.findIndex((s) => s.id === activeSection) === sections.length - 1 ? "Upload Documents →" : "Continue →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
