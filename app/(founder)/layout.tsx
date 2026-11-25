import type { ReactNode } from "react";
import Link from "next/link";
import { founderContext } from "@/lib/data/founder-context";
import { listFounderCompanies } from "@/lib/data/companies";
import { canAddCompanies, canSwitchToAdvisor } from "@/lib/multi-company";
import { CompanySwitcher } from "@/components/shell/CompanySwitcher";
import { Shell, StagingBadge, UserMenu } from "@/components/shell/Shell";
import { RallyRail } from "@/components/shell/RallyRail";
import { RallyLogo, RallyMark } from "@/components/brand/Rally";
import { founderCompanyNav } from "@/lib/nav";
import { listConversations } from "@/lib/data/chat";
import { CompanyBrandBar } from "@/components/brand/CompanyBrandBar";
import { companySite } from "@/lib/data/company-site";

export default async function FounderLayout({ children }: { children: ReactNode }) {
  const { user, company } = await founderContext();
  const [companies, site, recent] = await Promise.all([listFounderCompanies(user), company ? companySite(company) : null, company ? listConversations(company, 8) : Promise.resolve([])]);

  return (
    <Shell
      brand={
        <Link href="/whats-next" aria-label="Rally home" className="inline-block rounded-lg focus-visible:outline-2">
          <RallyLogo />
        </Link>
      }
      sidebar={<RallyRail recent={recent.map((c) => ({ id: c.id, title: c.title }))} company={founderCompanyNav()} />}
      topbar={
        <>
          <div className="flex items-center gap-2 min-w-0">
            {/* Phones: the Rally mark goes home (the sidebar, with the full logo, is in the menu). */}
            <Link href="/whats-next" aria-label="Rally home" className="md:hidden shrink-0">
              <RallyMark size={26} />
            </Link>
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
      {company && <CompanyBrandBar name={company.name} logoUrl={site?.logoUrl ?? null} about={site?.about ?? null} website={site?.website ?? null} hideOn={["/overview", "/whats-next", "/chat", "/feedback", "/decisions", "/cros"]} />}
      {children}
    </Shell>
  );
}
