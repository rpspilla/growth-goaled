import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import type { CurrentPlan } from "@/lib/data/current-plan";

const dueLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The plan the company is working on with its advisor, front and centre, with its top three
 * priorities (status and the founder's next step) and a link to the full plan; or a way to start one.
 */
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
  // Not live until an advisor approves it (drafting or in review): no priorities yet.
  const waiting = current.plan?.status === "drafting" || current.plan?.status === "in_review";
  const p = waiting ? null : current.progress;
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
            </div>
          ) : waiting ? null : (
            <p className="text-base mt-2" style={{ color: "var(--muted-foreground)" }}>Your advisor is setting the milestones; progress shows here as they&apos;re done.</p>
          )}
        </div>
        {current.plan && <Link href={current.plan.href} className="btn btn-primary">Open the full plan</Link>}
      </div>
      {waiting && (
        <p role="status" className="mt-4 text-base" style={{ color: "var(--foreground)" }}>
          <strong>Your advisor is reviewing your plan.</strong> <span style={{ color: "var(--muted-foreground)" }}>We aim to finish within 24 hours.</span>
        </p>
      )}
      {!waiting && p && p.priorities.length > 0 && (
        <div className="mt-6">
          <h3 className="label mb-2" style={{ color: "var(--muted-foreground)" }}>Your top {p.priorities.length === 1 ? "priority" : `${p.priorities.length} priorities`}</h3>
          <ol aria-label="Top priorities" className="grid gap-3 lg:grid-cols-3">
            {p.priorities.map((x, i) => (
              <li key={i} className="rounded-xl p-4 space-y-2" style={{ background: "var(--muted)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={x.status === "doing" ? { background: "var(--blue-muted)", color: "var(--blue)" } : { background: "var(--card)", color: "var(--muted-foreground)" }}>
                    {x.status === "doing" ? "In progress" : "To do"}
                  </span>
                  {x.due && <span className="text-xs font-medium" style={{ color: x.overdue ? "var(--red)" : "var(--muted-foreground)" }}>{x.overdue ? "Overdue · " : "Due "}{dueLabel(x.due)}</span>}
                </div>
                <p className="text-base font-medium" style={{ color: "var(--foreground)" }}>{x.action}</p>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}><span className="font-semibold" style={{ color: "var(--green)" }}>Your next step: </span>{x.next}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
