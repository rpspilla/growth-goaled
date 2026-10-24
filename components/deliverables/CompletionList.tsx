import Link from "next/link";
import type { CompletionStep } from "@/lib/completion";

/** "To complete your full report": ordered steps, each linking to where to fix it. */
export function CompletionList({ steps }: { steps: CompletionStep[] }) {
  return (
    <div className="rounded-xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>To complete your fully calculated report</div>
      {steps.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          You&apos;ve provided everything the full report needs. Your advisor will review it and publish the final version.
        </p>
      ) : (
        <>
          <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>Do these in order; each one makes more of the comparison exact.</p>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="font-mono text-xs w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--muted)", color: "var(--foreground)" }}>{i + 1}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{s.title}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{s.detail}</div>
                  <Link href={s.href} className="text-xs font-semibold" style={{ color: "var(--green)" }}>{s.label} →</Link>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
