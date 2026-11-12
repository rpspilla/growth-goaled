import { answerLine } from "@/lib/plan-requests";
import { progressView } from "@/lib/data/plan";
import { companyContext } from "../context";
import { approveGrowthPlanAction } from "../actions";
import { hiringPlanView } from "@/lib/data/hiring";
import { HiringMath } from "@/components/progress/HiringMath";

const card = { background: "var(--card)", borderColor: "var(--border)" };
const STATUS = { not_started: "Not started", in_progress: "In progress", done: "Done", dropped: "Dropped" } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Step 5 mirrored (read-only): the founder's committed plan, its metrics against baseline and the reassessment date. */
export default async function CompanyProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { company, active } = await companyContext((await params).id);
  const view = active ? await progressView(company, active.def.id) : null;
  const hiring = view && active?.def.id === "hire_or_fix" ? await hiringPlanView(company, view.actions.filter((a) => a.assignee === "founder")) : null;
  return (
    <div className="page space-y-6">
      <div>
        <div className="label mb-1" style={{ color: "var(--muted-foreground)" }}>Step 5 · Progress &amp; Tracking{active ? ` · ${active.def.shortTitle}` : ""}</div>
        <h1 className="font-display text-3xl font-normal" style={{ color: "var(--foreground)" }}>{company.name}: progress</h1>
      </div>
      {!view ? (
        <div className="rounded-xl border p-6 text-sm" style={{ ...card, color: "var(--muted-foreground)" }}>
          Tracking starts when the founder commits to the plan in their results.
        </div>
      ) : (
        <>
          {!view.planApprovedAt ? (
            <form action={approveGrowthPlanAction.bind(null, company.id, view.deliverableId)} role="region" aria-label="Plan review" className="rounded-xl border p-5 flex items-center gap-4 flex-wrap" style={{ ...card, borderColor: "var(--amber)" }}>
              <div className="flex-1 min-w-[16rem] text-sm">
                <div className="font-semibold" style={{ color: "var(--foreground)" }}>Waiting for your review</div>
                <p style={{ color: "var(--muted-foreground)" }}>The founder sees &ldquo;Your advisor is reviewing your plan&rdquo; and can answer their inputs. The rest of the plan goes live when you approve it.</p>
              </div>
              <button type="submit" className="btn btn-primary">Approve the plan</button>
            </form>
          ) : (
            <p className="text-sm" style={{ color: "var(--green)" }}>Plan approved {date(view.planApprovedAt)}: live for the founder.</p>
          )}
          {hiring && <HiringMath result={hiring.result} />}
          <div className="rounded-xl border p-5 text-sm space-y-1" style={card}>
            <div style={{ color: "var(--foreground)" }}>
              Plan from brief version {view.version}, committed {date(view.committedAt)}: <span className="font-semibold">{view.decision}</span>
            </div>
            <div style={{ color: view.revisitDue ? "var(--amber)" : "var(--muted-foreground)" }}>{view.revisitDue ? "Reassessment is due." : `Reassess by ${date(view.revisitBy)}.`}</div>
            {view.newSince.length > 0 && <div style={{ color: "var(--muted-foreground)" }}>New since the brief: {view.newSince.map((n) => `${n.label} ${n.value}`).join(", ")}.</div>}
          </div>
          {view.metrics.length > 0 && (
            <div className="rounded-xl border p-5 text-sm" style={card}>
              <div className="label mb-2" style={{ color: "var(--muted-foreground)" }}>Metrics against baseline</div>
              <ul className="space-y-1">
                {view.metrics.map((m) => (
                  <li key={m.metric} style={{ color: "var(--foreground)" }}>
                    {m.label}: {m.baseline ?? "—"} → {m.latest ?? "no new figure yet"}
                    {m.direction && m.direction !== "same" && <span style={{ color: m.direction === "better" ? "var(--green)" : "var(--red)" }}> ({m.direction})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-xl border p-5 text-sm" style={card}>
            <div className="label mb-2" style={{ color: "var(--muted-foreground)" }}>Plan</div>
            <h3 className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>Founder inputs</h3>
            <ol className="space-y-2 mb-4" aria-label="Founder inputs">
              {view.actions.filter((a) => a.assignee === "founder").map((a) => (
                <li key={a.id} style={{ color: "var(--foreground)" }}>
                  {a.priority}. {a.action} <span style={{ color: "var(--muted-foreground)" }}>· {STATUS[a.status]}{a.note ? ` · “${a.note}”` : ""}</span>
                  {a.request && (
                    <div className="text-xs mt-0.5" style={{ color: a.request.answer ? "var(--green)" : "var(--muted-foreground)" }}>
                      {a.request.answer ? `Answered: ${answerLine(a.request)}` : `Asks for: ${a.request.fields.map((f) => f.label).join(" · ") || "—"}${a.request.columns.length ? ` (or a file with: ${a.request.columns.join(", ")})` : ""}`}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <h3 className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>Growth Goaled&apos;s tasks <span className="text-xs font-normal" style={{ color: "var(--muted-foreground)" }}>· advisors only</span></h3>
            <ol className="space-y-2" aria-label="Growth Goaled's tasks">
              {view.actions.filter((a) => a.assignee === "growth_goaled").map((a) => (
                <li key={a.id} style={{ color: "var(--foreground)" }}>
                  {a.priority}. {a.action} <span style={{ color: "var(--muted-foreground)" }}>· {STATUS[a.status]}</span>
                </li>
              ))}
              {!view.actions.some((a) => a.assignee === "growth_goaled") && <li style={{ color: "var(--muted-foreground)" }}>None.</li>}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
