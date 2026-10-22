import { useState, useEffect, useRef } from "react";

const steps = [
  { label: "Company data analyzed", delay: 600 },
  { label: "GTM metrics normalized", delay: 1400 },
  { label: "Customer profile identified", delay: 2200 },
  { label: "Benchmark cohort selected", delay: 3200 },
  { label: "Performance gaps identified", delay: 4400 },
  { label: "Recommendations generated", delay: 5600 },
];

const processingLabels = [
  "Analyzing company data...",
  "Normalizing GTM metrics...",
  "Matching benchmark cohort...",
  "Identifying performance gaps...",
  "Testing recommendations...",
  "QA complete. Profile ready.",
];

export default function Processing({ onComplete }: { onComplete: () => void }) {
  const [completed, setCompleted] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [labelIdx, setLabelIdx] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Reset on mount
    setCompleted([]);
    setDone(false);
    setLabelIdx(0);

    steps.forEach(({ delay }, i) => {
      const t = setTimeout(() => {
        setCompleted((prev) => [...prev, i]);
        setLabelIdx(Math.min(i + 1, processingLabels.length - 1));
      }, delay);
      timers.current.push(t);
    });

    const doneTimer = setTimeout(() => setDone(true), 6800);
    timers.current.push(doneTimer);

    return () => timers.current.forEach(clearTimeout);
  }, []);

  return (
    <div
      className="min-h-full flex flex-col items-center justify-center px-8 py-16"
      style={{ background: "var(--navy)" }}
    >
      <div className="relative w-full max-w-md text-center">
        {!done ? (
          <div style={{ animation: "fadeInUp 0.4s ease-out" }}>
            {/* Animated loader */}
            <div className="flex justify-center mb-8">
              <div className="relative w-16 h-16">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#1E3347" strokeWidth="3" />
                  <circle
                    cx="32" cy="32" r="28"
                    fill="none"
                    stroke="#155A3C"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${completed.length / steps.length * 175} 176`}
                    strokeDashoffset="44"
                    style={{ transition: "stroke-dasharray 0.6s ease", transform: "rotate(-90deg)", transformOrigin: "center" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xl">🧠</div>
              </div>
            </div>

            <h2 className="font-display text-2xl font-normal mb-2" style={{ color: "#fff" }}>
              Building your Growth Intelligence profile
            </h2>
            <p
              className="text-sm mb-8 h-5"
              style={{ color: "#5A7A96", transition: "opacity 0.3s ease" }}
            >
              {processingLabels[labelIdx]}
            </p>

            <div className="space-y-3 text-left">
              {steps.map(({ label }, i) => {
                const isComplete = completed.includes(i);
                const isActive = !isComplete && completed.length === i;
                return (
                  <div
                    key={label}
                    className="flex items-center gap-3 transition-all duration-300"
                    style={{ opacity: isComplete || isActive ? 1 : 0.25 }}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
                      style={{
                        background: isComplete ? "var(--green)" : isActive ? "rgba(21,90,60,0.4)" : "rgba(255,255,255,0.06)",
                      }}
                    >
                      {isComplete ? (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : isActive ? (
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#6EE7A8" }} />
                      ) : null}
                    </div>
                    <span className="text-sm" style={{ color: isComplete ? "#E2EAF4" : isActive ? "#6EE7A8" : "#5A7A96" }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="mt-8 h-1 rounded-full overflow-hidden" style={{ background: "#1E3347" }}>
              <div
                className="h-1 rounded-full"
                style={{
                  width: `${(completed.length / steps.length) * 100}%`,
                  background: "var(--green)",
                  transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ animation: "fadeIn 0.5s ease-in" }}>
            <div className="flex justify-center mb-6">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "var(--green)", boxShadow: "0 0 40px rgba(21,90,60,0.5)" }}
              >
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M6 14L11 19L22 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <h2 className="font-display text-3xl font-normal mb-3" style={{ color: "#fff" }}>
              Your Growth Profile is ready.
            </h2>
            <p className="text-sm mb-3" style={{ color: "#7A98B4" }}>
              We analyzed 130+ data points across your company profile, documents, and benchmark cohort.
            </p>
            <div className="flex items-center justify-center gap-4 mb-8 text-xs">
              {[
                { label: "Data points", value: "130+" },
                { label: "Cohort size", value: "14" },
                { label: "Confidence", value: "High" },
              ].map(({ label, value }) => (
                <div key={label} className="text-center px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="font-mono font-semibold text-base mb-0.5" style={{ color: "#6EE7A8" }}>{value}</div>
                  <div style={{ color: "#5A7A96" }}>{label}</div>
                </div>
              ))}
            </div>
            <button
              onClick={onComplete}
              className="px-8 py-3.5 rounded-lg font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "var(--green)", color: "#fff" }}
            >
              View Your Benchmark →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
