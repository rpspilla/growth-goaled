"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getAuth } from "@/lib/auth/server";
import { requireUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { canSwitchToAdvisor } from "@/lib/multi-company";
import { safeNextPath } from "@/lib/invites";
import { isUseCaseId } from "@/lib/use-cases";
import { USE_CASE_COOKIE } from "@/lib/use-cases/cookie";

/** Signs out, then goes to the form's `next` field if it's a same-site path (default /sign-in). */
export async function signOut(formData?: FormData) {
  await getAuth().signOut();
  const next = formData?.get("next");
  redirect(typeof next === "string" ? safeNextPath(next) : "/sign-in");
}

/** Use case switcher at the top of the sidebar. */
export async function selectUseCase(formData: FormData) {
  const id = formData.get("useCase");
  if (typeof id !== "string" || !isUseCaseId(id)) return;
  (await cookies()).set(USE_CASE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

/**
 * Founder ⇄ advisor view, for users listed in SELF_ADVISOR_EMAILS. Their companies stay theirs either
 * way; switching to advisor also assigns them as advisor on their own companies that have none.
 */
export async function switchView(formData: FormData) {
  const user = await requireUser();
  const to = formData.get("to");
  if ((to !== "founder" && to !== "advisor") || user.role === "admin" || !canSwitchToAdvisor(user.email)) return;
  await db.update(schema.users).set({ role: to, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
  if (to === "advisor") {
    const own = db.select({ id: schema.companyMembers.companyId }).from(schema.companyMembers).where(eq(schema.companyMembers.userId, user.id));
    await db.update(schema.companies).set({ advisorId: user.id }).where(and(inArray(schema.companies.id, own), isNull(schema.companies.advisorId)));
  }
  revalidatePath("/", "layout");
  redirect(homePathFor(to));
}
