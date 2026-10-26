import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PlanTracker } from "@/components/progress/PlanTracker";
import { RunAssessmentButton } from "@/components/use-cases/RunAssessmentButton";
import { founderContext } from "@/lib/data/founder-context";
import { progressView } from "@/lib/data/plan";
import { updatePlanActionAction } from "./actions";

const card = { background: "var(--card)", borderColor: "var(--border)" };
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Step 5: the committed plan, its metrics against baseline, and when to reassess. */
export default async function ProgressPage() {
  const { company, active } = await founderContext();
  if (!active || !company) redirect("/library");
  const view = await progressView(company, active.def.id);

  if (!view) {
    return (
      <div className="p-4 sm:p-8 max-w-4xl">
        <PageHeader eyebrow={active.def.shortTitle} title="Progress & Tracking" subtitle="Your plan's actions, its metrics against your baseline, and when to reassess." />
        <div className="rounded-xl border p-6 text-sm space-y-3" style={card}>
          <p style={{ color: "var(--muted-foreground)" }}>Tracking starts when you commit to the plan in your results.</p>
          <Link href="/baseline" className="inline-block px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>Go to Results →</Link>
        </div>
      </div>
    );
  }

  const done = view.actions.filter((a) => a.status === "done").length;
  const live = view.actions.filter((a) => a.status !== "dropped").length;
  return (
    <div className="p-4 sm:p-8 max-w-4xl space-y-5">
      <PageHeader eyebrow={active.def.shortTitle} title="Progress & Tracking" subtitle={`Plan from brief version ${view.version}, committed ${date(view.committedAt)}: ${view.decision}`} />

      <div className="rounded-xl border p-5 text-sm flex items-center gap-4 flex-wrap" style={{ ...card, borderColor: view.revisitDue || view.newSince.length ? "var(--amber)" : "var(--border)" }}>
        <div className="flex-1 min-w-60 space-y-1">
          <div className="font-semibold" style={{ color: "var(--foreground)" }}>
            {view.revisitDue ? "Time to reassess" : `Reassess by ${date(view.revisitBy)}`}
          </div>
          <div style={{ color: "var(--muted-foreground)" }}>
            {view.newSince.length
              ? `${view.newSince.length} ${view.newSince.length === 1 ? "figure has" : "figures have"} changed since your brief (${view.newSince.map((n) => `${n.label} ${n.value}`).join(", ")}). Reassess to see whether the diagnosis still holds.`
              : view.revisitTrigger
                ? `Or sooner if: ${view.revisitTrigger.replace(/\.$/, "")}.`
                : "Add new data on the Data step, then reassess."}
          </div>
          {view.newerBrief && (
            <div style={{ color: "var(--muted-foreground)" }}>
              A newer brief (version {view.newerBrief}) is ready. <Link href="/baseline" style={{ color: "var(--green)" }}>Review it and commit to its plan →</Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/data" className="text-sm font-semibold" style={{ color: "var(--green)" }}>Add data</Link>
          <RunAssessmentButton label="Reassess now" primary />
        </div>
      </div>

      {view.metrics.length > 0 && (
        <section className="rounded-xl border p-5" style={card} aria-labelledby="progress-metrics">
          <h2 id="progress-metrics" className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>Metrics against baseline</h2>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--muted-foreground)" }}>
                  <th className="py-2 px-1 font-semibold">Metric</th>
                  <th className="py-2 px-1 font-semibold">Baseline</th>
                  <th className="py-2 px-1 font-semibold">Latest</th>
                  <th className="py-2 px-1 font-semibold">Change</th>
                </tr>
              </thead>
              <tbody>
                {view.metrics.map((m) => (
                  <tr key={m.metric} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 px-1" style={{ color: "var(--foreground)" }}>{m.label}</td>
                    <td className="py-2.5 px-1 font-mono" style={{ color: "var(--foreground)" }}>
                      {m.baseline ?? "—"}
                      {m.baselinePeriod && m.baselinePeriod !== "Current" && <div className="text-xs font-sans" style={{ color: "var(--muted-foreground)" }}>{m.baselinePeriod}</div>}
                    </td>
                    <td className="py-2.5 px-1 font-mono" style={{ color: "var(--foreground)" }}>
                      {m.latest ?? "—"}
                      {m.latestAt && <div className="text-xs font-sans" style={{ color: "var(--muted-foreground)" }}>updated {date(m.latestAt)}</div>}
                    </td>
                    <td className="py-2.5 px-1 text-xs" style={{ color: m.direction === "better" ? "var(--green)" : m.direction === "worse" ? "var(--red)" : "var(--muted-foreground)" }}>
                      {m.direction === "better" ? "▲ Improving" : m.direction === "worse" ? "▼ Worse" : m.direction === "same" ? "No change" : "No new figure yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>Latest values are confirmed or calculated figures recorded since your brief. Upload fresh exports on the Data step to update them.</p>
        </section>
      )}

      <section className="rounded-xl border p-5" style={card} aria-labelledby="progress-plan">
        <h2 id="progress-plan" className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>
          Plan · {done} of {live} done
        </h2>
        <PlanTracker actions={view.actions} update={updatePlanActionAction} />
      </section>
    </div>
  );
}
