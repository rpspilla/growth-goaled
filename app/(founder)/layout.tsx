import type { ReactNode } from "react";
import { founderContext } from "@/lib/data/founder-context";
import { listFounderCompanies } from "@/lib/data/companies";
import { canAddCompanies, canSwitchToAdvisor } from "@/lib/multi-company";
import { CompanySwitcher } from "@/components/shell/CompanySwitcher";
import { Shell, StagingBadge, UserMenu } from "@/components/shell/Shell";
import { UseCaseSidebar } from "@/components/shell/UseCaseSidebar";
import { selectUseCase } from "@/components/shell/actions";
import { getUseCase } from "@/lib/use-cases";
import { stepStates } from "@/lib/use-cases/steps";

export default async function FounderLayout({ children }: { children: ReactNode }) {
  const { user, company, useCases, active } = await founderContext();
  const companies = await listFounderCompanies(user);
  const options = useCases.filter((u) => u.activatedAt).flatMap((u) => {
    const def = getUseCase(u.useCase);
    return def ? [{ id: def.id, label: def.shortTitle }] : [];
  });

  return (
    <Shell
      sidebar={
        <UseCaseSidebar
          steps={stepStates(active && { useCase: active.def.id, status: active.status }, { overview: false })}
          options={options}
          activeUseCase={active?.useCase ?? null}
          select={selectUseCase}
          libraryHint="Pick a growth question"
          extra={[
            { href: "/overview", label: "Overview" },
            { href: "/performance", label: "Performance" },
            { href: "/assessments", label: "All assessments" },
            { href: "/profile", label: "Company profile" },
          ]}
        />
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
      {children}
    </Shell>
  );
}
