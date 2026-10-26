import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getManagedCompany } from "@/lib/data/companies";
import { loadUseCaseContext } from "@/lib/data/founder-context";

/** The advisor's view of one company (404 unless they manage it); cached per request (layout + page). */
export const companyContext = cache(async (id: string) => {
  const user = await requireRole(["advisor", "admin"]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const company = await getManagedCompany(user, id);
  if (!company) notFound();
  return { user, company, ...(await loadUseCaseContext(company)) };
});
