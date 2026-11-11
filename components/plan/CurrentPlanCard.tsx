import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import type { CurrentPlan } from "@/lib/data/current-plan";

/** The plan the company is working on with its advisor, front and centre; or a big way to start one. */
export function CurrentPlanCard({ current, startHref = "/library", heading = "Current plan with your advisor" }: { current: CurrentPlan | null; startHref?: string; heading?: string }) {
  if (!current)
    return (
      <section aria-label="Current plan" className="surface p-6 sm:p-8 flex flex-col items-start gap-4">
        <div>
          <div className="label" style={{ color: "var(--muted-foreground)" }}>{heading}</div>
          <p className="text-lg mt-1" style={{ color: "var(--muted-foreground)" }}>No plan yet. Pick what to work on and your advisor builds it with you.</p>
        </div>
        <Link href={startHref} className="btn btn-primary btn-lg inline-flex items-center gap-2 text-lg px-7 py-4">
          Start a new plan with your advisor here <ArrowRight size={20} aria-hidden />
        </Link>
      </section>
    );
  const p = current.progress;
  const pct = p ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <section aria-label="Current plan" className="surface p-6 sm:p-8" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }}>
      <div className="flex items-start gap-4 flex-wrap">
        <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--green-muted)", color: "var(--green)" }} aria-hidden>
          <ClipboardList size={24} />
        </span>
        <div className="flex-1 min-w-[14rem]">
          <div className="label" style={{ color: "var(--green)" }}>{heading}</div>
          <h2 className="font-display text-3xl sm:text-4xl leading-tight mt-1" style={{ color: "var(--foreground)" }}>{current.name}</h2>
          {p ? (
            <div className="mt-4 max-w-xl">
              <div className="flex justify-between text-sm" style={{ color: "var(--muted-foreground)" }}>
                <span>{p.done} of {p.total} milestones done{p.overdue ? ` · ${p.overdue} overdue` : ""}</span>
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>{pct}%</span>
              </div>
              <div className="h-2 rounded-full mt-1.5" style={{ background: "var(--muted)" }} role="progressbar" aria-label="Plan progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: "var(--green)" }} />
              </div>
              {p.next && <p className="text-base mt-3" style={{ color: "var(--foreground)" }}><span className="font-semibold" style={{ color: "var(--green)" }}>Next: </span>{p.next}</p>}
            </div>
          ) : (
            <p className="text-base mt-2" style={{ color: "var(--muted-foreground)" }}>Your advisor is setting the milestones; progress shows here as they&apos;re done.</p>
          )}
        </div>
        {current.plan && <Link href={current.plan.href} className="btn btn-primary">Open the plan</Link>}
      </div>
    </section>
  );
}
