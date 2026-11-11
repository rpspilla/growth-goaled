"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { mapImportRows, PRIORITIES, type Priority } from "@/lib/crm";
import { parseCsv } from "@/lib/file-profile";
import {
  addStage,
  addTask,
  completeTask,
  createContact,
  deleteContact,
  deleteDraft,
  deleteStage,
  deleteTask,
  importContacts,
  logActivity,
  moveContact,
  moveStage,
  renameStage,
  saveCompany,
  saveDraft,
  updateContact,
  type ContactInput,
} from "@/lib/data/crm";

// Every CRM action is for Growth Goaled staff only (advisors and admins).
const staff = () => requireRole(["advisor", "admin"]);
const uuid = z.uuid();
const refresh = (contactId?: string) => {
  revalidatePath("/advisor/crm", "layout");
  if (contactId) revalidatePath(`/advisor/crm/contacts/${contactId}`);
};

export type FormState = { ok?: boolean; error?: string; id?: string; duplicateId?: string; note?: string };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const money = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/[$,\s]/g, "");
  return v && Number(v) >= 0 ? Math.round(Number(v) * 100) : null;
};
const int = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/[,\s]/g, "");
  return v && Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null;
};
const priority = (v: string): Priority | undefined => ((PRIORITIES as readonly string[]).includes(v) ? (v as Priority) : undefined);

function contactFrom(fd: FormData): ContactInput {
  const companyId = str(fd, "companyId");
  return {
    firstName: str(fd, "firstName"),
    lastName: str(fd, "lastName"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    jobTitle: str(fd, "jobTitle"),
    companyId: uuid.safeParse(companyId).success ? companyId : null,
    companyName: str(fd, "companyName"),
    website: str(fd, "website"),
    linkedinUrl: str(fd, "linkedinUrl"),
    location: str(fd, "location"),
    category: str(fd, "category"),
    subcategory: str(fd, "subcategory"),
    source: str(fd, "source"),
    ownerId: uuid.safeParse(str(fd, "ownerId")).success ? str(fd, "ownerId") : null,
    stageId: uuid.safeParse(str(fd, "stageId")).success ? str(fd, "stageId") : null,
    priority: priority(str(fd, "priority")),
    opportunity: str(fd, "opportunity"),
    potentialMonthlyCents: money(fd, "potentialMonthly"),
    dealValueCents: money(fd, "dealValue"),
    opportunityNotes: str(fd, "opportunityNotes"),
    notes: str(fd, "notes"),
    doNotEmail: fd.get("doNotEmail") === "on",
    tags: fd.has("tags") ? str(fd, "tags").split(",") : undefined,
  };
}

/** "+ Add Contact": the quick form on the board, or the full one on a company. */
export async function addContactAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await staff();
  const input = contactFrom(fd);
  const r = await createContact(user, input);
  // A next action can be set while adding.
  const next = str(fd, "nextAction");
  if (r.ok && next) await addTask(user, r.id, { title: next, dueDate: str(fd, "nextDue") || null });
  refresh();
  if (!r.ok) return { error: r.error, duplicateId: "duplicateId" in r ? r.duplicateId : undefined };
  return { ok: true, id: r.id };
}

export async function updateContactAction(contactId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await staff();
  if (!uuid.safeParse(contactId).success) return { error: "Contact not found." };
  const r = await updateContact(user, contactId, contactFrom(fd));
  refresh(contactId);
  return r.ok ? { ok: true, note: "Saved." } : { error: r.error };
}

export async function deleteContactAction(contactId: string): Promise<void> {
  await staff();
  if (!uuid.safeParse(contactId).success) return;
  await deleteContact(contactId);
  refresh();
  redirect("/advisor/crm");
}

/** Drag and drop on the board. */
export async function moveContactAction(contactId: string, stageId: string, beforeId: string | null): Promise<{ ok: boolean; error?: string }> {
  const user = await staff();
  if (!uuid.safeParse(contactId).success || !uuid.safeParse(stageId).success || (beforeId !== null && !uuid.safeParse(beforeId).success)) return { ok: false, error: "That move isn't valid." };
  const r = await moveContact(user, contactId, stageId, beforeId);
  refresh(contactId);
  return r;
}

export async function logActivityAction(contactId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await staff();
  const kind = z.enum(["note", "call", "meeting", "email_sent", "other"]).safeParse(str(fd, "kind"));
  if (!uuid.safeParse(contactId).success || !kind.success) return { error: "Pick what kind of interaction it was." };
  const r = await logActivity(user, contactId, kind.data, str(fd, "body"), str(fd, "on") || null);
  refresh(contactId);
  return r.ok ? { ok: true } : { error: r.error };
}

export async function addTaskAction(contactId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await staff();
  if (!uuid.safeParse(contactId).success) return { error: "Contact not found." };
  const remind = str(fd, "remindAt");
  const r = await addTask(user, contactId, { title: str(fd, "title"), dueDate: str(fd, "dueDate") || null, priority: priority(str(fd, "priority")), notes: str(fd, "notes"), remindAt: remind && !Number.isNaN(Date.parse(remind)) ? new Date(remind) : null });
  refresh(contactId);
  return r.ok ? { ok: true } : { error: r.error };
}

export async function completeTaskAction(taskId: string): Promise<void> {
  const user = await staff();
  if (!uuid.safeParse(taskId).success) return;
  await completeTask(user, taskId);
  refresh();
}

export async function deleteTaskAction(taskId: string, contactId: string): Promise<void> {
  await staff();
  if (!uuid.safeParse(taskId).success) return;
  await deleteTask(taskId);
  refresh(contactId);
}

export async function saveDraftAction(contactId: string, draftId: string | null, subject: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await staff();
  if (!uuid.safeParse(contactId).success || (draftId !== null && !uuid.safeParse(draftId).success) || typeof subject !== "string" || typeof body !== "string") return { ok: false, error: "That draft isn't valid." };
  const r = await saveDraft(user, contactId, draftId, { subject, body });
  refresh(contactId);
  return r;
}

export async function deleteDraftAction(contactId: string, draftId: string): Promise<void> {
  await staff();
  if (!uuid.safeParse(contactId).success || !uuid.safeParse(draftId).success) return;
  await deleteDraft(contactId, draftId);
  refresh(contactId);
}

export async function saveCompanyAction(companyId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await staff();
  if (companyId !== null && !uuid.safeParse(companyId).success) return { error: "Company not found." };
  const r = await saveCompany(user, companyId, {
    name: str(fd, "name"),
    website: str(fd, "website"),
    industry: str(fd, "industry"),
    stage: str(fd, "stage"),
    estimatedArrCents: money(fd, "estimatedArr"),
    employeeCount: int(fd, "employeeCount"),
    description: str(fd, "description"),
    keyNotes: str(fd, "keyNotes"),
  });
  refresh();
  if (companyId) revalidatePath(`/advisor/crm/companies/${companyId}`);
  return r.ok ? { ok: true, id: r.id, note: "Saved." } : { error: r.error };
}

/** CSV import: the file's text (read in the browser), mapped by its headers. */
export async function importCsvAction(text: string, defaults: { source: string; category: string }): Promise<{ ok: true; added: number; duplicates: string[]; skipped: number; failed: number } | { ok: false; error: string }> {
  const user = await staff();
  if (typeof text !== "string" || text.length > 5_000_000) return { ok: false, error: "That file is too large (5 MB at most)." };
  const { rows, skipped } = mapImportRows(parseCsv(text));
  if (!rows.length) return { ok: false, error: "No contacts found. The first row should be headers such as First name, Last name, Email, Company." };
  const r = await importContacts(user, rows, { source: defaults?.source || null, category: defaults?.category || null });
  refresh();
  return { ok: true, ...r, skipped };
}

// Columns
export async function addStageAction(fd: FormData): Promise<void> {
  await staff();
  await addStage(str(fd, "name"));
  refresh();
}

export async function renameStageAction(stageId: string, fd: FormData): Promise<void> {
  await staff();
  if (!uuid.safeParse(stageId).success) return;
  await renameStage(stageId, str(fd, "name"));
  refresh();
}

export async function moveStageAction(stageId: string, dir: number): Promise<void> {
  await staff();
  if (!uuid.safeParse(stageId).success) return;
  await moveStage(stageId, dir < 0 ? -1 : 1);
  refresh();
}

export async function deleteStageAction(stageId: string, fd: FormData): Promise<void> {
  const user = await staff();
  if (!uuid.safeParse(stageId).success) return;
  await deleteStage(user, stageId, str(fd, "moveTo"));
  refresh();
}
