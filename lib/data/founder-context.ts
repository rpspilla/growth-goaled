import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/auth/session";
import type { Company } from "@/lib/db/schema";
import { USE_CASE_COOKIE } from "@/lib/use-cases/cookie";
import { getUseCase, type UseCaseDef } from "@/lib/use-cases";
import { getFounderCompany } from "./companies";
import { listCompanyUseCases, pickActiveUseCase, type CompanyUseCase } from "./use-cases";

export type UseCaseContext = {
  useCases: CompanyUseCase[];
  /** The activated use case steps 3–5 follow, or null. */
  active: (CompanyUseCase & { def: UseCaseDef }) | null;
};

/** Use cases for a company plus the active one (cookie preference, else latest activation). */
export async function loadUseCaseContext(company: Pick<Company, "id">): Promise<UseCaseContext> {
  const [useCases, jar] = await Promise.all([listCompanyUseCases(company.id), cookies()]);
  const row = pickActiveUseCase(useCases, jar.get(USE_CASE_COOKIE)?.value);
  const def = row ? getUseCase(row.useCase) : undefined;
  return { useCases, active: row && def ? { ...row, def } : null };
}

/** The signed-in founder, their company and its use cases; cached per request (layout + page). */
export const founderContext = cache(async () => {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  return { user, company, ...(company ? await loadUseCaseContext(company) : { useCases: [], active: null }) };
});
