import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { Shell, StagingBadge, UserMenu } from "@/components/shell/Shell";
import { FounderSidebar } from "@/components/shell/FounderSidebar";

export default async function FounderLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  const companyName = company?.name ?? "Your company";

  return (
    <Shell
      sidebar={<FounderSidebar phase={company?.phase ?? "intake"} />}
      topbar={
        <>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
              style={{ background: "var(--green-muted)", color: "var(--green)" }}
            >
              {companyName[0]?.toUpperCase()}
            </div>
            <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>{companyName}</span>
            {company?.stage && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: "var(--blue-muted)", color: "var(--blue)" }}
              >
                {company.stage}
              </span>
            )}
            <StagingBadge />
          </div>
          <div className="ml-auto">
            <UserMenu name={user.name} email={user.email} color="navy" />
          </div>
        </>
      }
    >
      {children}
    </Shell>
  );
}
