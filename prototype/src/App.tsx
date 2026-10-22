import { useState, useEffect, useRef } from "react";
import Layout, { type AppView } from "./components/Layout";
import Welcome from "./views/Welcome";
import Intake from "./views/Intake";
import Upload from "./views/Upload";
import Processing from "./views/Processing";
import Dashboard from "./views/Dashboard";
import Benchmark from "./views/Benchmark";
import Baseline from "./views/Baseline";
import ICP from "./views/ICP";
import ChannelStrategy from "./views/ChannelStrategy";
import HiringPlan from "./views/HiringPlan";
import Questions from "./views/Questions";
import Deliverables from "./views/Deliverables";
import CompoundingIntelligence from "./views/CompoundingIntelligence";
import Portfolio from "./views/advisor/Portfolio";
import CompanyView from "./views/advisor/CompanyView";
import ReviewQueue from "./views/advisor/ReviewQueue";
import Methodology from "./views/advisor/Methodology";

function PageWrapper({ children, viewKey }: { children: React.ReactNode; viewKey: string }) {
  const [visible, setVisible] = useState(false);
  const prev = useRef("");

  useEffect(() => {
    if (prev.current !== viewKey) {
      setVisible(false);
      const t = setTimeout(() => setVisible(true), 30);
      prev.current = viewKey;
      return () => clearTimeout(t);
    }
  }, [viewKey]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
      }}
    >
      {children}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<"founder" | "advisor">("founder");
  const [view, setView] = useState<AppView>("welcome");
  const [showWelcome, setShowWelcome] = useState(true);

  function navigate(v: AppView | string) {
    setView(v as AppView);
    if (v !== "welcome") setShowWelcome(false);
  }

  function switchMode() {
    if (mode === "founder") {
      setMode("advisor");
      setView("portfolio");
    } else {
      setMode("founder");
      setView("dashboard");
    }
    setShowWelcome(false);
  }

  // Welcome screen — full-dark, no chrome
  if (showWelcome && view === "welcome") {
    return (
      <div className="h-screen overflow-hidden">
        <Welcome
          onStart={() => navigate("intake")}
          onSample={() => navigate("dashboard")}
        />
      </div>
    );
  }

  function renderContent() {
    // Founder
    if (mode === "founder") {
      if (view === "intake") return <Intake onContinue={() => navigate("upload")} />;
      if (view === "upload") return <Upload onContinue={() => navigate("processing")} />;
      if (view === "processing") return <Processing onComplete={() => navigate("benchmark")} />;
      if (view === "dashboard") return <Dashboard onNavigate={navigate} />;
      if (view === "benchmark") return <Benchmark onNavigate={navigate} />;
      if (view === "baseline") return <Baseline onNavigate={navigate} />;
      if (view === "icp") return <ICP onNavigate={navigate} />;
      if (view === "channels") return <ChannelStrategy onNavigate={navigate} />;
      if (view === "hiring") return <HiringPlan onNavigate={navigate} />;
      if (view === "questions") return <Questions />;
      if (view === "deliverables") return <Deliverables onNavigate={navigate} />;
      if (view === "intelligence") return <CompoundingIntelligence />;
    }
    // Advisor
    if (mode === "advisor") {
      if (view === "portfolio") return <Portfolio onCompanyClick={() => navigate("company")} />;
      if (view === "company") return <CompanyView onReview={() => navigate("review")} />;
      if (view === "review") return <ReviewQueue />;
      if (view === "methodology") return <Methodology />;
      if (view === "benchmarks") return <AdvisorBenchmarks />;
    }
    return null;
  }

  const content = renderContent();

  return (
    <Layout
      currentView={view}
      onNavigate={navigate}
      mode={mode}
      onSwitchMode={switchMode}
    >
      {content ? (
        <PageWrapper viewKey={`${mode}:${view}`}>{content}</PageWrapper>
      ) : (
        <div className="p-8 max-w-xl">
          <div className="font-display text-2xl mb-3" style={{ color: "var(--foreground)" }}>
            Coming soon
          </div>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            This section is in development.
          </p>
        </div>
      )}
    </Layout>
  );
}

// Inline advisor benchmarks placeholder
function AdvisorBenchmarks() {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="font-display text-3xl font-normal mb-3" style={{ color: "var(--foreground)" }}>
        Benchmark Library
      </h1>
      <p className="text-base mb-8" style={{ color: "var(--muted-foreground)" }}>
        Benchmark cohorts managed across your portfolio.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {[
          { name: "Series A B2B SaaS", count: "14 companies", updated: "Today" },
          { name: "Seed AI / Automation", count: "8 companies", updated: "Yesterday" },
          { name: "Series A Fintech", count: "11 companies", updated: "Aug 22" },
          { name: "Series B SaaS", count: "19 companies", updated: "Aug 20" },
          { name: "Founder-led → PLG", count: "7 companies", updated: "Aug 18" },
          { name: "Enterprise GTM", count: "12 companies", updated: "Aug 15" },
        ].map(({ name, count, updated }) => (
          <div
            key={name}
            className="rounded-xl border p-5 cursor-pointer hover:shadow-sm transition-all"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>{name}</div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{count}</span>
              <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>Updated {updated}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
