import type { Role } from "@/lib/db/schema";

/**
 * Access policy. Pure functions so every rule can be unit-tested; the
 * data-access layer calls these before returning company data.
 */

export type Actor = { id: string; role: Role };
export type CompanyRef = { id: string; advisorId: string | null };

export const isStaff = (actor: Actor) => actor.role === "advisor" || actor.role === "admin";

/** Where a signed-in user lands. */
export function homePathFor(role: Role): string {
  return role === "founder" ? "/overview" : "/advisor/portfolio";
}

/**
 * Founders: only companies they are a member of.
 * Advisors: companies assigned to them, plus the unassigned queue.
 * Admins: everything.
 */
export function canViewCompany(actor: Actor, company: CompanyRef, memberCompanyIds: readonly string[]): boolean {
  switch (actor.role) {
    case "admin":
      return true;
    case "advisor":
      return company.advisorId === actor.id || company.advisorId === null;
    case "founder":
      return memberCompanyIds.includes(company.id);
  }
}

/** Founders only ever see published deliverables; staff with company access see every status. */
export function canViewDeliverable(
  actor: Actor,
  deliverable: { status: string },
  hasCompanyAccess: boolean,
): boolean {
  if (!hasCompanyAccess) return false;
  return isStaff(actor) || deliverable.status === "published";
}
