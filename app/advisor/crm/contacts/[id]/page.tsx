import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, Linkedin, Mail, MapPin, Phone, Trash2 } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { ActivityForm, ContactForm, EmailComposer, StageSelect, TaskForm } from "@/components/crm/ContactPanels";
import { followUpBucket, fullName, PRIORITY_LABEL } from "@/lib/crm";
import { contactProfile, listCompanies, pipeline, staffUsers } from "@/lib/data/crm";
import { contactChats } from "@/lib/data/guest";
import { LeadChats, QuestionCounts } from "@/components/crm/LeadChats";
import { addTaskAction, completeTaskAction, deleteContactAction, deleteDraftAction, deleteTaskAction, logActivityAction, moveContactAction, saveDraftAction, updateContactAction } from "../../actions";

export const metadata = { title: "Contact" };

const TABS = { activity: "Activity", chat: "Chat", details: "Details", email: "Email" } as const;
const KIND: Record<string, string> = { note: "Note", status_change: "Status", email_draft: "Email draft", email_sent: "Email sent", email_received: "Email received", meeting: "Meeting", call: "Call", task: "Follow-up", other: "Update" };
const muted = { color: "var(--muted-foreground)" };
const fg = { color: "var(--foreground)" };
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const today = () => new Date().toISOString().slice(0, 10);
const dollars = (c: number | null) => (c === null ? "" : String(c / 100));

/** A contact's profile: who they are, where they are, what happened last and what to do next. */
export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireRole(["advisor", "admin"]);
  const [{ id }, { tab: t }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [profile, { stages }, companies, owners, chat] = await Promise.all([contactProfile(id), pipeline(), listCompanies(), staffUsers(), contactChats(id)]);
  if (!profile) notFound();
  const { contact: c, company, tags, tasks, activities, emails, suppressed } = profile;
  const tab = (t && t in TABS ? t : "activity") as keyof typeof TABS;
  const open = tasks.filter((x) => !x.doneAt);
  const on = today();

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl space-y-5">
      <Link href="/advisor/crm" className="link text-sm">← CRM</Link>
      <header className="surface p-5 flex gap-5 flex-wrap items-start">
        <div className="flex-1 min-w-[16rem] space-y-1">
          <h1 className="font-display text-3xl" style={fg}>{fullName(c)}</h1>
          <div className="text-base" style={muted}>
            {c.jobTitle}
            {c.jobTitle && company && " · "}
            {company && <Link href={`/advisor/crm/companies/${company.id}`} className="link">{company.name}</Link>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-1" style={muted}>
            {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 link"><Mail size={14} aria-hidden /> {c.email}</a>}
            {c.email && !c.emailVerified && <span className="text-xs" title="Not confirmed by anyone yet">unverified</span>}
            {c.phone && <span className="inline-flex items-center gap-1"><Phone size={14} aria-hidden /> {c.phone}</span>}
            {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 link"><Linkedin size={14} aria-hidden /> LinkedIn</a>}
            {c.location && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden /> {c.location}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {c.category && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--blue-muted)", color: "var(--blue)" }}>{c.subcategory ? `${c.category} · ${c.subcategory}` : c.category}</span>}
            {c.opportunity && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--green-muted)", color: "var(--green)" }}>{c.opportunity}</span>}
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{PRIORITY_LABEL[c.priority]} priority</span>
            {c.source && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>Source: {c.source}</span>}
            {tags.map((x) => <span key={x} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--foreground)" }}>#{x}</span>)}
          </div>
        </div>
        <div className="space-y-2 text-sm min-w-[14rem]">
          <StageSelect contactId={c.id} stageId={c.stageId} stages={stages.map((s) => ({ id: s.id, name: s.name }))} move={moveContactAction} />
          <div style={muted}>Last contact: <span style={fg}>{c.lastContactedAt ? day(c.lastContactedAt) : "never"}</span></div>
          <div style={muted}>
            Next: {open[0] ? <span style={{ color: followUpBucket(open[0].dueDate, on) === "overdue" ? "var(--red)" : "var(--foreground)" }}>{open[0].title}{open[0].dueDate ? ` · ${short(open[0].dueDate)}` : ""}</span> : <span style={{ color: "var(--amber)" }}>no next action</span>}
          </div>
        </div>
      </header>

      <nav aria-label="Contact sections" className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {Object.entries(TABS).map(([k, label]) => (
          <Link key={k} href={`?tab=${k}`} aria-current={tab === k ? "page" : undefined} className="px-4 py-2 text-sm font-medium -mb-px" style={{ borderBottom: `2px solid ${tab === k ? "var(--green)" : "transparent"}`, color: tab === k ? "var(--foreground)" : "var(--muted-foreground)" }}>
            {label}{k === "email" && emails.length ? ` (${emails.length})` : ""}{k === "chat" && chat.lifetime ? ` (${chat.lifetime})` : ""}
          </Link>
        ))}
      </nav>

      {tab === "activity" && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5 items-start">
          <div className="space-y-5">
            <section aria-label="Follow-ups" className="surface p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2" style={fg}><CalendarClock size={16} aria-hidden /> Next actions</h2>
              {open.length ? (
                <ul className="divide-y text-sm">
                  {open.map((x) => {
                    const b = followUpBucket(x.dueDate, on);
                    return (
                      <li key={x.id} className="py-2 flex gap-3 items-start" style={{ borderColor: "var(--border)" }}>
                        <form action={completeTaskAction.bind(null, x.id)}><button type="submit" aria-label={`Complete: ${x.title}`} style={{ color: "var(--green)" }}><CheckCircle2 size={18} /></button></form>
                        <div className="flex-1">
                          <div style={fg}>{x.title}</div>
                          {x.notes && <div className="text-xs" style={muted}>{x.notes}</div>}
                        </div>
                        {x.dueDate && <span className="text-xs font-semibold" style={{ color: b === "overdue" ? "var(--red)" : b === "today" ? "var(--amber)" : "var(--muted-foreground)" }}>{b === "overdue" ? "Overdue · " : ""}{short(x.dueDate)}</span>}
                        <form action={deleteTaskAction.bind(null, x.id, c.id)}><button type="submit" aria-label={`Delete follow-up: ${x.title}`} style={muted}><Trash2 size={14} /></button></form>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm" style={{ color: "var(--amber)" }}>No next action yet. Set one so this relationship keeps moving.</p>
              )}
              <TaskForm add={addTaskAction.bind(null, c.id)} />
            </section>
            <section aria-label="Log an interaction" className="surface p-4 space-y-3">
              <h2 className="font-semibold" style={fg}>Log a note or interaction</h2>
              <ActivityForm log={logActivityAction.bind(null, c.id)} />
            </section>
          </div>
          <section aria-label="Timeline" className="surface p-4">
            <h2 className="font-semibold mb-3" style={fg}>Relationship history</h2>
            <ol className="space-y-3">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: a.kind === "status_change" ? "var(--blue)" : a.kind === "note" ? "var(--muted-foreground)" : "var(--green)" }} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs" style={muted}>{KIND[a.kind] ?? a.kind} · {day(a.occurredAt)}{a.actorName ? ` · ${a.actorName}` : ""}</div>
                    <div className="whitespace-pre-wrap" style={fg}>{a.body}</div>
                  </div>
                </li>
              ))}
              {!activities.length && <li className="text-sm" style={muted}>Nothing yet.</li>}
            </ol>
          </section>
        </div>
      )}

      {tab === "details" && (
        <section className="surface p-5 space-y-5">
          <ContactForm
            save={updateContactAction.bind(null, c.id)}
            companies={companies.map((x) => ({ id: x.id, name: x.name }))}
            owners={owners}
            values={{
              firstName: c.firstName,
              lastName: c.lastName ?? "",
              email: c.email ?? "",
              phone: c.phone ?? "",
              jobTitle: c.jobTitle ?? "",
              companyId: c.companyId ?? "",
              linkedinUrl: c.linkedinUrl ?? "",
              location: c.location ?? "",
              category: c.category ?? "",
              subcategory: c.subcategory ?? "",
              source: c.source ?? "",
              ownerId: c.ownerId ?? "",
              priority: c.priority,
              opportunity: c.opportunity ?? "",
              potentialMonthly: dollars(c.potentialMonthlyCents),
              dealValue: dollars(c.dealValueCents),
              opportunityNotes: c.opportunityNotes ?? "",
              notes: c.notes ?? "",
              tags: tags.join(", "),
              doNotEmail: c.doNotEmail,
            }}
          />
          <form action={deleteContactAction.bind(null, c.id)} className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
            <button type="submit" className="text-sm" style={{ color: "var(--red)" }}>Delete this contact and their history</button>
          </form>
        </section>
      )}

      {tab === "chat" && (
        <section aria-label="Website chat" className="surface p-5 space-y-4">
          <h2 className="font-semibold" style={fg}>Website chat</h2>
          <QuestionCounts {...chat} />
          <LeadChats chats={chat.chats} />
        </section>
      )}

      {tab === "email" && (
        <section className="surface p-5">
          <EmailComposer
            to={c.email}
            blocked={suppressed}
            save={saveDraftAction.bind(null, c.id)}
            remove={deleteDraftAction.bind(null, c.id)}
            drafts={emails.map((e) => ({ id: e.id, subject: e.subject, body: e.body, status: e.status, toEmail: e.toEmail, updated: day(e.updatedAt) }))}
          />
        </section>
      )}
    </div>
  );
}
