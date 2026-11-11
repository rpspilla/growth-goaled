import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CrmCompany, CrmContact, CrmStage, User } from "@/lib/db/schema";
import { DEFAULT_STAGES, domainOf, followUpBucket, fullName, INTERACTIONS, matchCategory, matchSource, normalizeEmail, type FollowUpBucket, type ImportRow, type Priority } from "@/lib/crm";

type Actor = Pick<User, "id">;
export type CrmResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const today = () => new Date().toISOString().slice(0, 10);
const clean = (v: string | null | undefined, max = 500) => v?.trim().slice(0, max) || null;

// ---------------------------------------------------------------------------
// Pipeline and stages
// ---------------------------------------------------------------------------

/** The one shared pipeline and its columns, created with the default columns on first use. */
export async function pipeline(actor?: Actor): Promise<{ id: string; stages: CrmStage[] }> {
  let [p] = await db.select().from(schema.crmPipelines).orderBy(asc(schema.crmPipelines.createdAt)).limit(1);
  if (!p) {
    [p] = await db.insert(schema.crmPipelines).values({ name: "Growth Goaled", createdBy: actor?.id ?? null }).returning();
    await db.insert(schema.crmStages).values(DEFAULT_STAGES.map((s, i) => ({ pipelineId: p!.id, name: s.name, kind: s.kind, position: i })));
  }
  const stages = await db.select().from(schema.crmStages).where(eq(schema.crmStages.pipelineId, p!.id)).orderBy(asc(schema.crmStages.position));
  return { id: p!.id, stages };
}

export async function addStage(name: string): Promise<CrmResult> {
  const n = clean(name, 60);
  if (!n) return { ok: false, error: "Name the column." };
  const { id, stages } = await pipeline();
  // New columns go before the archive column, so "Not now" stays last.
  const archive = stages.find((s) => s.kind === "archived");
  const at = archive ? archive.position : stages.length;
  if (archive) await db.update(schema.crmStages).set({ position: sql`${schema.crmStages.position} + 1` }).where(and(eq(schema.crmStages.pipelineId, id), gte(schema.crmStages.position, at)));
  await db.insert(schema.crmStages).values({ pipelineId: id, name: n, position: at, kind: "custom" });
  return { ok: true };
}

export async function renameStage(stageId: string, name: string): Promise<CrmResult> {
  const n = clean(name, 60);
  if (!n) return { ok: false, error: "Name the column." };
  await db.update(schema.crmStages).set({ name: n, updatedAt: new Date() }).where(eq(schema.crmStages.id, stageId));
  return { ok: true };
}

export async function moveStage(stageId: string, dir: -1 | 1): Promise<void> {
  const { stages } = await pipeline();
  const i = stages.findIndex((s) => s.id === stageId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= stages.length) return;
  await db.update(schema.crmStages).set({ position: stages[j]!.position }).where(eq(schema.crmStages.id, stages[i]!.id));
  await db.update(schema.crmStages).set({ position: stages[i]!.position }).where(eq(schema.crmStages.id, stages[j]!.id));
}

/** Deletes a column; its contacts move to `moveTo` (they're never lost). The last column can't go. */
export async function deleteStage(actor: Actor, stageId: string, moveTo: string): Promise<CrmResult> {
  const { stages } = await pipeline();
  if (stages.length <= 1) return { ok: false, error: "Keep at least one column." };
  const from = stages.find((s) => s.id === stageId);
  const to = stages.find((s) => s.id === moveTo && s.id !== stageId);
  if (!from || !to) return { ok: false, error: "Pick where its contacts go." };
  const moved = await db.update(schema.crmContacts).set({ stageId: to.id, updatedAt: new Date() }).where(eq(schema.crmContacts.stageId, from.id)).returning({ id: schema.crmContacts.id });
  if (moved.length) await db.insert(schema.crmActivities).values(moved.map((m) => ({ contactId: m.id, kind: "status_change" as const, body: `Moved from ${from.name} to ${to.name} (column removed)`, actorId: actor.id })));
  await db.delete(schema.crmStages).where(eq(schema.crmStages.id, from.id));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export type BoardFilters = { q?: string; category?: string; company?: string; stage?: string; priority?: string; owner?: string; followUp?: string; sort?: string };

export type BoardCard = {
  id: string;
  name: string;
  email: string | null;
  company: { id: string; name: string; website: string | null } | null;
  jobTitle: string | null;
  category: string | null;
  subcategory: string | null;
  stageId: string | null;
  position: number;
  priority: Priority;
  owner: { id: string; name: string } | null;
  lastContactedAt: Date | null;
  next: { title: string; due: string | null } | null;
  followUp: FollowUpBucket;
  createdAt: Date;
};

/** Every contact as a card with its next follow-up, filtered and sorted for the board. */
export async function boardCards(filters: BoardFilters = {}): Promise<BoardCard[]> {
  const [rows, open, staff] = await Promise.all([
    db.select({ c: schema.crmContacts, company: { id: schema.crmCompanies.id, name: schema.crmCompanies.name, website: schema.crmCompanies.website } }).from(schema.crmContacts).leftJoin(schema.crmCompanies, eq(schema.crmCompanies.id, schema.crmContacts.companyId)).limit(5000),
    db.select({ contactId: schema.crmTasks.contactId, title: schema.crmTasks.title, due: schema.crmTasks.dueDate }).from(schema.crmTasks).where(isNull(schema.crmTasks.doneAt)).orderBy(sql`${schema.crmTasks.dueDate} asc nulls last`, asc(schema.crmTasks.createdAt)),
    staffUsers(),
  ]);
  const nextFor = new Map<string, { title: string; due: string | null }>();
  for (const t of open) if (!nextFor.has(t.contactId)) nextFor.set(t.contactId, { title: t.title, due: t.due });
  const names = new Map(staff.map((u) => [u.id, u.name]));
  const on = today();
  let cards: BoardCard[] = rows.map(({ c, company }) => {
    const next = nextFor.get(c.id) ?? null;
    return {
      id: c.id,
      name: fullName(c),
      email: c.email,
      company: company?.id ? { id: company.id, name: company.name, website: company.website } : null,
      jobTitle: c.jobTitle,
      category: c.category,
      subcategory: c.subcategory,
      stageId: c.stageId,
      position: c.position,
      priority: c.priority,
      owner: c.ownerId ? { id: c.ownerId, name: names.get(c.ownerId) ?? "Former teammate" } : null,
      lastContactedAt: c.lastContactedAt,
      next,
      followUp: next ? followUpBucket(next.due, on) : "none",
      createdAt: c.createdAt,
    };
  });
  const f = filters;
  const q = f.q?.trim().toLowerCase();
  if (q) cards = cards.filter((c) => [c.name, c.email, c.company?.name, c.jobTitle].some((v) => v?.toLowerCase().includes(q)));
  if (f.category) cards = cards.filter((c) => c.category === f.category);
  if (f.company) cards = cards.filter((c) => c.company?.id === f.company);
  if (f.stage) cards = cards.filter((c) => c.stageId === f.stage);
  if (f.priority) cards = cards.filter((c) => c.priority === f.priority);
  if (f.owner) cards = cards.filter((c) => (f.owner === "none" ? !c.owner : c.owner?.id === f.owner));
  if (f.followUp) cards = cards.filter((c) => (f.followUp === "week" ? ["overdue", "today", "upcoming"].includes(c.followUp) : c.followUp === f.followUp));
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const by: Record<string, (a: BoardCard, b: BoardCard) => number> = {
    next: (a, b) => (a.next?.due ?? "9999").localeCompare(b.next?.due ?? "9999"),
    last: (a, b) => (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0),
    priority: (a, b) => rank[a.priority] - rank[b.priority],
    name: (a, b) => a.name.localeCompare(b.name),
    newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    manual: (a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime(),
  };
  return cards.sort(by[f.sort ?? "manual"] ?? by.manual!);
}

/** Moves a card to a column, before `beforeId` (or to the end), and logs the move on the timeline. */
export async function moveContact(actor: Actor, contactId: string, stageId: string, beforeId: string | null): Promise<CrmResult> {
  const { stages } = await pipeline();
  const to = stages.find((s) => s.id === stageId);
  const [c] = await db.select().from(schema.crmContacts).where(eq(schema.crmContacts.id, contactId)).limit(1);
  if (!c || !to) return { ok: false, error: "That contact or column wasn't found." };
  const column = await db.select({ id: schema.crmContacts.id, position: schema.crmContacts.position }).from(schema.crmContacts).where(and(eq(schema.crmContacts.stageId, to.id), ne(schema.crmContacts.id, c.id))).orderBy(asc(schema.crmContacts.position));
  const i = beforeId ? column.findIndex((x) => x.id === beforeId) : -1;
  const position = i < 0 ? (column.at(-1)?.position ?? 0) + 1 : i === 0 ? column[0]!.position - 1 : (column[i - 1]!.position + column[i]!.position) / 2;
  await db.update(schema.crmContacts).set({ stageId: to.id, position, updatedAt: new Date() }).where(eq(schema.crmContacts.id, c.id));
  if (c.stageId !== to.id) {
    const from = stages.find((s) => s.id === c.stageId);
    await db.insert(schema.crmActivities).values({ contactId: c.id, kind: "status_change", body: from ? `Moved from ${from.name} to ${to.name}` : `Moved to ${to.name}`, meta: { from: from?.id ?? null, to: to.id }, actorId: actor.id });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

/** The company with this website's domain or (case-insensitive) name, else a new one. */
async function findOrCreateCompany(actor: Actor, name: string | null, website: string | null): Promise<string | null> {
  const n = clean(name, 200);
  const domain = domainOf(website);
  if (!n && !domain) return null;
  const [found] = await db
    .select({ id: schema.crmCompanies.id })
    .from(schema.crmCompanies)
    .where(or(domain ? eq(schema.crmCompanies.domain, domain) : sql`false`, n ? sql`lower(${schema.crmCompanies.name}) = ${n.toLowerCase()}` : sql`false`))
    .limit(1);
  if (found) return found.id;
  const [created] = await db.insert(schema.crmCompanies).values({ name: n ?? domain!, website: clean(website), domain, createdBy: actor.id }).returning({ id: schema.crmCompanies.id });
  return created!.id;
}

export type CompanyInput = { name: string; website?: string | null; industry?: string | null; stage?: string | null; estimatedArrCents?: number | null; employeeCount?: number | null; description?: string | null; keyNotes?: string | null };

export async function saveCompany(actor: Actor, companyId: string | null, input: CompanyInput): Promise<CrmResult<{ id: string }>> {
  const name = clean(input.name, 200);
  if (!name) return { ok: false, error: "Name the company." };
  const domain = domainOf(input.website);
  if (domain) {
    const [clash] = await db.select({ id: schema.crmCompanies.id, name: schema.crmCompanies.name }).from(schema.crmCompanies).where(eq(schema.crmCompanies.domain, domain)).limit(1);
    if (clash && clash.id !== companyId) return { ok: false, error: `${clash.name} already has that website.` };
  }
  const values = { name, website: clean(input.website), domain, industry: clean(input.industry, 120), stage: clean(input.stage, 40), estimatedArrCents: input.estimatedArrCents ?? null, employeeCount: input.employeeCount ?? null, description: clean(input.description, 4000), keyNotes: clean(input.keyNotes, 4000) };
  if (companyId) {
    await db.update(schema.crmCompanies).set({ ...values, updatedAt: new Date() }).where(eq(schema.crmCompanies.id, companyId));
    return { ok: true, id: companyId };
  }
  const [row] = await db.insert(schema.crmCompanies).values({ ...values, createdBy: actor.id }).returning({ id: schema.crmCompanies.id });
  return { ok: true, id: row!.id };
}

export async function listCompanies(): Promise<(CrmCompany & { contacts: number })[]> {
  const rows = await db
    .select({ co: schema.crmCompanies, contacts: sql<number>`count(${schema.crmContacts.id})::int` })
    .from(schema.crmCompanies)
    .leftJoin(schema.crmContacts, eq(schema.crmContacts.companyId, schema.crmCompanies.id))
    .groupBy(schema.crmCompanies.id)
    .orderBy(asc(schema.crmCompanies.name));
  return rows.map((r) => ({ ...r.co, contacts: r.contacts }));
}

export async function getCompany(id: string) {
  const [co] = await db.select().from(schema.crmCompanies).where(eq(schema.crmCompanies.id, id)).limit(1);
  if (!co) return null;
  const contacts = await db.select().from(schema.crmContacts).where(eq(schema.crmContacts.companyId, id)).orderBy(asc(schema.crmContacts.firstName));
  return { company: co, contacts };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export type ContactInput = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  companyId?: string | null;
  /** A new company to create (or match by name/website) when `companyId` isn't given. */
  companyName?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  location?: string | null;
  category?: string | null;
  subcategory?: string | null;
  source?: string | null;
  ownerId?: string | null;
  stageId?: string | null;
  priority?: Priority;
  opportunity?: string | null;
  potentialMonthlyCents?: number | null;
  dealValueCents?: number | null;
  opportunityNotes?: string | null;
  notes?: string | null;
  doNotEmail?: boolean;
  tags?: string[];
};

async function duplicateOf(email: string | null, except: string | null) {
  if (!email) return null;
  const [d] = await db.select({ id: schema.crmContacts.id, firstName: schema.crmContacts.firstName, lastName: schema.crmContacts.lastName }).from(schema.crmContacts).where(eq(schema.crmContacts.email, email)).limit(1);
  return d && d.id !== except ? d : null;
}

async function setTags(contactId: string, names: string[]) {
  const wanted = [...new Set(names.map((n) => n.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
  await db.delete(schema.crmContactTags).where(eq(schema.crmContactTags.contactId, contactId));
  if (!wanted.length) return;
  await db.insert(schema.crmTags).values(wanted.map((name) => ({ name }))).onConflictDoNothing();
  const tags = await db.select().from(schema.crmTags).where(inArray(schema.crmTags.name, wanted));
  await db.insert(schema.crmContactTags).values(tags.map((t) => ({ contactId, tagId: t.id }))).onConflictDoNothing();
}

/** Adds a prospect. Refused (with the existing contact) when the email is already in the CRM. */
export async function createContact(actor: Actor, input: ContactInput): Promise<CrmResult<{ id: string }> | { ok: false; error: string; duplicateId: string }> {
  const firstName = clean(input.firstName, 100);
  if (!firstName) return { ok: false, error: "Add at least a first name." };
  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  if (input.email?.trim() && !email) return { ok: false, error: "That email address doesn't look right." };
  const dup = await duplicateOf(email, null);
  if (dup) return { ok: false, error: `${fullName(dup)} already has that email.`, duplicateId: dup.id };
  const { stages } = await pipeline(actor);
  const stageId = stages.find((s) => s.id === input.stageId)?.id ?? stages[0]!.id;
  const companyId = input.companyId || (await findOrCreateCompany(actor, input.companyName ?? null, input.website ?? null));
  const [last] = await db.select({ position: schema.crmContacts.position }).from(schema.crmContacts).where(eq(schema.crmContacts.stageId, stageId)).orderBy(desc(schema.crmContacts.position)).limit(1);
  const [row] = await db
    .insert(schema.crmContacts)
    .values({
      firstName,
      lastName: clean(input.lastName, 100),
      email,
      phone: clean(input.phone, 60),
      jobTitle: clean(input.jobTitle, 160),
      companyId,
      linkedinUrl: clean(input.linkedinUrl),
      location: clean(input.location, 160),
      category: clean(input.category, 40),
      subcategory: clean(input.subcategory, 60),
      source: clean(input.source, 60),
      ownerId: input.ownerId ?? actor.id,
      stageId,
      position: (last?.position ?? 0) + 1,
      priority: input.priority ?? "medium",
      opportunity: clean(input.opportunity, 80),
      potentialMonthlyCents: input.potentialMonthlyCents ?? null,
      dealValueCents: input.dealValueCents ?? null,
      opportunityNotes: clean(input.opportunityNotes, 4000),
      notes: clean(input.notes, 4000),
      doNotEmail: Boolean(input.doNotEmail),
      createdBy: actor.id,
    })
    .returning({ id: schema.crmContacts.id });
  await db.insert(schema.crmActivities).values({ contactId: row!.id, kind: "other", body: `Added to the CRM${input.source ? ` (source: ${input.source})` : ""}`, actorId: actor.id });
  if (input.tags?.length) await setTags(row!.id, input.tags);
  return { ok: true, id: row!.id };
}

export async function updateContact(actor: Actor, contactId: string, input: ContactInput): Promise<CrmResult> {
  const firstName = clean(input.firstName, 100);
  if (!firstName) return { ok: false, error: "Add at least a first name." };
  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  if (input.email?.trim() && !email) return { ok: false, error: "That email address doesn't look right." };
  const dup = await duplicateOf(email, contactId);
  if (dup) return { ok: false, error: `${fullName(dup)} already has that email.` };
  const [before] = await db.select().from(schema.crmContacts).where(eq(schema.crmContacts.id, contactId)).limit(1);
  if (!before) return { ok: false, error: "Contact not found." };
  const companyId = input.companyId === undefined ? before.companyId : input.companyId || (await findOrCreateCompany(actor, input.companyName ?? null, input.website ?? null));
  await db
    .update(schema.crmContacts)
    .set({
      firstName,
      lastName: clean(input.lastName, 100),
      email,
      // A changed address is unconfirmed again.
      emailVerified: email === before.email ? before.emailVerified : false,
      phone: clean(input.phone, 60),
      jobTitle: clean(input.jobTitle, 160),
      companyId,
      linkedinUrl: clean(input.linkedinUrl),
      location: clean(input.location, 160),
      category: clean(input.category, 40),
      subcategory: clean(input.subcategory, 60),
      source: clean(input.source, 60),
      ownerId: input.ownerId === undefined ? before.ownerId : input.ownerId,
      priority: input.priority ?? before.priority,
      opportunity: clean(input.opportunity, 80),
      potentialMonthlyCents: input.potentialMonthlyCents ?? null,
      dealValueCents: input.dealValueCents ?? null,
      opportunityNotes: clean(input.opportunityNotes, 4000),
      notes: clean(input.notes, 4000),
      doNotEmail: Boolean(input.doNotEmail),
      updatedAt: new Date(),
    })
    .where(eq(schema.crmContacts.id, contactId));
  if (input.tags) await setTags(contactId, input.tags);
  if (input.doNotEmail && !before.doNotEmail && email) await db.insert(schema.crmSuppressions).values({ email, reason: "Marked do not email" }).onConflictDoNothing();
  return { ok: true };
}

export async function deleteContact(contactId: string): Promise<void> {
  await db.delete(schema.crmContacts).where(eq(schema.crmContacts.id, contactId));
}

/** Everything on a contact's profile: details, company, column, tags, follow-ups, timeline, emails. */
export async function contactProfile(contactId: string) {
  const [row] = await db.select({ c: schema.crmContacts, company: schema.crmCompanies }).from(schema.crmContacts).leftJoin(schema.crmCompanies, eq(schema.crmCompanies.id, schema.crmContacts.companyId)).where(eq(schema.crmContacts.id, contactId)).limit(1);
  if (!row) return null;
  const [tags, tasks, activities, emails, suppressed] = await Promise.all([
    db.select({ name: schema.crmTags.name }).from(schema.crmContactTags).innerJoin(schema.crmTags, eq(schema.crmTags.id, schema.crmContactTags.tagId)).where(eq(schema.crmContactTags.contactId, contactId)),
    db.select().from(schema.crmTasks).where(eq(schema.crmTasks.contactId, contactId)).orderBy(sql`${schema.crmTasks.doneAt} is not null`, sql`${schema.crmTasks.dueDate} asc nulls last`),
    db.select({ a: schema.crmActivities, actor: schema.users.name }).from(schema.crmActivities).leftJoin(schema.users, eq(schema.users.id, schema.crmActivities.actorId)).where(eq(schema.crmActivities.contactId, contactId)).orderBy(desc(schema.crmActivities.occurredAt)).limit(200),
    db.select().from(schema.crmEmails).where(eq(schema.crmEmails.contactId, contactId)).orderBy(desc(schema.crmEmails.updatedAt)),
    row.c.email ? db.select({ id: schema.crmSuppressions.id }).from(schema.crmSuppressions).where(eq(schema.crmSuppressions.email, row.c.email)).limit(1) : Promise.resolve([]),
  ]);
  return { contact: row.c, company: row.company, tags: tags.map((t) => t.name), tasks, activities: activities.map((x) => ({ ...x.a, actorName: x.actor })), emails, suppressed: suppressed.length > 0 || row.c.doNotEmail };
}

// ---------------------------------------------------------------------------
// Timeline and follow-ups
// ---------------------------------------------------------------------------

/** Logs a note or interaction; calls, meetings and emails also count as the last time in touch. */
export async function logActivity(actor: Actor, contactId: string, kind: "note" | "call" | "meeting" | "email_sent" | "other", body: string, occurredOn: string | null): Promise<CrmResult> {
  const text = clean(body, 4000);
  if (!text) return { ok: false, error: "Write what happened." };
  const at = occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) ? new Date(`${occurredOn}T12:00:00Z`) : new Date();
  const [c] = await db.select({ id: schema.crmContacts.id, last: schema.crmContacts.lastContactedAt }).from(schema.crmContacts).where(eq(schema.crmContacts.id, contactId)).limit(1);
  if (!c) return { ok: false, error: "Contact not found." };
  await db.insert(schema.crmActivities).values({ contactId, kind, body: text, actorId: actor.id, occurredAt: at });
  if (INTERACTIONS.find((i) => i.kind === kind)?.contact && (!c.last || c.last < at)) await db.update(schema.crmContacts).set({ lastContactedAt: at, updatedAt: new Date() }).where(eq(schema.crmContacts.id, contactId));
  return { ok: true };
}

export async function addTask(actor: Actor, contactId: string, input: { title: string; dueDate: string | null; priority?: Priority; notes?: string | null; remindAt?: Date | null }): Promise<CrmResult> {
  const title = clean(input.title, 200);
  if (!title) return { ok: false, error: "Say what the next action is." };
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return { ok: false, error: "Pick a valid date." };
  const [c] = await db.select({ owner: schema.crmContacts.ownerId }).from(schema.crmContacts).where(eq(schema.crmContacts.id, contactId)).limit(1);
  if (!c) return { ok: false, error: "Contact not found." };
  await db.insert(schema.crmTasks).values({ contactId, title, dueDate: input.dueDate, priority: input.priority ?? "medium", notes: clean(input.notes, 2000), remindAt: input.remindAt ?? null, ownerId: c.owner ?? actor.id, createdBy: actor.id });
  await db.insert(schema.crmActivities).values({ contactId, kind: "task", body: `Next action: ${title}${input.dueDate ? ` (due ${input.dueDate})` : ""}`, actorId: actor.id });
  return { ok: true };
}

export async function completeTask(actor: Actor, taskId: string): Promise<CrmResult> {
  const [t] = await db.update(schema.crmTasks).set({ doneAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.crmTasks.id, taskId), isNull(schema.crmTasks.doneAt))).returning();
  if (!t) return { ok: false, error: "That follow-up is already done." };
  await db.insert(schema.crmActivities).values({ contactId: t.contactId, kind: "task", body: `Done: ${t.title}`, actorId: actor.id });
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<void> {
  await db.delete(schema.crmTasks).where(eq(schema.crmTasks.id, taskId));
}

export type FollowUpItem = { taskId: string; title: string; due: string | null; priority: Priority; contactId: string; contactName: string; company: string | null };

/** My Follow-ups: overdue, today and the next 7 days (open tasks), and live contacts with no next action. */
export async function followUps(ownerId?: string | null): Promise<{ overdue: FollowUpItem[]; today: FollowUpItem[]; upcoming: FollowUpItem[]; noNextAction: { id: string; name: string; company: string | null }[] }> {
  const on = today();
  const rows = await db
    .select({ t: schema.crmTasks, first: schema.crmContacts.firstName, last: schema.crmContacts.lastName, company: schema.crmCompanies.name })
    .from(schema.crmTasks)
    .innerJoin(schema.crmContacts, eq(schema.crmContacts.id, schema.crmTasks.contactId))
    .leftJoin(schema.crmCompanies, eq(schema.crmCompanies.id, schema.crmContacts.companyId))
    .where(and(isNull(schema.crmTasks.doneAt), ownerId ? eq(schema.crmTasks.ownerId, ownerId) : undefined))
    .orderBy(sql`${schema.crmTasks.dueDate} asc nulls last`);
  const item = (r: (typeof rows)[number]): FollowUpItem => ({ taskId: r.t.id, title: r.t.title, due: r.t.dueDate, priority: r.t.priority, contactId: r.t.contactId, contactName: fullName({ firstName: r.first, lastName: r.last }), company: r.company });
  const out = { overdue: [] as FollowUpItem[], today: [] as FollowUpItem[], upcoming: [] as FollowUpItem[] };
  for (const r of rows) {
    const b = followUpBucket(r.t.dueDate, on);
    if (b === "overdue" || b === "today" || b === "upcoming") out[b].push(item(r));
  }
  const { stages } = await pipeline();
  const closed = stages.filter((s) => s.kind === "archived").map((s) => s.id);
  const withTask = new Set(rows.map((r) => r.t.contactId));
  const live = await db
    .select({ id: schema.crmContacts.id, first: schema.crmContacts.firstName, last: schema.crmContacts.lastName, company: schema.crmCompanies.name, stageId: schema.crmContacts.stageId })
    .from(schema.crmContacts)
    .leftJoin(schema.crmCompanies, eq(schema.crmCompanies.id, schema.crmContacts.companyId))
    .where(ownerId ? eq(schema.crmContacts.ownerId, ownerId) : undefined)
    .orderBy(desc(schema.crmContacts.createdAt));
  const noNextAction = live.filter((c) => !withTask.has(c.id) && !(c.stageId && closed.includes(c.stageId))).map((c) => ({ id: c.id, name: fullName({ firstName: c.first, lastName: c.last }), company: c.company }));
  return { ...out, noNextAction };
}

// ---------------------------------------------------------------------------
// Email drafts (sending arrives with Gmail; nothing here pretends to send)
// ---------------------------------------------------------------------------

export async function saveDraft(actor: Actor, contactId: string, draftId: string | null, input: { subject: string; body: string }): Promise<CrmResult<{ id: string }>> {
  const [c] = await db.select().from(schema.crmContacts).where(eq(schema.crmContacts.id, contactId)).limit(1);
  if (!c) return { ok: false, error: "Contact not found." };
  if (!c.email) return { ok: false, error: "Add the contact's email address first." };
  const subject = input.subject.slice(0, 300);
  const body = input.body.slice(0, 20_000);
  if (!subject.trim() && !body.trim()) return { ok: false, error: "Write a subject or a message." };
  if (draftId) {
    const [d] = await db
      .update(schema.crmEmails)
      .set({ subject, body, toEmail: c.email, updatedAt: new Date() })
      .where(and(eq(schema.crmEmails.id, draftId), eq(schema.crmEmails.contactId, contactId), eq(schema.crmEmails.status, "draft")))
      .returning({ id: schema.crmEmails.id });
    if (!d) return { ok: false, error: "Only drafts can be edited." };
    return { ok: true, id: d.id };
  }
  const [d] = await db.insert(schema.crmEmails).values({ contactId, companyId: c.companyId, toEmail: c.email, subject, body, status: "draft", createdBy: actor.id }).returning({ id: schema.crmEmails.id });
  await db.insert(schema.crmActivities).values({ contactId, kind: "email_draft", body: `Drafted: ${subject || "(no subject)"}`, meta: { emailId: d!.id }, actorId: actor.id });
  return { ok: true, id: d!.id };
}

export async function deleteDraft(contactId: string, draftId: string): Promise<void> {
  await db.delete(schema.crmEmails).where(and(eq(schema.crmEmails.id, draftId), eq(schema.crmEmails.contactId, contactId), eq(schema.crmEmails.status, "draft")));
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

/**
 * Imports prospects into the first column. Emails already in the CRM (or repeated in the file) are
 * skipped, never overwritten; companies are matched by website or name, else created. Imported
 * addresses stay unverified.
 */
export async function importContacts(actor: Actor, rows: ImportRow[], defaults: { source?: string | null; category?: string | null } = {}): Promise<{ added: number; duplicates: string[]; failed: number }> {
  const emails = rows.map((r) => r.email).filter((e): e is string => Boolean(e));
  const existing = new Set(emails.length ? (await db.select({ email: schema.crmContacts.email }).from(schema.crmContacts).where(inArray(schema.crmContacts.email, emails))).map((r) => r.email!) : []);
  const seen = new Set<string>();
  let added = 0;
  let failed = 0;
  const duplicates: string[] = [];
  for (const r of rows.slice(0, 2000)) {
    if (r.email && (existing.has(r.email) || seen.has(r.email))) {
      duplicates.push(r.email);
      continue;
    }
    if (r.email) seen.add(r.email);
    const cat = matchCategory(r.category ?? defaults.category ?? null);
    const result = await createContact(actor, {
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      jobTitle: r.jobTitle,
      companyName: r.company,
      website: r.website,
      linkedinUrl: r.linkedinUrl,
      location: r.location,
      category: cat?.category ?? null,
      subcategory: cat?.subcategory ?? null,
      source: matchSource(r.source) ?? defaults.source ?? "Other",
      notes: r.notes,
    });
    if (result.ok) added++;
    else failed++;
  }
  return { added, duplicates, failed };
}

// ---------------------------------------------------------------------------
// Summary and people
// ---------------------------------------------------------------------------

/** The five numbers at the top of the CRM, for contacts added since `from` (all time when null). */
export async function crmSummary(filters: { from?: string | null; category?: string | null } = {}) {
  const { stages } = await pipeline();
  const kindOf = new Map(stages.map((s) => [s.id, s.kind]));
  const rows = await db
    .select({ stageId: schema.crmContacts.stageId, last: schema.crmContacts.lastContactedAt })
    .from(schema.crmContacts)
    .where(and(filters.from ? gte(schema.crmContacts.createdAt, new Date(`${filters.from}T00:00:00Z`)) : undefined, filters.category ? eq(schema.crmContacts.category, filters.category) : undefined));
  const kinds = rows.map((r) => ({ kind: (r.stageId && kindOf.get(r.stageId)) || "custom", contacted: Boolean(r.last) }));
  const after = new Set(["contacted", "conversation", "opportunity", "won"]);
  return {
    total: kinds.length,
    contacted: kinds.filter((k) => k.contacted || after.has(k.kind)).length,
    conversations: kinds.filter((k) => k.kind === "conversation").length,
    opportunities: kinds.filter((k) => k.kind === "opportunity").length,
    customers: kinds.filter((k) => k.kind === "won").length,
  };
}

/** Growth Goaled staff (CRM owners). */
export async function staffUsers(): Promise<{ id: string; name: string }[]> {
  const rows = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users).where(inArray(schema.users.role, ["advisor", "admin"])).orderBy(asc(schema.users.name));
  return rows.map((r) => ({ id: r.id, name: r.name || r.email }));
}

export type { CrmContact };
