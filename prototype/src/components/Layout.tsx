import { useState } from "react";
import type { ReactNode } from "react";

export type FounderView =
  | "welcome"
  | "intake"
  | "upload"
  | "processing"
  | "dashboard"
  | "benchmark"
  | "baseline"
  | "icp"
  | "channels"
  | "hiring"
  | "questions"
  | "deliverables"
  | "intelligence";

export type AdvisorView =
  | "portfolio"
  | "company"
  | "review"
  | "methodology"
  | "benchmarks";

export type AppView = FounderView | AdvisorView;

interface LayoutProps {
  children: ReactNode;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  mode: "founder" | "advisor";
  onSwitchMode: () => void;
}

const founderNav: { id: FounderView; label: string; phase: number }[] = [
  { id: "dashboard", label: "Overview", phase: 0 },
  { id: "intake", label: "Company Profile", phase: 1 },
  { id: "upload", label: "Intake", phase: 2 },
  { id: "benchmark", label: "Benchmark", phase: 3 },
  { id: "baseline", label: "Baseline", phase: 4 },
  { id: "icp", label: "ICP", phase: 5 },
  { id: "channels", label: "Channel Strategy", phase: 6 },
  { id: "hiring", label: "Hiring Plan", phase: 7 },
  { id: "questions", label: "Questions", phase: 8 },
  { id: "deliverables", label: "Deliverables", phase: 9 },
  { id: "intelligence", label: "How It Works", phase: 10 },
];

const advisorNav: { id: AdvisorView; label: string; badge?: number }[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "company", label: "Companies" },
  { id: "review", label: "Review Queue", badge: 3 },
  { id: "benchmarks", label: "Benchmarks" },
  { id: "methodology", label: "Methodology" },
];

const progressPhases = ["Profile", "Benchmark", "Baseline", "ICP", "Channels", "Hiring"];
const currentPhase = 3; // Benchmark phase

export default function Layout({ children, currentView, onNavigate, mode, onSwitchMode }: LayoutProps) {
  const [notifOpen, setNotifOpen] = useState(false);

  const isFounder = mode === "founder";

  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-56 shrink-0 h-full"
        style={{ background: "var(--navy)", color: "#C8D3E0" }}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b" style={{ borderColor: "#1E3347" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--green)", color: "#fff" }}
            >
              G
            </div>
            <span className="font-semibold text-white text-sm tracking-tight">Growth Goaled</span>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "#1E3347" }}>
          <div className="flex rounded-md overflow-hidden text-xs" style={{ background: "#1A2D42" }}>
            <button
              onClick={() => !isFounder && onSwitchMode()}
              className="flex-1 py-1.5 font-medium transition-all"
              style={{
                background: isFounder ? "var(--green)" : "transparent",
                color: isFounder ? "#fff" : "#8DA3B7",
              }}
            >
              Founder
            </button>
            <button
              onClick={() => isFounder && onSwitchMode()}
              className="flex-1 py-1.5 font-medium transition-all"
              style={{
                background: !isFounder ? "var(--green)" : "transparent",
                color: !isFounder ? "#fff" : "#8DA3B7",
              }}
            >
              Advisor
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {isFounder
            ? founderNav.map(({ id, label, phase }) => {
                const active = currentView === id;
                const completed = phase < currentPhase;
                const isCurrent = phase === currentPhase;
                return (
                  <button
                    key={id}
                    onClick={() => onNavigate(id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-all group"
                    style={{
                      background: active ? "rgba(21,90,60,0.25)" : "transparent",
                      color: active ? "#fff" : "#7A98B4",
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-xs"
                      style={{
                        background: completed
                          ? "var(--green)"
                          : active || isCurrent
                          ? "rgba(21,90,60,0.5)"
                          : "rgba(255,255,255,0.08)",
                        color: completed ? "#fff" : "#7A98B4",
                      }}
                    >
                      {completed ? (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <span style={{ fontSize: "8px" }}>{phase}</span>
                      )}
                    </span>
                    <span className="font-medium" style={{ color: active ? "#fff" : undefined }}>
                      {label}
                    </span>
                    {isCurrent && (
                      <span
                        className="ml-auto text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(21,90,60,0.4)", color: "#6EE7A8", fontSize: "10px" }}
                      >
                        Active
                      </span>
                    )}
                  </button>
                );
              })
            : advisorNav.map(({ id, label, badge }) => {
                const active = currentView === id;
                return (
                  <button
                    key={id}
                    onClick={() => onNavigate(id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left"
                    style={{
                      background: active ? "rgba(21,90,60,0.25)" : "transparent",
                      color: active ? "#fff" : "#7A98B4",
                    }}
                  >
                    <span className="flex-1 font-medium">{label}</span>
                    {badge && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: "var(--green)", color: "#fff", fontSize: "10px" }}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
        </nav>

        {/* Bottom */}
        {isFounder && (
          <div className="px-4 pb-5 pt-3 border-t" style={{ borderColor: "#1E3347" }}>
            <div className="text-xs mb-2" style={{ color: "#5A7A96" }}>Progress</div>
            <div className="flex items-center gap-1.5 mb-1.5">
              {progressPhases.map((p, i) => (
                <div
                  key={p}
                  className="flex-1 h-1 rounded-full"
                  style={{
                    background: i < currentPhase ? "var(--green)" : i === currentPhase ? "rgba(21,90,60,0.5)" : "rgba(255,255,255,0.1)",
                  }}
                />
              ))}
            </div>
            <div className="text-xs" style={{ color: "#5A7A96" }}>
              Phase {currentPhase} of {progressPhases.length} · Benchmark
            </div>
          </div>
        )}

        {!isFounder && (
          <div className="px-4 pb-5 pt-3 border-t" style={{ borderColor: "#1E3347" }}>
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "rgba(21,90,60,0.4)", color: "#6EE7A8" }}
              >
                JS
              </div>
              <div>
                <div className="text-xs font-medium text-white">Jamie Sterling</div>
                <div className="text-xs" style={{ color: "#5A7A96" }}>Lead Advisor</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top navigation */}
        <header
          className="flex items-center h-14 px-6 border-b shrink-0"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          {isFounder ? (
            <>
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
                  style={{ background: "var(--green-muted)", color: "var(--green)" }}
                >
                  A
                </div>
                <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>Acme AI</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "var(--blue-muted)", color: "var(--blue)" }}
                >
                  Series A
                </span>
              </div>
              <div className="ml-auto flex items-center gap-3 relative">
                <button
                  className="relative text-sm px-3 py-1.5 rounded-md"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                  onClick={() => setNotifOpen(!notifOpen)}
                >
                  <span>Notifications</span>
                  <span
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "var(--amber)", color: "#fff", fontSize: "9px" }}
                  >
                    2
                  </span>
                </button>
                {notifOpen && (
                  <div
                    className="absolute top-10 right-8 z-50 w-80 rounded-xl shadow-xl border overflow-hidden"
                    style={{ background: "var(--card)", borderColor: "var(--border)" }}
                  >
                    <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Notifications</span>
                      <button onClick={() => setNotifOpen(false)} style={{ color: "var(--muted-foreground)", fontSize: "18px", lineHeight: 1 }}>×</button>
                    </div>
                    {[
                      { title: "Jamie approved your benchmark", body: "Benchmark Analysis — approved and released", time: "2 hours ago", color: "var(--green)" },
                      { title: "2 questions need your input", body: "Data conflicts found in intake data", time: "Yesterday", color: "var(--amber)" },
                    ].map(({ title, body, time, color }) => (
                      <div key={title} className="px-4 py-3 border-b flex gap-3 items-start" style={{ borderColor: "var(--border)" }}>
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
                        <div>
                          <div className="text-xs font-semibold mb-0.5" style={{ color: "var(--foreground)" }}>{title}</div>
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{body}</div>
                          <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)", opacity: 0.6 }}>{time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer"
                  style={{ background: "var(--navy)", color: "#fff" }}
                >
                  SA
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)", minWidth: "220px" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>Search companies...</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: "var(--amber-muted)", color: "var(--amber)" }}
                  >
                    8 pending reviews
                  </span>
                </span>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: "var(--green)", color: "#fff" }}
                >
                  JS
                </div>
              </div>
            </>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
