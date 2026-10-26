import Link from "next/link";
import type { ReactNode } from "react";
import { founderContext } from "@/lib/data/founder-context";
import { Shell, StagingBadge, UserMenu } from "@/components/shell/Shell";
import { UseCaseSidebar } from "@/components/shell/UseCaseSidebar";
import { selectUseCase } from "@/components/shell/actions";
import { getUseCase } from "@/lib/use-cases";
import { stepStates } from "@/lib/use-cases/steps";

export default async function FounderLayout({ children }: { children: ReactNode }) {
  const { user, company, useCases, active } = await founderContext();
  const companyName = company?.name ?? "Your company";
  const options = useCases.filter((u) => u.activatedAt).flatMap((u) => {
    const def = getUseCase(u.useCase);
    return def ? [{ id: def.id, label: def.shortTitle }] : [];
  });

  return (
    <Shell
      sidebar={
        <UseCaseSidebar
          steps={stepStates(active && { useCase: active.def.id, status: active.status })}
          options={options}
          activeUseCase={active?.useCase ?? null}
          select={selectUseCase}
          libraryHint="Pick one in the library"
        />
      }
      topbar={
        <>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
              style={{ background: "var(--green-muted)", color: "var(--green)" }}
            >
              {companyName[0]?.toUpperCase()}
            </div>
            <span className="font-semibold text-sm truncate" style={{ color: "var(--foreground)" }}>{companyName}</span>
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
            <Link href="/assessments" className="text-xs whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>
              <span className="hidden sm:inline">Your </span>assessments
            </Link>
            <UserMenu name={user.name} email={user.email} color="navy" profileHref="/profile" />
          </div>
        </>
      }
    >
      {children}
    </Shell>
  );
}
