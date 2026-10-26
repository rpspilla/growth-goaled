import Link from "next/link";

const STAGES = [
  { title: "Pick a use case", line: "Choose the question you most need answered and tell us what you're aiming for." },
  { title: "Connect the relevant data", line: "Share the files that use case needs. Upload whatever you have; we'll sort it." },
  { title: "Receive your baseline and plan", line: "An advisor-approved view of where you stand today, the gap to your target and what to do." },
  { title: "Track your progress", line: "Follow your KPIs and plan month by month, with your advisor alongside." },
] as const;

/** Overview: how Growth Goaled works, with the company's current position highlighted. */
export function JourneyVisual({ stage, action }: { stage: number; action?: { label: string; href: string } }) {
  return (
    <div>
      <ol className="grid md:grid-cols-4 gap-3" aria-label="How Growth Goaled works">
        {STAGES.map((s, i) => {
          const done = i < stage;
          const current = i === stage;
          return (
            <li
              key={s.title}
              aria-current={current ? "step" : undefined}
              className="relative rounded-xl border p-5"
              style={{
                background: current ? "var(--green-muted)" : "var(--card)",
                borderColor: current ? "var(--green)" : "var(--border)",
                opacity: done || current ? 1 : 0.75,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ background: done || current ? "var(--green)" : "var(--muted)", color: done || current ? "#fff" : "var(--muted-foreground)" }}
                >
                  {done ? "✓" : i + 1}
                </span>
                {current && <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--green)" }}>You are here</span>}
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>{s.title}</div>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{s.line}</p>
              {i < STAGES.length - 1 && (
                <span aria-hidden className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 text-sm z-10" style={{ color: "var(--muted-foreground)" }}>→</span>
              )}
            </li>
          );
        })}
      </ol>
      {action && (
        <Link href={action.href} className="inline-block mt-6 px-5 py-2.5 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
          {action.label} →
        </Link>
      )}
    </div>
  );
}
