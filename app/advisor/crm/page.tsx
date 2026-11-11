import Link from "next/link";
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, Columns3, Upload } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { AutoSubmit } from "@/components/crm/AutoSubmit";
import { CrmBoard } from "@/components/crm/CrmBoard";
import { QuickAdd } from "@/components/crm/QuickAdd";
import { CATEGORY_NAMES, PRIORITIES, PRIORITY_LABEL } from "@/lib/crm";
import { boardCards, crmSummary, followUps, listCompanies, pipeline, staffUsers, type FollowUpItem } from "@/lib/data/crm";
import { addContactAction, completeTaskAction, moveContactAction } from "./actions";

export const metadata = { title: "CRM" };

const RANGES = { "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months", all: "All time" } as const;
const SORTS = { manual: "Board order", next: "Next follow-up", last: "Last contacted", priority: "Priority", name: "Name", newest: "Newest" } as const;
const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Params = Record<string, string | undefined>;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/**
 * Growth Goaled's internal CRM (staff only): who we're talking to, where they are, what happened
 * last and what to do next. The board is the main view; follow-ups sit above it.
 */
export default async function CrmPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireRole(["advisor", "admin"]);
  const p = await searchParams;
  const filters = { q: p.q, category: p.category, company: p.company, stage: p.stage, priority: p.priority, owner: p.owner, followUp: p.followUp, sort: p.sort };
  const range = (p.range ?? "all") as keyof typeof RANGES;
  const from = range === "all" || !RANGES[range] ? null : daysAgo(Number(range));
  const mine = p.everyone !== "1";
  const [{ stages }, cards, summary, due, companies, staff] = await Promise.all([pipeline(user), boardCards(filters), crmSummary({ from, category: p.scat || null }), followUps(mine ? user.id : null), listCompanies(), staffUsers()]);
  const filtered = Object.values(filters).some((v) => v && v !== "manual");
  const keep = (omit: string[]) => Object.entries(p).filter(([k, v]) => v && !omit.includes(k));

  const stat = (label: string, n: number) => (
    <div className="surface px-4 py-3 min-w-[8rem] flex-1">
      <div className="font-mono text-2xl font-semibold" style={fg}>{n}</div>
      <div className="text-xs" style={muted}>{label}</div>
    </div>
  );
  const followRow = (t: FollowUpItem, tone: string) => (
    <li key={t.taskId} className="flex items-center gap-3 py-2" style={{ borderColor: "var(--border)" }}>
      <form action={completeTaskAction.bind(null, t.taskId)}>
        <button type="submit" aria-label={`Complete: ${t.title} (${t.contactName})`} title="Mark done" className="mt-0.5" style={{ color: "var(--green)" }}><CheckCircle2 size={18} /></button>
      </form>
      <div className="flex-1 min-w-0 text-sm">
        <span className="font-medium" style={fg}>{t.title}</span>{" "}
        <Link href={`/advisor/crm/contacts/${t.contactId}`} className="link">{t.contactName}</Link>
        {t.company && <span style={muted}> · {t.company}</span>}
      </div>
      {t.due && <span className="text-xs font-semibold shrink-0" style={{ color: tone }}>{short(t.due)}</span>}
    </li>
  );

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5 max-w-full">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl" style={fg}>CRM</h1>
          <p className="text-sm" style={muted}>Growth Goaled&apos;s prospects and relationships. Internal only.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <QuickAdd add={addContactAction} companies={companies.map((c) => ({ id: c.id, name: c.name }))} stages={stages.map((s) => ({ id: s.id, name: s.name }))} />
          <Link href="/advisor/crm/import" className="btn btn-secondary inline-flex items-center gap-1.5"><Upload size={15} aria-hidden /> Import CSV</Link>
          <Link href="/advisor/crm/companies" className="btn btn-secondary inline-flex items-center gap-1.5"><Building2 size={15} aria-hidden /> Companies</Link>
          <Link href="/advisor/crm/stages" className="btn btn-secondary inline-flex items-center gap-1.5"><Columns3 size={15} aria-hidden /> Columns</Link>
        </div>
      </header>

      <section aria-label="Summary" className="space-y-2">
        <AutoSubmit label="Summary filters">
          {keep(["range", "scat"]).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <select name="range" defaultValue={range} aria-label="Date range" className="field text-sm py-1">{Object.entries(RANGES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="scat" defaultValue={p.scat ?? ""} aria-label="Summary contact type" className="field text-sm py-1"><option value="">All types</option>{CATEGORY_NAMES.map((c) => <option key={c}>{c}</option>)}</select>
        </AutoSubmit>
        <div className="flex gap-3 flex-wrap">
          {stat("Total prospects", summary.total)}
          {stat("Contacted", summary.contacted)}
          {stat("Active conversations", summary.conversations)}
          {stat("Opportunities", summary.opportunities)}
          {stat("Customers / partners", summary.customers)}
        </div>
      </section>

      <details open={due.overdue.length + due.today.length > 0} className="surface p-4" aria-label="My Follow-ups">
        <summary className="cursor-pointer flex items-center gap-2 font-semibold flex-wrap" style={fg}>
          <CalendarClock size={18} aria-hidden /> {mine ? "My Follow-ups" : "Everyone's follow-ups"}
          <span className="text-sm font-normal" style={muted}>
            {due.overdue.length} overdue · {due.today.length} today · {due.upcoming.length} this week · {due.noNextAction.length} without a next action
          </span>
          <Link href={`/advisor/crm?${new URLSearchParams({ ...Object.fromEntries(keep(["everyone"])), ...(mine ? { everyone: "1" } : {}) })}`} className="link text-sm font-normal ml-auto">{mine ? "Show everyone's" : "Show mine"}</Link>
        </summary>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mt-3">
          <div aria-label="Overdue">
            <h3 className="text-sm font-semibold flex items-center gap-1" style={{ color: "var(--red)" }}><AlertTriangle size={14} aria-hidden /> Overdue</h3>
            <ul className="divide-y">{due.overdue.map((t) => followRow(t, "var(--red)"))}</ul>
            {!due.overdue.length && <p className="text-sm" style={muted}>Nothing overdue.</p>}
          </div>
          <div aria-label="Today">
            <h3 className="text-sm font-semibold" style={{ color: "var(--amber)" }}>Today</h3>
            <ul className="divide-y">{due.today.map((t) => followRow(t, "var(--amber)"))}</ul>
            {!due.today.length && <p className="text-sm" style={muted}>Nothing due today.</p>}
          </div>
          <div aria-label="Upcoming">
            <h3 className="text-sm font-semibold" style={{ color: "var(--green)" }}>Next 7 days</h3>
            <ul className="divide-y">{due.upcoming.map((t) => followRow(t, "var(--green)"))}</ul>
            {!due.upcoming.length && <p className="text-sm" style={muted}>Nothing coming up.</p>}
          </div>
          <div aria-label="No next action">
            <h3 className="text-sm font-semibold" style={muted}>No next action</h3>
            <ul className="text-sm space-y-1 mt-1">
              {due.noNextAction.slice(0, 8).map((c) => (
                <li key={c.id}><Link href={`/advisor/crm/contacts/${c.id}`} className="link">{c.name}</Link>{c.company && <span style={muted}> · {c.company}</span>}</li>
              ))}
            </ul>
            {due.noNextAction.length > 8 && <Link href="/advisor/crm?followUp=none" className="link text-sm">All {due.noNextAction.length} →</Link>}
            {!due.noNextAction.length && <p className="text-sm" style={muted}>Everyone has a next action.</p>}
          </div>
        </div>
      </details>

      <AutoSubmit label="Board filters">
        {keep(["q", "category", "company", "stage", "priority", "owner", "followUp", "sort"]).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="search" name="q" defaultValue={p.q ?? ""} placeholder="Search name, email, company…" aria-label="Search contacts" className="field text-sm py-1.5 w-56" />
        <select name="category" defaultValue={p.category ?? ""} aria-label="Contact type" className="field text-sm py-1.5"><option value="">All types</option>{CATEGORY_NAMES.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="company" defaultValue={p.company ?? ""} aria-label="Company" className="field text-sm py-1.5 max-w-[11rem]"><option value="">All companies</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="stage" defaultValue={p.stage ?? ""} aria-label="Pipeline status" className="field text-sm py-1.5"><option value="">All statuses</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="priority" defaultValue={p.priority ?? ""} aria-label="Priority" className="field text-sm py-1.5"><option value="">Any priority</option>{PRIORITIES.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}</select>
        <select name="owner" defaultValue={p.owner ?? ""} aria-label="Owner" className="field text-sm py-1.5"><option value="">Any owner</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="none">No owner</option></select>
        <select name="followUp" defaultValue={p.followUp ?? ""} aria-label="Follow-up" className="field text-sm py-1.5"><option value="">Any follow-up</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="week">This week</option><option value="none">No next action</option></select>
        <select name="sort" defaultValue={p.sort ?? "manual"} aria-label="Sort" className="field text-sm py-1.5">{Object.entries(SORTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button type="submit" className="btn btn-secondary text-sm py-1.5">Search</button>
        {filtered && <Link href="/advisor/crm" className="link text-sm">Clear</Link>}
      </AutoSubmit>

      {cards.length === 0 && !filtered ? (
        <div className="surface p-8 text-center space-y-2">
          <p className="text-lg font-semibold" style={fg}>No prospects yet</p>
          <p className="text-sm" style={muted}>Add your first contact, or import a CSV of prospects.</p>
        </div>
      ) : null}
      <CrmBoard
        stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))}
        cards={cards.map((c) => ({ id: c.id, name: c.name, company: c.company, jobTitle: c.jobTitle, category: c.category, subcategory: c.subcategory, stageId: c.stageId, priority: c.priority, owner: c.owner, lastContacted: c.lastContactedAt ? c.lastContactedAt.toISOString().slice(0, 10) : null, next: c.next, followUp: c.followUp }))}
        move={moveContactAction}
        sortable={!p.sort || p.sort === "manual"}
      />
    </div>
  );
}
