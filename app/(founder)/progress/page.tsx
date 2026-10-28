import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PlanTracker } from "@/components/progress/PlanTracker";
import { EmptyState } from "@/components/ui/EmptyState";
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
    <div className="px-4 sm:px-8 py-8 max-w-4xl space-y-10">
      <PageHeader eyebrow={active.def.shortTitle} title="Action plan" subtitle={view.decision} />

      <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-stretch -mt-4">
        <div className="surface p-5">
          <div className="text-sm font-semibold" style={muted}>Progress</div>
          <div className="text-2xl font-semibold mt-0.5" style={{ color: "var(--foreground)" }}>{done} of {live} actions done</div>
          <div className="h-2 rounded-full mt-3 overflow-hidden" style={{ background: "var(--muted)" }} role="progressbar" aria-valuemin={0} aria-valuemax={live} aria-valuenow={done} aria-label="Actions done">
            <div className="h-full rounded-full" style={{ width: `${live ? (done / live) * 100 : 0}%`, background: "var(--green)" }} />
          </div>
          <p className="text-sm mt-3" style={muted}>Plan from brief version {view.version}, committed {date(view.committedAt)}.</p>
        </div>
        <div className="surface p-5 sm:w-80" style={attention ? { borderColor: "var(--amber)", boxShadow: "0 0 0 1px var(--amber)" } : undefined}>
          <div className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
            {view.revisitDue ? "Time to reassess" : `Reassess by ${date(view.revisitBy)}`}
          </div>
          <p className="text-sm mt-1" style={muted}>
            {view.newSince.length
              ? `${view.newSince.length} ${view.newSince.length === 1 ? "figure has" : "figures have"} changed since your brief (${view.newSince.map((n) => `${n.label} ${n.value}`).join(", ")}). Reassess to see whether the diagnosis still holds.`
              : view.revisitTrigger
                ? `Or sooner if: ${view.revisitTrigger.replace(/\.$/, "")}.`
                : "Add new data on the Data step, then reassess."}
          </p>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <RunAssessmentButton label="Reassess now" primary />
            <Link href="/data" className="link text-sm">Add data</Link>
          </div>
        </div>
      </div>

      {view.newerBrief && (
        <div className="rounded-xl px-5 py-4 text-base" role="note" style={{ background: "var(--amber-muted)", color: "#78350F" }}>
          A newer brief (version {view.newerBrief}) is ready. <Link href="/baseline" className="font-semibold underline">Review it and commit to its plan →</Link>
        </div>
      )}

      <section aria-labelledby="progress-plan" className="space-y-3">
        <div>
          <h2 id="progress-plan" className="text-xl sm:text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            Plan · {done} of {live} done
          </h2>
          <p className="text-base mt-1" style={muted}>Update each action as you go. Owners are yours to decide; the brief doesn&apos;t assign them.</p>
        </div>
        <PlanTracker actions={view.actions} update={updatePlanActionAction} />
      </section>

      {view.metrics.length > 0 && (
        <section aria-labelledby="progress-metrics" className="space-y-3">
          <h2 id="progress-metrics" className="text-xl sm:text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Metrics against your baseline</h2>
          <div className="surface p-5">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-base min-w-[480px]">
                <thead>
                  <tr className="text-left text-sm" style={muted}>
                    <th className="py-2 px-1 font-semibold">Metric</th>
                    <th className="py-2 px-1 font-semibold">Baseline</th>
                    <th className="py-2 px-1 font-semibold">Latest</th>
                    <th className="py-2 px-1 font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {view.metrics.map((m) => (
                    <tr key={m.metric} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                      <td className="py-3 px-1" style={{ color: "var(--foreground)" }}>{m.label}</td>
                      <td className="py-3 px-1 font-semibold" style={{ color: "var(--foreground)" }}>
                        {m.baseline ?? "—"}
                        {m.baselinePeriod && m.baselinePeriod !== "Current" && <div className="text-sm font-normal" style={muted}>{m.baselinePeriod}</div>}
                      </td>
                      <td className="py-3 px-1 font-semibold" style={{ color: "var(--foreground)" }}>
                        {m.latest ?? "—"}
                        {m.latestAt && <div className="text-sm font-normal" style={muted}>updated {date(m.latestAt)}</div>}
                      </td>
                      <td className="py-3 px-1 text-sm font-semibold" style={{ color: m.direction === "better" ? "var(--green)" : m.direction === "worse" ? "var(--red)" : "var(--muted-foreground)" }}>
                        {m.direction === "better" ? "▲ Improving" : m.direction === "worse" ? "▼ Worse" : m.direction === "same" ? "No change" : "No new figure yet"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-3" style={muted}>Latest values are confirmed or calculated figures recorded since your brief. Upload fresh exports on the Data step to update them.</p>
          </div>
        </section>
      )}
    </div>
  );
}
