import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, CompanyUseCase, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { getUseCase, objectiveFields, parseAnswer, type Objective, type UseCaseId } from "@/lib/use-cases";

export type { CompanyUseCase };

export const isActivated = (row: Pick<CompanyUseCase, "activatedAt"> | null | undefined) => Boolean(row?.activatedAt);

/** Every use case the company has started (objective saved) or activated, newest activation first. */
export async function listCompanyUseCases(companyId: string): Promise<CompanyUseCase[]> {
  const rows = await db.select().from(schema.companyUseCases).where(eq(schema.companyUseCases.companyId, companyId));
  return rows.sort((a, b) => (b.activatedAt?.getTime() ?? 0) - (a.activatedAt?.getTime() ?? 0) || b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getCompanyUseCase(companyId: string, useCase: UseCaseId): Promise<CompanyUseCase | null> {
  const [row] = await db
    .select()
    .from(schema.companyUseCases)
    .where(and(eq(schema.companyUseCases.companyId, companyId), eq(schema.companyUseCases.useCase, useCase)))
    .limit(1);
  return row ?? null;
}

export async function isUseCaseActive(companyId: string, useCase: UseCaseId): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.companyUseCases.id })
    .from(schema.companyUseCases)
    .where(and(eq(schema.companyUseCases.companyId, companyId), eq(schema.companyUseCases.useCase, useCase), isNotNull(schema.companyUseCases.activatedAt)))
    .limit(1);
  return Boolean(row);
}

/**
 * The use case steps 3–5 follow: the one the user picked (cookie) if it's activated
 * for this company, otherwise the most recently activated. Null when none is active.
 */
export function pickActiveUseCase(rows: readonly CompanyUseCase[], preferred: string | undefined): CompanyUseCase | null {
  const active = rows.filter(isActivated);
  return active.find((r) => r.useCase === preferred) ?? active[0] ?? null;
}

export type SaveAnswerResult = { ok: true; value: string } | { ok: false; error: string };

/** Saves one objective answer (the form autosaves on blur). Creates the company use case on first save. */
export async function saveObjectiveAnswer(company: Pick<Company, "id">, useCaseId: UseCaseId, fieldId: string, raw: string): Promise<SaveAnswerResult> {
  const useCase = getUseCase(useCaseId);
  const field = useCase && objectiveFields(useCase).find((f) => f.id === fieldId);
  if (!useCase || !field) return { ok: false, error: "Unknown question." };
  let value: string;
  try {
    value = parseAnswer(field, raw);
  } catch {
    return { ok: false, error: field.kind === "date" ? "Enter a date." : field.kind === "select" ? "Pick one of the options." : field.kind === "text" || field.kind === "textarea" ? "That answer is too long." : "Enter a number." };
  }
  const existing = await getCompanyUseCase(company.id, useCaseId);
  const objective: Objective = { ...(existing?.objective ?? {}) };
  if (value) objective[fieldId] = value;
  else delete objective[fieldId];
  const now = new Date();
  await db
    .insert(schema.companyUseCases)
    .values({ companyId: company.id, useCase: useCaseId, objective, objectiveUpdatedAt: now })
    .onConflictDoUpdate({
      target: [schema.companyUseCases.companyId, schema.companyUseCases.useCase],
      set: { objective, objectiveUpdatedAt: now, updatedAt: now },
    });
  return { ok: true, value };
}

/**
 * Records that the founder has started a question (submitted its questionnaire), so it shows on
 * their home and in their history even when it has no questions of its own to save. No-op if it exists.
 */
export async function startUseCase(company: Pick<Company, "id">, useCaseId: UseCaseId): Promise<void> {
  await db.insert(schema.companyUseCases).values({ companyId: company.id, useCase: useCaseId, objective: {}, objectiveUpdatedAt: new Date() }).onConflictDoNothing();
}

/**
 * Activates a use case for a company (after payment, or by an advisor for a pilot).
 * Idempotent: an already-active use case keeps its original activation.
 */
export async function activateUseCase(
  companyId: string,
  useCaseId: UseCaseId,
  how: { activation: "paid" | "advisor"; by: string | null; note?: string | null },
): Promise<{ activated: boolean }> {
  const now = new Date();
  const existing = await getCompanyUseCase(companyId, useCaseId);
  if (existing?.activatedAt) return { activated: false };
  const values = {
    status: "active" as const,
    activatedAt: now,
    activatedBy: how.by,
    activation: how.activation,
    activationNote: how.note?.trim() || null,
    updatedAt: now,
  };
  if (existing) await db.update(schema.companyUseCases).set(values).where(eq(schema.companyUseCases.id, existing.id));
  else await db.insert(schema.companyUseCases).values({ companyId, useCase: useCaseId, ...values }).onConflictDoNothing();
  await track("use_case_activated", { userId: how.by ?? undefined, companyId, props: { use_case: useCaseId, activation: how.activation } });
  return { activated: true };
}

/** Advisor/admin pilot activation: no payment, recorded with who and why. Access is checked by the caller. */
export async function activateWithoutPayment(advisor: User, company: Pick<Company, "id">, useCaseId: UseCaseId, note: string) {
  if (advisor.role !== "advisor" && advisor.role !== "admin") throw new Error("Only advisors can activate without payment.");
  if (getUseCase(useCaseId)?.comingSoon) throw new Error("This question is coming soon and can't be granted yet.");
  return activateUseCase(company.id, useCaseId, { activation: "advisor", by: advisor.id, note });
}

/** Latest activation per company (portfolio and analytics). */
export async function activationsFor(companyIds: readonly string[]) {
  if (!companyIds.length) return [];
  return db
    .select()
    .from(schema.companyUseCases)
    .where(and(inArray(schema.companyUseCases.companyId, [...companyIds]), isNotNull(schema.companyUseCases.activatedAt)))
    .orderBy(desc(schema.companyUseCases.activatedAt));
}

/** Moves an activated use case along (objective → active → baseline_in_review → tracking → closed). */
export async function setUseCaseStatus(companyId: string, useCaseId: UseCaseId, status: CompanyUseCase["status"]) {
  await db
    .update(schema.companyUseCases)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.companyUseCases.companyId, companyId), eq(schema.companyUseCases.useCase, useCaseId), isNotNull(schema.companyUseCases.activatedAt)));
}
