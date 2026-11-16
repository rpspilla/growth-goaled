import type { ReactNode } from "react";
import { founderContext } from "@/lib/data/founder-context";
import { listFounderCompanies } from "@/lib/data/companies";
import { canAddCompanies, canSwitchToAdvisor } from "@/lib/multi-company";
import { CompanySwitcher } from "@/components/shell/CompanySwitcher";
import { Shell, StagingBadge, UserMenu } from "@/components/shell/Shell";
import { UseCaseSidebar } from "@/components/shell/UseCaseSidebar";
import { selectUseCase } from "@/components/shell/actions";
import { founderNav } from "@/lib/nav";
import { CompanyBrandBar } from "@/components/brand/CompanyBrandBar";
import { companySite } from "@/lib/data/company-site";

export default async function FounderLayout({ children }: { children: ReactNode }) {
  const { user, company } = await founderContext();
  const [companies, site] = await Promise.all([listFounderCompanies(user), company ? companySite(company) : null]);

  return (
    <Shell
      sidebar={
        <UseCaseSidebar items={founderNav()} options={[]} activeUseCase={null} select={selectUseCase} />
      }
      topbar={
        <>
          <div className="flex items-center gap-2 min-w-0">
            <CompanySwitcher current={company && { id: company.id, name: company.name }} companies={companies.map((c) => ({ id: c.id, name: c.name }))} canAdd={canAddCompanies(user.email)} />
            {company?.stage && (
              <span
                className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                style={{ background: "var(--blue-muted)", color: "var(--blue)" }}
              >
                {company.stage}
              </span>
            )}
            <StagingBadge />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <UserMenu name={user.name} email={user.email} color="navy" switchTo={canSwitchToAdvisor(user.email) ? "advisor" : undefined} />
          </div>
        </>
      }
    >
      {company && <CompanyBrandBar name={company.name} logoUrl={site?.logoUrl ?? null} about={site?.about ?? null} website={site?.website ?? null} />}
      {children}
    </Shell>
  );
}
