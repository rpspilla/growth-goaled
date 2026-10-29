import type { ReactNode } from "react";
import { and, count, eq, isNull, or } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { Shell, StagingBadge, UserMenu } from "@/components/shell/Shell";
import { AdvisorSidebar, type AdvisorBadges } from "@/components/shell/AdvisorSidebar";

async function getBadges(user: User): Promise<AdvisorBadges> {
  const { companies, deliverables } = schema;
  const [unassigned] = await db
    .select({ n: count() })
    .from(companies)
    .where(and(isNull(companies.advisorId), eq(companies.isSample, false)));

  // Admins review everything; advisors only their assigned companies.
  const scope = user.role === "admin" ? undefined : eq(companies.advisorId, user.id);
  const [review] = await db
    .select({ n: count() })
    .from(deliverables)
    .innerJoin(companies, eq(companies.id, deliverables.companyId))
    // Benchmarks wait for review. Assessments publish straight away (reviewRequired is no longer set).
    .where(and(eq(deliverables.status, "in_review"), or(eq(deliverables.type, "benchmark"), eq(deliverables.reviewRequired, true)), scope));

  return { unassigned: unassigned?.n ?? 0, review: review?.n ?? 0 };
}

export default async function AdvisorLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["advisor", "admin"]);
  const badges = await getBadges(user);

  return (
    <Shell
      sidebar={
        <AdvisorSidebar badges={badges} name={user.name} email={user.email} role={user.role === "admin" ? "admin" : "advisor"} />
      }
      topbar={
        <>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)", minWidth: "220px" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>Search companies...</span>
          </div>
          <div className="ml-3">
            <StagingBadge />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {badges.review > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: "var(--amber-muted)", color: "var(--amber)" }}
              >
                {badges.review} pending {badges.review === 1 ? "review" : "reviews"}
              </span>
            )}
            <UserMenu name={user.name} email={user.email} color="green" />
          </div>
        </>
      }
    >
      {children}
    </Shell>
  );
}
