"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { listFounderCompanies } from "@/lib/data/companies";
import { track } from "@/lib/events";
import { COMPANY_COOKIE, canAddCompanies } from "@/lib/multi-company";
import { founderOnboardingSchema } from "@/lib/onboarding";
import { USE_CASE_COOKIE } from "@/lib/use-cases/cookie";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

async function workOn(companyId: string) {
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, companyId, cookieOptions);
  // The active assessment is per company: start from that company's own.
  jar.delete(USE_CASE_COOKIE);
  revalidatePath("/", "layout");
}

/** Company switcher: only to a company the founder is a member of. */
export async function switchCompany(formData: FormData) {
  const user = await requireRole(["founder"]);
  const id = z.uuid().safeParse(formData.get("companyId"));
  if (!id.success || !(await listFounderCompanies(user)).some((c) => c.id === id.data)) return;
  await workOn(id.data);
  redirect("/overview");
}

export type AddCompanyState = { errors?: Record<string, string> };

/** Another company profile, for founders allowed more than one (MULTI_COMPANY_FOUNDERS). */
export async function addCompany(_prev: AddCompanyState, formData: FormData): Promise<AddCompanyState> {
  const user = await requireRole(["founder"]);
  if (!canAddCompanies(user.email)) return { errors: { form: "Your account can have one company. Contact us if you need more." } };
  const parsed = founderOnboardingSchema.pick({ companyName: true, website: true, revenueBand: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { errors };
  }
  const { companyName, website, revenueBand } = parsed.data;
  const companyId = randomUUID();
  // Like onboarding: the new company joins the unassigned queue for an advisor to claim.
  await db.batch([
    db.insert(schema.companies).values({ id: companyId, name: companyName, website, revenueBand, advisorId: null }),
    db.insert(schema.companyMembers).values({ companyId, userId: user.id, memberRole: "owner" }),
  ]);
  await track("company_added", { userId: user.id, companyId, props: { revenue_band: revenueBand } });
  await workOn(companyId);
  redirect("/library?welcome=1");
}
