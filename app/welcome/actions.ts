"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { homePathFor } from "@/lib/access";
import { track } from "@/lib/events";
import { founderOnboardingSchema, founderProfileSchema, needsOnboarding, staffProfileSchema } from "@/lib/onboarding";

export type OnboardingState = { errors?: Record<string, string> };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser({ allowIncomplete: true });
  if (!needsOnboarding(user)) redirect(homePathFor(user.role));

  const raw = Object.fromEntries(formData);
  const profileUpdate = (name: string, title: string | null) =>
    db.update(schema.users).set({ name, title, onboardedAt: new Date() }).where(eq(schema.users.id, user.id));

  // A founder attached to a company (via invite) only completes their profile;
  // otherwise the new company goes to the unassigned queue for an advisor to claim.
  if (user.role === "founder" && !(await getFounderCompany(user))) {
    const parsed = founderOnboardingSchema.safeParse(raw);
    if (!parsed.success) return { errors: fieldErrors(parsed.error.issues) };
    const { name, title, companyName, website, revenueBand } = parsed.data;
    const companyId = randomUUID();
    await db.batch([
      db.insert(schema.companies).values({ id: companyId, name: companyName, website, revenueBand, advisorId: null }),
      db.insert(schema.companyMembers).values({ companyId, userId: user.id, memberRole: "owner" }),
      profileUpdate(name, title),
    ]);
    await track("onboarding_completed", { userId: user.id, companyId, props: { revenue_band: revenueBand } });
    // Straight to the first real step: choosing the growth question to answer.
    redirect("/library?welcome=1");
  }

  const parsed = (user.role === "founder" ? founderProfileSchema : staffProfileSchema).safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error.issues) };
  await profileUpdate(parsed.data.name, parsed.data.title);
  await track("onboarding_completed", { userId: user.id, props: { role: user.role } });
  redirect(homePathFor(user.role));
}
