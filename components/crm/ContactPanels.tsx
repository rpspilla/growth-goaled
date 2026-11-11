"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/advisor/crm/actions";
import { CATEGORIES, CATEGORY_NAMES, INTERACTIONS, NEXT_ACTIONS, OPPORTUNITIES, PRIORITIES, PRIORITY_LABEL, SOURCES } from "@/lib/crm";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? busy : label}</button>;
}

const Field = ({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) => (
  <label className={`text-sm ${wide ? "sm:col-span-2" : ""}`} style={{ color: "var(--muted-foreground)" }}>
    {label}
    <div className="mt-1" style={{ color: "var(--foreground)" }}>{children}</div>
  </label>
);

export type ContactValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  companyId: string;
  linkedinUrl: string;
  location: string;
  category: string;
  subcategory: string;
  source: string;
  ownerId: string;
  priority: string;
  opportunity: string;
  potentialMonthly: string;
  dealValue: string;
  opportunityNotes: string;
  notes: string;
  tags: string;
  doNotEmail: boolean;
};

/** Every field on a contact, in two groups: who they are, and the opportunity for Growth Goaled. */
export function ContactForm({ values, save, companies, owners }: { values: ContactValues; save: Action; companies: { id: string; name: string }[]; owners: { id: string; name: string }[] }) {
  const [state, action] = useActionState(save, {});
  const [category, setCategory] = useState(values.category);
  const input = "field w-full";
  return (
    <form action={action} aria-label="Contact details" className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="First name"><input name="firstName" required defaultValue={values.firstName} maxLength={100} className={input} /></Field>
        <Field label="Last name"><input name="lastName" defaultValue={values.lastName} maxLength={100} className={input} /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={values.email} maxLength={200} className={input} /></Field>
        <Field label="Phone"><input name="phone" defaultValue={values.phone} maxLength={60} className={input} /></Field>
        <Field label="Job title"><input name="jobTitle" defaultValue={values.jobTitle} maxLength={160} className={input} /></Field>
        <Field label="Company">
          <select name="companyId" defaultValue={values.companyId} className={input}>
            <option value="">— None (or type a new one below)</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="New company (if not in the list)"><input name="companyName" maxLength={200} className={input} placeholder="Leave empty to keep the one above" /></Field>
        <Field label="Company website"><input name="website" maxLength={300} className={input} placeholder="Used when creating a new company" /></Field>
        <Field label="LinkedIn URL"><input name="linkedinUrl" type="url" defaultValue={values.linkedinUrl} maxLength={300} className={input} /></Field>
        <Field label="Location"><input name="location" defaultValue={values.location} maxLength={160} className={input} /></Field>
        <Field label="Contact type">
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
            <option value="">—</option>
            {CATEGORY_NAMES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Subtype">
          <select name="subcategory" defaultValue={values.subcategory} className={input} disabled={!category}>
            <option value="">—</option>
            {category && CATEGORIES[category as keyof typeof CATEGORIES]?.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Source">
          <select name="source" defaultValue={values.source} className={input}>
            <option value="">—</option>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Owner">
          <select name="ownerId" defaultValue={values.ownerId} className={input}>
            <option value="">No owner</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" defaultValue={values.priority} className={input}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
        </Field>
        <Field label="Tags (comma-separated)"><input name="tags" defaultValue={values.tags} maxLength={400} className={input} /></Field>
        <Field label="Notes" wide><textarea name="notes" defaultValue={values.notes} rows={3} maxLength={4000} className={input} /></Field>
      </div>
      <fieldset className="grid sm:grid-cols-2 gap-3 rounded-xl p-4" style={{ background: "var(--muted)" }}>
        <legend className="text-sm font-semibold px-1" style={{ color: "var(--foreground)" }}>Growth Goaled opportunity</legend>
        <Field label="Opportunity">
          <select name="opportunity" defaultValue={values.opportunity} className={input}>
            <option value="">—</option>
            {OPPORTUNITIES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Potential monthly revenue ($)"><input name="potentialMonthly" inputMode="decimal" defaultValue={values.potentialMonthly} className={input} /></Field>
        <Field label="Estimated deal value ($)"><input name="dealValue" inputMode="decimal" defaultValue={values.dealValue} className={input} /></Field>
        <Field label="Opportunity notes" wide><textarea name="opportunityNotes" defaultValue={values.opportunityNotes} rows={2} maxLength={4000} className={input} /></Field>
      </fieldset>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground)" }}>
        <input type="checkbox" name="doNotEmail" defaultChecked={values.doNotEmail} /> Do not email (asked not to be contacted or unsubscribed)
      </label>
      <div className="flex items-center gap-3">
        <Submit label="Save" busy="Saving…" />
        {state.error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{state.error}</span>}
        {state.note && <span role="status" className="text-sm" style={{ color: "var(--green)" }}>{state.note}</span>}
      </div>
    </form>
  );
}

/** Log a note or an interaction (call, meeting, email sent elsewhere) on the timeline. */
export function ActivityForm({ log }: { log: Action }) {
  const [state, action] = useActionState(log, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} aria-label="Log an interaction" className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <select name="kind" aria-label="Kind" className="field text-sm" defaultValue="note">{INTERACTIONS.map((i) => <option key={i.kind} value={i.kind}>{i.label}</option>)}</select>
        <input type="date" name="on" aria-label="When" className="field text-sm" />
      </div>
      <textarea name="body" required rows={2} maxLength={4000} aria-label="What happened" placeholder="What happened, what they said, what's next…" className="field w-full" />
      <div className="flex items-center gap-3">
        <Submit label="Add to timeline" busy="Saving…" />
        {state.error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{state.error}</span>}
      </div>
    </form>
  );
}

/** Set the next action: what, when, how important, and an optional reminder. */
export function TaskForm({ add }: { add: Action }) {
  const [state, action] = useActionState(add, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} aria-label="Set a follow-up" className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
      <label className="text-sm" style={{ color: "var(--muted-foreground)" }}>Next action<input name="title" required list="crm-next-actions-profile" maxLength={200} className="field w-full mt-1" /></label>
      <label className="text-sm" style={{ color: "var(--muted-foreground)" }}>Due<input type="date" name="dueDate" className="field w-full mt-1" /></label>
      <label className="text-sm" style={{ color: "var(--muted-foreground)" }}>Priority<select name="priority" defaultValue="medium" className="field w-full mt-1">{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
      <label className="text-sm sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>Notes<input name="notes" maxLength={2000} className="field w-full mt-1" /></label>
      <label className="text-sm" style={{ color: "var(--muted-foreground)" }}>Remind me<input type="datetime-local" name="remindAt" className="field w-full mt-1" /></label>
      <datalist id="crm-next-actions-profile">{NEXT_ACTIONS.map((a) => <option key={a} value={a} />)}</datalist>
      <div className="sm:col-span-3 flex items-center gap-3">
        <Submit label="Set follow-up" busy="Saving…" />
        {state.error && <span role="alert" className="text-sm" style={{ color: "var(--red)" }}>{state.error}</span>}
      </div>
    </form>
  );
}

/** Move the contact to another column from their profile. */
export function StageSelect({ contactId, stageId, stages, move }: { contactId: string; stageId: string | null; stages: { id: string; name: string }[]; move: (contactId: string, stageId: string, beforeId: string | null) => Promise<{ ok: boolean; error?: string }> }) {
  const [pending, run] = useTransition();
  const router = useRouter();
  return (
    <select
      aria-label="Pipeline status"
      className="field text-sm"
      disabled={pending}
      defaultValue={stageId ?? ""}
      onChange={(e) => {
        const to = e.target.value;
        run(async () => {
          await move(contactId, to, null);
          router.refresh();
        });
      }}
    >
      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

export type DraftView = { id: string; subject: string; body: string; status: "draft" | "scheduled" | "sent" | "failed" | "replied"; updated: string; toEmail: string };
const STATUS = { draft: { label: "Draft", bg: "var(--muted)", fg: "var(--muted-foreground)" }, scheduled: { label: "Scheduled", bg: "var(--blue-muted)", fg: "var(--blue)" }, sent: { label: "Sent", bg: "var(--green-muted)", fg: "var(--green)" }, failed: { label: "Failed", bg: "var(--amber-muted)", fg: "var(--red)" }, replied: { label: "Replied", bg: "var(--green-muted)", fg: "var(--green)" } } as const;

/**
 * A light email composer: the contact's address filled in, subject and body, saved as drafts.
 * Sending arrives with a connected Gmail account; until then nothing is sent or pretends to be.
 */
export function EmailComposer({ to, drafts, save, remove, blocked }: { to: string | null; drafts: DraftView[]; save: (draftId: string | null, subject: string, body: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>; remove: (draftId: string) => Promise<void>; blocked: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  const router = useRouter();
  const open = (d: DraftView | null) => {
    setEditing(d?.id ?? null);
    setSubject(d?.subject ?? "");
    setBody(d?.body ?? "");
    setMsg(null);
  };
  return (
    <div className="space-y-4">
      {blocked && <p role="note" className="text-sm rounded-lg p-3" style={{ background: "var(--amber-muted)", color: "var(--foreground)" }}>This person asked not to be emailed. Drafts are kept, but they can&apos;t be sent.</p>}
      <form
        aria-label="Compose email"
        className="rounded-xl p-4 space-y-2"
        style={{ border: "1px solid var(--border)", background: "var(--card)" }}
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await save(editing, subject, body);
            if (r.ok) {
              setEditing(r.id);
              setMsg({ ok: true, text: "Draft saved." });
              router.refresh();
            } else setMsg({ ok: false, text: r.error });
          });
        }}
      >
        <div className="text-sm flex gap-2 items-center" style={{ color: "var(--muted-foreground)" }}>
          <span className="w-14">To</span>
          <span style={{ color: "var(--foreground)" }}>{to ?? "Add an email address on Details first"}</span>
        </div>
        <input aria-label="Subject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} className="field w-full" />
        <textarea aria-label="Message" placeholder="Write your email…" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={20000} className="field w-full" />
        <div className="flex items-center gap-3 flex-wrap">
          <button type="submit" className="btn btn-primary" disabled={pending || !to}>{pending ? "Saving…" : editing ? "Update draft" : "Save draft"}</button>
          <button type="button" className="btn btn-secondary" disabled title="Sending needs a connected Gmail account (coming in phase 2)">Send (connect Gmail first)</button>
          {editing && <button type="button" className="link text-sm" onClick={() => open(null)}>New email</button>}
          {msg && <span role={msg.ok ? "status" : "alert"} className="text-sm" style={{ color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</span>}
        </div>
      </form>
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>Emails</h3>
        {drafts.length ? (
          <ul aria-label="Emails" className="divide-y rounded-xl" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            {drafts.map((d) => (
              <li key={d.id} className="p-3 flex gap-3 items-start" style={{ borderColor: "var(--border)" }}>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: STATUS[d.status].bg, color: STATUS[d.status].fg }}>{STATUS[d.status].label}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>{d.subject || "(no subject)"}</div>
                  <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{d.body.slice(0, 140)}</div>
                </div>
                <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>{d.updated}</span>
                {d.status === "draft" && (
                  <>
                    <button type="button" className="link text-sm" onClick={() => open(d)} aria-label={`Edit draft: ${d.subject || "(no subject)"}`}>Edit</button>
                    <button type="button" className="text-sm" style={{ color: "var(--red)" }} onClick={() => run(async () => { await remove(d.id); if (editing === d.id) open(null); router.refresh(); })}>Delete</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No emails yet.</p>
        )}
      </div>
    </div>
  );
}
