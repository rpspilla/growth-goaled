import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { ActionForm } from "@/components/advisor/ActionForm";
import { ProjectFileUpload } from "@/components/advisor/ProjectFileUpload";
import { companyProjects, documentHref, prioritiesFor, today } from "@/lib/data/projects";
import { addDays, MAX_PRIORITIES, weekLabel, weekStart } from "@/lib/weeks";
import { companyContext } from "../context";
import { CommitmentList } from "@/components/projects/CommitmentList";
import { commitmentItems } from "@/lib/commitments";
import { companyCommitments } from "@/lib/data/commitments";
import { addProjectFileAction, addProjectLinkAction, approveResultAction, createProjectAction, deleteProjectAction, deleteResultAction, removeProjectDocumentAction, savePrioritiesAction, saveResultAction, updateProjectAction } from "./actions";

export const metadata = { title: "Growth projects" };

const card = { background: "var(--card)", borderColor: "var(--border)" };
const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * The advisor runs the company's work here, and the founder sees it (Founder View redesign):
 * this week's priorities, and each growth project with its action plan, documents and results.
 */
export default async function CompanyProjectsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  const [{ id }, { week: w }] = await Promise.all([params, searchParams]);
  const { company } = await companyContext(id);
  const thisWeek = weekStart(today());
  const week = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? weekStart(w) : thisWeek;
  const [projects, priorities, commitments] = await Promise.all([companyProjects(company, { allResults: true }), prioritiesFor(company, week), companyCommitments(company)]);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const base = `/advisor/companies/${company.id}/projects`;

  return (
    <div className="page space-y-8">
      <header>
        <h1 className="font-display text-3xl" style={fg}>{company.name}: growth projects</h1>
        <p className="text-sm mt-1" style={muted}>You run these; {company.name} sees them. Priorities and documents show straight away; results only once you approve them.</p>
      </header>

      <section aria-label="Weekly priorities" className="rounded-xl border p-5 space-y-4" style={card}>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold" style={fg}>Top priorities · {weekLabel(week)}</h2>
            <p className="text-sm" style={muted}>Up to {MAX_PRIORITIES}: what matters, and the action for the next seven days. Shown on the founder&apos;s Overview.</p>
          </div>
          <nav aria-label="Week" className="flex gap-3 text-sm">
            <Link className="link" href={`${base}?week=${addDays(week, -7)}`}>← Previous week</Link>
            {week !== thisWeek && <Link className="link" href={base}>This week</Link>}
            <Link className="link" href={`${base}?week=${addDays(week, 7)}`}>Next week →</Link>
          </nav>
        </div>
        <ActionForm action={savePrioritiesAction.bind(null, company.id, week)} submit="Save this week's priorities" label="This week's priorities" className="space-y-3">
          {Array.from({ length: MAX_PRIORITIES }, (_, n) => {
            const p = priorities[n];
            return (
              <div key={`${week}-${n}`} className="grid md:grid-cols-[2fr_3fr_auto] gap-2 items-start">
                <input name={`title-${n}`} defaultValue={p?.title ?? ""} placeholder={n === 0 ? "e.g. Close the AE hire" : "Priority"} aria-label={`Priority ${n + 1}`} className="field" maxLength={160} />
                <input name={`action-${n}`} defaultValue={p?.action ?? ""} placeholder="Action for the next 7 days" aria-label={`Priority ${n + 1} action`} className="field" maxLength={500} />
                <input type="date" name={`due-${n}`} defaultValue={p?.dueOn ?? ""} min={week} max={addDays(week, 7)} aria-label={`Priority ${n + 1} due`} className="field" />
              </div>
            );
          })}
        </ActionForm>
      </section>

      <section aria-label="New growth project" className="rounded-xl border p-5 space-y-3" style={card}>
        <h2 className="text-lg font-semibold" style={fg}>Start a growth project</h2>
        <ActionForm action={createProjectAction.bind(null, company.id)} submit="Create project" label="New growth project" resetOnSuccess className="flex gap-2 items-end flex-wrap">
          <label className="text-sm flex-1 min-w-[14rem]" style={muted}>
            Name
            <input name="name" required placeholder="e.g. Growth Hiring Plan" className="field w-full mt-1" maxLength={120} />
          </label>
          <label className="text-sm" style={muted}>
            Started
            <input type="date" name="startedOn" required defaultValue={today()} className="field w-full mt-1" />
          </label>
        </ActionForm>
      </section>

      {projects.length === 0 && <p className="text-sm" style={muted}>No growth projects yet.</p>}
      {projects.map((p) => (
        <section key={p.id} aria-label={`Project: ${p.name}`} className="rounded-xl border p-5 space-y-5" style={card}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold" style={fg}>{p.name}</h2>
              <p className="text-sm" style={muted}>
                {p.status === "completed" ? "Completed" : "Open"} · started {day(p.startedOn)}
                {p.completedOn ? ` · completed ${day(p.completedOn)}` : ""}
              </p>
            </div>
            <form action={deleteProjectAction.bind(null, company.id, p.id)}>
              <button type="submit" className="text-sm" style={{ color: "var(--red)" }} aria-label={`Delete ${p.name}`}>Delete project</button>
            </form>
          </div>

          <ActionForm action={updateProjectAction.bind(null, company.id, p.id)} submit="Save" label={`Edit ${p.name}`} className="flex gap-2 items-end flex-wrap">
            <label className="text-sm flex-1 min-w-[12rem]" style={muted}>
              Name
              <input name="name" required defaultValue={p.name} className="field w-full mt-1" maxLength={120} />
            </label>
            <label className="text-sm" style={muted}>
              Status
              <select name="status" defaultValue={p.status} className="field w-full mt-1">
                <option value="open">Open</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label className="text-sm" style={muted}>
              Started
              <input type="date" name="startedOn" required defaultValue={p.startedOn} className="field w-full mt-1" />
            </label>
            <label className="text-sm" style={muted}>
              Completed
              <input type="date" name="completedOn" defaultValue={p.completedOn ?? ""} className="field w-full mt-1" />
            </label>
          </ActionForm>

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <h3 className="font-semibold" style={fg}>Action plan</h3>
              {p.actionPlan ? (
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <a href={documentHref(p.actionPlan)} target="_blank" rel="noopener" className="link inline-flex items-center gap-1">
                    {p.actionPlan.url ? <ExternalLink size={14} aria-hidden /> : <FileText size={14} aria-hidden />} {p.actionPlan.title}
                  </a>
                  <form action={removeProjectDocumentAction.bind(null, company.id, p.actionPlan.id)}>
                    <button type="submit" className="text-sm" style={{ color: "var(--red)" }} aria-label={`Remove the action plan of ${p.name}`}>Remove</button>
                  </form>
                </div>
              ) : (
                <p className="text-sm" style={muted}>None yet. The founder sees &ldquo;Review Action Plan&rdquo; once you add one.</p>
              )}
              <ActionForm action={addProjectLinkAction.bind(null, company.id, p.id, "action_plan")} submit={p.actionPlan ? "Replace with this link" : "Add link"} label={`Action plan link for ${p.name}`} resetOnSuccess className="flex gap-2 items-end flex-wrap">
                <input name="url" type="url" required placeholder="https://docs.google.com/…" aria-label="Action plan link" className="field flex-1 min-w-[14rem]" />
                <input name="title" placeholder="Title (optional)" aria-label="Action plan title" className="field" maxLength={160} />
              </ActionForm>
              <ProjectFileUpload companyId={company.id} label={`Upload the action plan for ${p.name}`} save={addProjectFileAction.bind(null, company.id, p.id, "action_plan")} />
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold" style={fg}>Documents</h3>
              {p.documents.length ? (
                <ul className="text-sm space-y-1" aria-label={`Documents of ${p.name}`}>
                  {p.documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 flex-wrap">
                      <a href={documentHref(d)} target="_blank" rel="noopener" className="link inline-flex items-center gap-1">
                        {d.url ? <ExternalLink size={14} aria-hidden /> : <FileText size={14} aria-hidden />} {d.title}
                      </a>
                      <form action={removeProjectDocumentAction.bind(null, company.id, d.id)}>
                        <button type="submit" className="text-xs" style={{ color: "var(--red)" }} aria-label={`Remove ${d.title}`}>Remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm" style={muted}>None yet.</p>
              )}
              <ActionForm action={addProjectLinkAction.bind(null, company.id, p.id, "document")} submit="Add link" label={`Document link for ${p.name}`} resetOnSuccess className="flex gap-2 items-end flex-wrap">
                <input name="url" type="url" required placeholder="https://…" aria-label="Document link" className="field flex-1 min-w-[14rem]" />
                <input name="title" placeholder="Title (optional)" aria-label="Document title" className="field" maxLength={160} />
              </ActionForm>
              <ProjectFileUpload companyId={company.id} label={`Upload a document for ${p.name}`} save={addProjectFileAction.bind(null, company.id, p.id, "document")} />
            </div>
          </div>

          {commitments.some((c) => c.projectId === p.id) && (
            <div className="space-y-3">
              <h3 className="font-semibold" style={fg}>
                Commitments <span className="text-sm font-normal" style={muted}>· made by the founder with their AI CRO; they tick them off</span>
              </h3>
              <CommitmentList items={commitmentItems(commitments.filter((c) => c.projectId === p.id), names, today(), { withProject: false }).map((c) => ({ ...c, conversationId: null }))} label={`Commitments of ${p.name}`} />
            </div>
          )}

          <div className="space-y-3">
            <h3 className="font-semibold" style={fg}>Results <span className="text-sm font-normal" style={muted}>· the founder sees only approved ones</span></h3>
            {p.results.length > 0 && (
              <ul className="space-y-3" aria-label={`Results of ${p.name}`}>
                {p.results.map((r) => (
                  <li key={r.id} className="rounded-lg p-3 space-y-2" style={{ background: "var(--muted)" }}>
                    <div className="flex items-center gap-3 flex-wrap text-sm">
                      <span className="font-semibold" style={fg}>{r.label}{r.value ? `: ${r.value}` : ""}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={r.approvedAt ? { background: "var(--green-muted)", color: "var(--green)" } : { background: "var(--amber-muted)", color: "var(--amber)" }}>
                        {r.approvedAt ? "Approved: the founder sees it" : "Draft: not shown"}
                      </span>
                      <form action={approveResultAction.bind(null, company.id, r.id, !r.approvedAt)}>
                        <button type="submit" className="link text-sm" aria-label={`${r.approvedAt ? "Withdraw" : "Approve"} ${r.label}`}>{r.approvedAt ? "Withdraw" : "Approve"}</button>
                      </form>
                      <form action={deleteResultAction.bind(null, company.id, r.id)}>
                        <button type="submit" className="text-sm" style={{ color: "var(--red)" }} aria-label={`Delete ${r.label}`}>Delete</button>
                      </form>
                    </div>
                    <ActionForm action={saveResultAction.bind(null, company.id, p.id, r.id)} submit="Save changes" label={`Edit ${r.label}`} className="grid md:grid-cols-[2fr_1fr_2fr_auto] gap-2 items-end">
                      <input name="label" required defaultValue={r.label} aria-label="Result" className="field" maxLength={160} />
                      <input name="value" defaultValue={r.value ?? ""} aria-label="Value" className="field" maxLength={200} />
                      <input name="note" defaultValue={r.note ?? ""} aria-label="Note" className="field" maxLength={1000} />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={saveResultAction.bind(null, company.id, p.id, null)} submit="Add result" label={`New result for ${p.name}`} resetOnSuccess className="grid md:grid-cols-[2fr_1fr_2fr_auto] gap-2 items-end">
              <input name="label" required placeholder="e.g. Pipeline created by the new hire" aria-label="New result" className="field" maxLength={160} />
              <input name="value" placeholder="e.g. $240,000" aria-label="New result value" className="field" maxLength={200} />
              <input name="note" placeholder="Note (optional)" aria-label="New result note" className="field" maxLength={1000} />
            </ActionForm>
            <p className="text-xs" style={muted}>Editing an approved result takes it back to draft until you approve it again.</p>
          </div>
        </section>
      ))}
    </div>
  );
}
