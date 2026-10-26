import { progressView } from "@/lib/data/plan";
import { companyContext } from "../context";

const card = { background: "var(--card)", borderColor: "var(--border)" };
const STATUS = { not_started: "Not started", in_progress: "In progress", done: "Done", dropped: "Dropped" } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Step 5 mirrored (read-only): the founder's committed plan, its metrics against baseline and the reassessment date. */
export default async function CompanyProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { company, active } = await companyContext((await params).id);
  const view = active ? await progressView(company, active.def.id) : null;
  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Step 5 · Progress &amp; Tracking{active ? ` · ${active.def.shortTitle}` : ""}</div>
        <h1 className="font-display text-3xl font-normal" style={{ color: "var(--foreground)" }}>{company.name}: progress</h1>
      </div>
      {!view ? (
        <div className="rounded-xl border p-6 text-sm" style={{ ...card, color: "var(--muted-foreground)" }}>
          Tracking starts when the founder commits to the plan in their results.
        </div>
      ) : (
        <>
          <div className="rounded-xl border p-5 text-sm space-y-1" style={card}>
            <div style={{ color: "var(--foreground)" }}>
              Plan from brief version {view.version}, committed {date(view.committedAt)}: <span className="font-semibold">{view.decision}</span>
            </div>
            <div style={{ color: view.revisitDue ? "var(--amber)" : "var(--muted-foreground)" }}>{view.revisitDue ? "Reassessment is due." : `Reassess by ${date(view.revisitBy)}.`}</div>
            {view.newSince.length > 0 && <div style={{ color: "var(--muted-foreground)" }}>New since the brief: {view.newSince.map((n) => `${n.label} ${n.value}`).join(", ")}.</div>}
          </div>
          {view.metrics.length > 0 && (
            <div className="rounded-xl border p-5 text-sm" style={card}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>Metrics against baseline</div>
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
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>Plan</div>
            <ol className="space-y-2">
              {view.actions.map((a) => (
                <li key={a.id} style={{ color: "var(--foreground)" }}>
                  {a.priority}. {a.action} <span style={{ color: "var(--muted-foreground)" }}>· {STATUS[a.status]}{a.note ? ` · “${a.note}”` : ""}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
