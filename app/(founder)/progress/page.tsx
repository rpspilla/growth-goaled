import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PlanTracker } from "@/components/progress/PlanTracker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sparkline } from "@/components/ui/Sparkline";
import { ExpandableDetail, ProgressRing, TONE } from "@/components/visual/primitives";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, RefreshCw } from "lucide-react";
import { RunAssessmentButton } from "@/components/use-cases/RunAssessmentButton";
import { founderContext } from "@/lib/data/founder-context";
import { progressView } from "@/lib/data/plan";
import { updatePlanActionAction } from "./actions";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const muted = { color: "var(--muted-foreground)" };

/** Step 5: the committed plan, its metrics against baseline, and when to reassess. */
export default async function ProgressPage() {
  const { company, active } = await founderContext();
  if (!active || !company) redirect("/library");
  const view = await progressView(company, active.def.id);

  if (!view) {
    return (
      <div className="px-4 sm:px-8 py-8 max-w-4xl">
        <PageHeader eyebrow={active.def.shortTitle} title="Action plan" subtitle="Track the actions from your assessment, and see your figures move against your baseline." />
        <EmptyState
          title="No plan to track yet"
          body="Tracking starts when you commit to the plan in your results. Each action then gets a status, a note and its metric against your baseline."
          action={<Link href="/baseline" className="btn btn-primary">Go to your results →</Link>}
        />
      </div>
    );
  }

  const done = view.actions.filter((a) => a.status === "done").length;
  const live = view.actions.filter((a) => a.status !== "dropped").length;
  const attention = view.revisitDue || view.newSince.length > 0;
  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl space-y-8">
      <header>
        <div className="label">{active.def.shortTitle}</div>
        <h1 className="font-display text-3xl sm:text-4xl mt-1" style={{ color: "var(--foreground)" }}>
          Action plan
        </h1>
        <p className="text-base mt-1" style={muted} title={view.decision}>
          {view.decision}
        </p>
      </header>

      <div className="grid md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)] gap-4 items-stretch">
        <div className="surface p-5 flex items-center justify-center">
          <ProgressRing value={live ? done / live : 0} label={`${done} of ${live} done`} size={104} />
        </div>
        <div className="surface p-5 flex flex-col gap-3" style={attention ? { borderColor: "var(--amber)", boxShadow: "0 0 0 1px var(--amber)" } : undefined}>
          <div className="flex items-center gap-2 flex-wrap">
            <CalendarClock size={18} style={{ color: attention ? "var(--amber)" : "var(--green)" }} aria-hidden />
            <span className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
              {view.revisitDue ? "Time to reassess" : "Next reassessment"}
            </span>
            <span data-label className="font-mono text-xs px-2 py-0.5 rounded-full" style={{ background: attention ? "var(--amber-muted)" : "var(--green-muted)", color: attention ? "#92400E" : "var(--green)" }}>
              {date(view.revisitBy)}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-auto">
            <RunAssessmentButton label="Reassess now" primary />
            <Link href="/data" className="link text-sm">
              Add data
            </Link>
          </div>
          {view.revisitTrigger && (
            <ExpandableDetail summary="When to reassess sooner">
              <p>Or sooner if: {view.revisitTrigger.replace(/\.$/, "")}.</p>
              <p>Plan from brief version {view.version}, committed {date(view.committedAt)}.</p>
            </ExpandableDetail>
          )}
        </div>
        <div className="surface p-5">
          <div className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>
            Figures that changed since the brief
          </div>
          {view.newSince.length ? (
            <ul className="space-y-1.5">
              {view.newSince.slice(0, 5).map((n) => {
                const m = view.metrics.find((x) => x.label === n.label);
                const Icon = m?.direction === "better" ? ArrowUpRight : m?.direction === "worse" ? ArrowDownRight : RefreshCw;
                const color = m?.direction === "better" ? "var(--green)" : m?.direction === "worse" ? "var(--red)" : "var(--muted-foreground)";
                return (
                  <li key={n.label} data-label className="flex items-center gap-2 text-sm">
                    <Icon size={15} style={{ color }} aria-hidden />
                    <span className="flex-1 min-w-0 truncate" style={{ color: "var(--foreground)" }}>
                      {n.label}
                    </span>
                    <span className="font-mono font-semibold" style={{ color: "var(--foreground)" }}>
                      {n.value}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p data-label className="text-sm" style={muted}>
              None yet · upload fresh exports on Data
            </p>
          )}
          {view.newSince.length > 5 && (
            <p data-label className="text-xs mt-1" style={muted}>
              +{view.newSince.length - 5} more
            </p>
          )}
        </div>
      </div>

      {view.newerBrief && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2 flex-wrap" role="note" style={{ background: "var(--amber-muted)", color: "#78350F" }}>
          <AlertTriangle size={16} aria-hidden />
          <span className="font-semibold">Newer brief ready (version {view.newerBrief}).</span>
          <Link href="/baseline" className="font-semibold underline">
            Review it and commit to its plan →
          </Link>
        </div>
      )}

      <section aria-labelledby="progress-plan" className="space-y-3">
        <h2 id="progress-plan" className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
          Plan · {done} of {live} done
        </h2>
        <PlanTracker actions={view.actions} update={updatePlanActionAction} />
      </section>

      {view.metrics.length > 0 && (
        <section aria-labelledby="progress-metrics" className="space-y-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 id="progress-metrics" className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
              Metrics against your baseline
            </h2>
            <span data-label className="text-xs" style={muted} title="Latest values are confirmed or calculated figures recorded since your brief. Upload fresh exports on the Data step to update them.">
              Confirmed or calculated figures since your brief
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {view.metrics.map((m) => {
              const tone = m.direction === "better" ? "green" : m.direction === "worse" ? "red" : "neutral";
              const word = m.direction === "better" ? "Improving" : m.direction === "worse" ? "Worse" : m.direction === "same" ? "No change" : "No new figure yet";
              return (
                <div key={m.metric} className="surface p-4 flex flex-col gap-1.5 min-w-0">
                  <div className="text-xs font-semibold truncate" style={muted}>
                    {m.label}
                  </div>
                  <div className="flex items-baseline gap-1.5 font-mono">
                    <span className="text-sm" style={muted}>
                      {m.baseline ?? "—"}
                    </span>
                    <span aria-hidden style={muted}>
                      →
                    </span>
                    <span className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
                      {m.latest ?? "—"}
                    </span>
                  </div>
                  {m.series.length >= 2 ? <Sparkline values={m.series} lowerIsBetter={m.lowerIsBetter} label={`${m.label}: baseline ${m.baseline ?? "—"}, latest ${m.latest ?? "—"}`} height={36} /> : <div className="h-9" aria-hidden />}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span data-label className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>
                      {m.direction === "better" ? "▲" : m.direction === "worse" ? "▼" : ""} {word}
                    </span>
                    {m.latestAt && (
                      <span data-label className="text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }}>
                        {date(m.latestAt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
