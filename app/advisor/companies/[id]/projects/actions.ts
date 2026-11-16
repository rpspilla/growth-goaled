"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getManagedCompany } from "@/lib/data/companies";
import { addProjectDocument, approveResult, createProject, deleteProject, deleteResult, removeProjectDocument, savePriorities, saveResult, updateProject, type Result } from "@/lib/data/projects";

/** The signed-in advisor and a company they manage (every action below is scoped to it). */
async function managed(companyId: string) {
  const user = await requireRole(["advisor", "admin"]);
  const id = z.uuid().safeParse(companyId);
  const company = id.success ? await getManagedCompany(user, id.data) : null;
  return company ? { user, company } : null;
}

const uuid = (v: unknown) => z.uuid().safeParse(v).success;
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

function refresh(companyId: string) {
  revalidatePath(`/advisor/companies/${companyId}`, "layout");
  // What the founder sees.
  revalidatePath("/overview");
  revalidatePath("/library", "layout");
  revalidatePath("/projects", "layout");
}

export async function createProjectAction(companyId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false, error: "That company isn't available." };
  const r = await createProject(ctx.user, ctx.company, { name: str(form, "name"), startedOn: str(form, "startedOn") });
  if (r.ok) refresh(companyId);
  return r.ok ? { ok: true } : r;
}

export async function updateProjectAction(companyId: string, projectId: string, _prev: Result | null, form: FormData): Promise<Result> {
  const ctx = await managed(companyId);
  if (!ctx || !uuid(projectId)) return { ok: false, error: "That project isn't available." };
  const status = str(form, "status") === "completed" ? "completed" : "open";
  const r = await updateProject(ctx.company, projectId, { name: str(form, "name"), startedOn: str(form, "startedOn"), status, completedOn: str(form, "completedOn") || null });
  if (r.ok) refresh(companyId);
  return r;
}

export async function deleteProjectAction(companyId: string, projectId: string): Promise<void> {
  const ctx = await managed(companyId);
  if (!ctx || !uuid(projectId)) return;
  await deleteProject(ctx.company, projectId);
  refresh(companyId);
}

/** A link (Google Doc, Notion…) as the project's action plan or another document. */
export async function addProjectLinkAction(companyId: string, projectId: string, kind: "action_plan" | "document", _prev: Result | null, form: FormData): Promise<Result> {
  const ctx = await managed(companyId);
  if (!ctx || !uuid(projectId) || !["action_plan", "document"].includes(kind)) return { ok: false, error: "That project isn't available." };
  const r = await addProjectDocument(ctx.user, ctx.company, projectId, { kind, title: str(form, "title"), url: str(form, "url") });
  if (r.ok) refresh(companyId);
  return r;
}

/** A file the advisor uploaded (to projects/<companyId>/…) as the action plan or another document. */
export async function addProjectFileAction(companyId: string, projectId: string, kind: "action_plan" | "document", file: { blobUrl: string; pathname: string; filename: string; mime: string | null; title: string }): Promise<Result> {
  const ctx = await managed(companyId);
  if (!ctx || !uuid(projectId) || !["action_plan", "document"].includes(kind)) return { ok: false, error: "That project isn't available." };
  const f = z.object({ blobUrl: z.url().max(2048), pathname: z.string().min(1).max(1024), filename: z.string().min(1).max(255), mime: z.string().max(200).nullable(), title: z.string().max(160) }).safeParse(file);
  if (!f.success) return { ok: false, error: "That file isn't valid." };
  const r = await addProjectDocument(ctx.user, ctx.company, projectId, { kind, ...f.data });
  if (r.ok) refresh(companyId);
  return r;
}

export async function removeProjectDocumentAction(companyId: string, documentId: string): Promise<void> {
  const ctx = await managed(companyId);
  if (!ctx || !uuid(documentId)) return;
  await removeProjectDocument(ctx.company, documentId);
  refresh(companyId);
}

export async function saveResultAction(companyId: string, projectId: string, resultId: string | null, _prev: Result | null, form: FormData): Promise<Result> {
  const ctx = await managed(companyId);
  if (!ctx || !uuid(projectId) || (resultId !== null && !uuid(resultId))) return { ok: false, error: "That project isn't available." };
  const r = await saveResult(ctx.user, ctx.company, projectId, resultId, { label: str(form, "label"), value: str(form, "value"), note: str(form, "note") });
  if (r.ok) refresh(companyId);
  return r;
}

export async function approveResultAction(companyId: string, resultId: string, approved: boolean): Promise<void> {
  const ctx = await managed(companyId);
  if (!ctx || !uuid(resultId)) return;
  await approveResult(ctx.user, ctx.company, resultId, approved);
  refresh(companyId);
}

export async function deleteResultAction(companyId: string, resultId: string): Promise<void> {
  const ctx = await managed(companyId);
  if (!ctx || !uuid(resultId)) return;
  await deleteResult(ctx.company, resultId);
  refresh(companyId);
}

/** The week's priorities, replaced as a whole (rows title-n, action-n, due-n). */
export async function savePrioritiesAction(companyId: string, week: string, _prev: Result | null, form: FormData): Promise<Result> {
  const ctx = await managed(companyId);
  if (!ctx) return { ok: false, error: "That company isn't available." };
  const items = Array.from({ length: 5 }, (_, n) => ({ title: str(form, `title-${n}`), action: str(form, `action-${n}`), dueOn: str(form, `due-${n}`) || null }));
  const r = await savePriorities(ctx.user, ctx.company, week, items);
  if (r.ok) refresh(companyId);
  return r;
}
