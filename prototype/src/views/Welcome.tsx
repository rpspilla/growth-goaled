interface WelcomeProps {
  onStart: () => void;
  onSample: () => void;
}

export default function Welcome({ onStart, onSample }: WelcomeProps) {
  return (
    <div
      className="relative min-h-full flex flex-col items-center justify-center px-8 py-16 overflow-hidden"
      style={{ background: "var(--navy)" }}
    >
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 60% at 50% 40%, rgba(21,90,60,0.18) 0%, transparent 70%)`,
        }}
      />
      {/* Fine grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-xl text-center" style={{ animation: "fadeInUp 0.5s ease-out" }}>
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8"
          style={{ background: "rgba(21,90,60,0.3)", color: "#6EE7A8", border: "1px solid rgba(21,90,60,0.5)" }}
        >
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#6EE7A8" }} />
          Growth Intelligence Platform
        </div>

        <h1 className="font-display text-5xl font-normal mb-6 leading-tight" style={{ color: "#FFFFFF" }}>
          Let's understand
          <br />
          <em>your growth engine.</em>
        </h1>

        <p className="text-base mb-10 leading-relaxed mx-auto max-w-md" style={{ color: "#7A98B4" }}>
          Growth Goaled combines your company data with benchmark intelligence to identify where you're ahead, where you're behind, and what to do next.
        </p>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onStart}
            className="w-full max-w-xs py-3.5 px-8 rounded-lg font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            Start Your Growth Profile
          </button>
          <button
            onClick={onSample}
            className="w-full max-w-xs py-3.5 px-8 rounded-lg text-sm transition-all"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "#7A98B4",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            Explore a sample company
          </button>
        </div>

        {/* Core promise */}
        <div className="mt-12 pt-8 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-center gap-2 mb-6">
            {["Know where you stand.", "Know what to fix.", "Know what comes next."].map((phrase, i) => (
              <div key={phrase} className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "#5A7A96" }}>{phrase}</span>
                {i < 2 && <span style={{ color: "#1E3347" }}>·</span>}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-10">
            {[
              { label: "Benchmark companies", value: "400+" },
              { label: "Avg. ARR analyzed", value: "$6.2M" },
              { label: "Founder rating", value: "4.9/5" },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="font-mono text-2xl font-semibold mb-1" style={{ color: "#fff" }}>{value}</div>
                <div className="text-xs" style={{ color: "#4A6A86" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
