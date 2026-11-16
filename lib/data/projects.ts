import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, GrowthProject, ProjectDocument, ProjectResult, User, WeeklyPriority } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { addDays, MAX_PRIORITIES, weekStart } from "@/lib/weeks";

/**
 * Advisor-owned work (Founder View redesign, Nov 16, 2026): growth projects, the plans and documents
 * shared on them, the results they track, and each week's priorities. Advisors create and manage
 * all of it; founders only view it. Results reach the founder only once an advisor approves them.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const clean = (v: string | null | undefined, max = 500) => v?.trim().slice(0, max) || null;
export const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Reading (founder and advisor)
// ---------------------------------------------------------------------------

export type ProjectView = GrowthProject & { actionPlan: ProjectDocument | null; documents: ProjectDocument[]; results: ProjectResult[] };

/**
 * A company's growth projects, open first then newest, each with its action plan (the newest one),
 * other documents, and results: only approved ones for founders, all of them for advisors.
 */
export async function companyProjects(company: Pick<Company, "id">, opts: { allResults?: boolean } = {}): Promise<ProjectView[]> {
  const projects = await db
    .select()
    .from(schema.growthProjects)
    .where(eq(schema.growthProjects.companyId, company.id))
    .orderBy(asc(schema.growthProjects.status), desc(schema.growthProjects.startedOn), desc(schema.growthProjects.createdAt));
  if (!projects.length) return [];
  const ids = projects.map((p) => p.id);
  const [docs, results] = await Promise.all([
    db.select().from(schema.projectDocuments).where(inArray(schema.projectDocuments.projectId, ids)).orderBy(desc(schema.projectDocuments.createdAt)),
    db
      .select()
      .from(schema.projectResults)
      .where(and(inArray(schema.projectResults.projectId, ids), ...(opts.allResults ? [] : [isNotNull(schema.projectResults.approvedAt)])))
      .orderBy(asc(schema.projectResults.position), asc(schema.projectResults.createdAt)),
  ]);
  return projects.map((p) => {
    const mine = docs.filter((d) => d.projectId === p.id);
    const actionPlan = mine.find((d) => d.kind === "action_plan") ?? null;
    return { ...p, actionPlan, documents: mine.filter((d) => d !== actionPlan), results: results.filter((r) => r.projectId === p.id) };
  });
}

export async function companyProject(company: Pick<Company, "id">, projectId: string, opts: { allResults?: boolean } = {}): Promise<ProjectView | null> {
  return (await companyProjects(company, opts)).find((p) => p.id === projectId) ?? null;
}

/**
 * This week's priorities; when the advisor hasn't set them yet, the most recent earlier week's
 * (labelled with its week, so it isn't mistaken for this week's).
 */
export async function currentPriorities(company: Pick<Company, "id">, on = today()): Promise<{ weekStart: string; current: boolean; items: WeeklyPriority[] } | null> {
  const thisWeek = weekStart(on);
  const [latest] = await db
    .select({ weekStart: schema.weeklyPriorities.weekStart })
    .from(schema.weeklyPriorities)
    .where(and(eq(schema.weeklyPriorities.companyId, company.id), lte(schema.weeklyPriorities.weekStart, thisWeek)))
    .orderBy(desc(schema.weeklyPriorities.weekStart))
    .limit(1);
  if (!latest) return null;
  const items = await prioritiesFor(company, latest.weekStart);
  return { weekStart: latest.weekStart, current: latest.weekStart === thisWeek, items };
}

export async function prioritiesFor(company: Pick<Company, "id">, week: string): Promise<WeeklyPriority[]> {
  return db
    .select()
    .from(schema.weeklyPriorities)
    .where(and(eq(schema.weeklyPriorities.companyId, company.id), eq(schema.weeklyPriorities.weekStart, week)))
    .orderBy(asc(schema.weeklyPriorities.position));
}

/** A project document a user may open: founders their company's, staff the companies they manage (checked by the caller). */
export async function projectDocument(id: string): Promise<ProjectDocument | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [d] = await db.select().from(schema.projectDocuments).where(eq(schema.projectDocuments.id, id)).limit(1);
  return d ?? null;
}

export { documentHref } from "@/lib/project-links";

// ---------------------------------------------------------------------------
// Advisor: projects
// ---------------------------------------------------------------------------

export async function createProject(advisor: Pick<User, "id">, company: Pick<Company, "id">, input: { name: string; startedOn: string }): Promise<Result<{ id: string }>> {
  const name = clean(input.name, 120);
  if (!name) return { ok: false, error: "Name the project." };
  if (!isDay(input.startedOn)) return { ok: false, error: "Pick the start date." };
  const [p] = await db.insert(schema.growthProjects).values({ companyId: company.id, name, startedOn: input.startedOn, createdBy: advisor.id }).returning({ id: schema.growthProjects.id });
  await track("growth_project_created", { userId: advisor.id, companyId: company.id, props: {} });
  return { ok: true, id: p!.id };
}

/** Name, dates and status. Completing needs a completion date (today by default); reopening clears it. */
export async function updateProject(company: Pick<Company, "id">, projectId: string, input: { name: string; startedOn: string; status: "open" | "completed"; completedOn: string | null }): Promise<Result> {
  const name = clean(input.name, 120);
  if (!name) return { ok: false, error: "Name the project." };
  if (!isDay(input.startedOn)) return { ok: false, error: "Pick the start date." };
  const completedOn = input.status === "completed" ? (isDay(input.completedOn) ? input.completedOn : today()) : null;
  if (completedOn && completedOn < input.startedOn) return { ok: false, error: "It can't be completed before it started." };
  const updated = await db
    .update(schema.growthProjects)
    .set({ name, startedOn: input.startedOn, status: input.status, completedOn, updatedAt: new Date() })
    .where(and(eq(schema.growthProjects.id, projectId), eq(schema.growthProjects.companyId, company.id)))
    .returning({ id: schema.growthProjects.id });
  return updated.length ? { ok: true } : { ok: false, error: "That project wasn't found." };
}

export async function deleteProject(company: Pick<Company, "id">, projectId: string): Promise<void> {
  await db.delete(schema.growthProjects).where(and(eq(schema.growthProjects.id, projectId), eq(schema.growthProjects.companyId, company.id)));
}

// ---------------------------------------------------------------------------
// Advisor: documents (the action plan, and anything else shared on a project)
// ---------------------------------------------------------------------------

export { projectBlobPrefix } from "@/lib/project-files";
import { projectBlobPrefix } from "@/lib/project-files";

/** A link (Google Doc, Notion…) or an uploaded file, on one of the company's projects. Visible to the founder straight away. */
export async function addProjectDocument(
  advisor: Pick<User, "id">,
  company: Pick<Company, "id">,
  projectId: string,
  input: { kind: "action_plan" | "document"; title: string } & ({ url: string } | { blobUrl: string; pathname: string; filename: string; mime: string | null }),
): Promise<Result> {
  const [p] = await db.select({ id: schema.growthProjects.id }).from(schema.growthProjects).where(and(eq(schema.growthProjects.id, projectId), eq(schema.growthProjects.companyId, company.id))).limit(1);
  if (!p) return { ok: false, error: "That project wasn't found." };
  const title = clean(input.title, 160) ?? ("filename" in input ? input.filename : null) ?? (input.kind === "action_plan" ? "Action plan" : "Document");
  if ("url" in input) {
    let url: URL;
    try {
      url = new URL(input.url.trim());
    } catch {
      return { ok: false, error: "That link doesn't look right. Paste the full address, starting https://" };
    }
    if (url.protocol !== "https:") return { ok: false, error: "Use an https:// link." };
    await db.insert(schema.projectDocuments).values({ projectId: p.id, companyId: company.id, kind: input.kind, title, url: url.toString(), createdBy: advisor.id });
  } else {
    if (!input.pathname.startsWith(projectBlobPrefix(company.id))) return { ok: false, error: "That file doesn't belong to this company." };
    await db.insert(schema.projectDocuments).values({ projectId: p.id, companyId: company.id, kind: input.kind, title, blobUrl: input.blobUrl, filename: input.filename.slice(0, 255), mime: input.mime, createdBy: advisor.id });
  }
  await track("project_document_shared", { userId: advisor.id, companyId: company.id, props: { kind: input.kind, via: "url" in input ? "link" : "file" } });
  return { ok: true };
}

export async function removeProjectDocument(company: Pick<Company, "id">, documentId: string): Promise<void> {
  await db.delete(schema.projectDocuments).where(and(eq(schema.projectDocuments.id, documentId), eq(schema.projectDocuments.companyId, company.id)));
}

// ---------------------------------------------------------------------------
// Advisor: results (hidden from the founder until approved)
// ---------------------------------------------------------------------------

/** Adds or edits a result. Editing an approved result takes it back to draft, so nothing changes in front of the founder unreviewed. */
export async function saveResult(advisor: Pick<User, "id">, company: Pick<Company, "id">, projectId: string, resultId: string | null, input: { label: string; value: string; note: string }): Promise<Result> {
  const label = clean(input.label, 160);
  if (!label) return { ok: false, error: "Name the result, e.g. Pipeline created by the new hire." };
  const values = { label, value: clean(input.value, 200), note: clean(input.note, 1000), updatedAt: new Date() };
  if (resultId) {
    const updated = await db
      .update(schema.projectResults)
      .set({ ...values, approvedAt: null, approvedBy: null })
      .where(and(eq(schema.projectResults.id, resultId), eq(schema.projectResults.companyId, company.id), eq(schema.projectResults.projectId, projectId)))
      .returning({ id: schema.projectResults.id });
    return updated.length ? { ok: true } : { ok: false, error: "That result wasn't found." };
  }
  const [p] = await db.select({ id: schema.growthProjects.id }).from(schema.growthProjects).where(and(eq(schema.growthProjects.id, projectId), eq(schema.growthProjects.companyId, company.id))).limit(1);
  if (!p) return { ok: false, error: "That project wasn't found." };
  const [last] = await db.select({ position: schema.projectResults.position }).from(schema.projectResults).where(eq(schema.projectResults.projectId, p.id)).orderBy(desc(schema.projectResults.position)).limit(1);
  await db.insert(schema.projectResults).values({ ...values, projectId: p.id, companyId: company.id, position: (last?.position ?? 0) + 1, createdBy: advisor.id });
  return { ok: true };
}

/** Approve (publish to the founder) or withdraw a result. */
export async function approveResult(advisor: Pick<User, "id">, company: Pick<Company, "id">, resultId: string, approved: boolean): Promise<Result> {
  const updated = await db
    .update(schema.projectResults)
    .set(approved ? { approvedAt: new Date(), approvedBy: advisor.id, updatedAt: new Date() } : { approvedAt: null, approvedBy: null, updatedAt: new Date() })
    .where(and(eq(schema.projectResults.id, resultId), eq(schema.projectResults.companyId, company.id)))
    .returning({ id: schema.projectResults.id });
  if (updated.length && approved) await track("project_result_approved", { userId: advisor.id, companyId: company.id, props: {} });
  return updated.length ? { ok: true } : { ok: false, error: "That result wasn't found." };
}

export async function deleteResult(company: Pick<Company, "id">, resultId: string): Promise<void> {
  await db.delete(schema.projectResults).where(and(eq(schema.projectResults.id, resultId), eq(schema.projectResults.companyId, company.id)));
}

// ---------------------------------------------------------------------------
// Advisor: weekly priorities
// ---------------------------------------------------------------------------

/**
 * Replaces a week's priorities (at most five). Each has what matters and the action for the next
 * seven days; its due date, when given, falls within the week (Monday to the following Monday).
 */
export async function savePriorities(advisor: Pick<User, "id">, company: Pick<Company, "id">, week: string, items: { title: string; action: string; dueOn: string | null }[]): Promise<Result> {
  if (!isDay(week) || weekStart(week) !== week) return { ok: false, error: "Pick the week." };
  const rows = items.map((i) => ({ title: clean(i.title, 160), action: clean(i.action, 500), dueOn: i.dueOn && isDay(i.dueOn) ? i.dueOn : null })).filter((i) => i.title || i.action);
  if (rows.length > MAX_PRIORITIES) return { ok: false, error: `At most ${MAX_PRIORITIES} priorities a week.` };
  for (const [n, r] of rows.entries()) {
    if (!r.title) return { ok: false, error: `Priority ${n + 1}: say what it is.` };
    if (!r.action) return { ok: false, error: `Priority ${n + 1}: add the action for the next seven days.` };
    if (r.dueOn && (r.dueOn < week || r.dueOn > addDays(week, 7))) return { ok: false, error: `Priority ${n + 1}: the due date should fall within the week.` };
  }
  await db.delete(schema.weeklyPriorities).where(and(eq(schema.weeklyPriorities.companyId, company.id), eq(schema.weeklyPriorities.weekStart, week)));
  if (rows.length)
    await db.insert(schema.weeklyPriorities).values(rows.map((r, n) => ({ companyId: company.id, weekStart: week, title: r.title!, action: r.action!, dueOn: r.dueOn, position: n + 1, createdBy: advisor.id })));
  await track("weekly_priorities_saved", { userId: advisor.id, companyId: company.id, props: { count: rows.length } });
  return { ok: true };
}
