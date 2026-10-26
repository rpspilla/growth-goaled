import Link from "next/link";
import type { ReactNode } from "react";
import { selectUseCase } from "@/components/shell/actions";
import { UseCaseSidebar } from "@/components/shell/UseCaseSidebar";
import { getUseCase } from "@/lib/use-cases";
import { stepStates } from "@/lib/use-cases/steps";
import { companyContext } from "./context";

/** Opening a company shows the founder's five steps for it (HANDOFF §13.7), plus advisor actions on each. */
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company, useCases, active } = await companyContext(id);
  const options = useCases.filter((u) => u.activatedAt).flatMap((u) => {
    const def = getUseCase(u.useCase);
    return def ? [{ id: def.id, label: def.shortTitle }] : [];
  });
  // Advisors can open every step; the founder's lock state is shown as a note.
  const steps = stepStates(active && { useCase: active.def.id, status: active.status }).map((s) => ({ ...s, locked: false, lockedReason: null }));

  return (
    <div className="flex min-h-full">
      <aside className="w-56 shrink-0 flex flex-col" style={{ background: "var(--navy)", color: "#C8D3E0" }} aria-label={`${company.name} steps`}>
        <div className="px-4 pt-5 pb-3">
          <Link href="/advisor/portfolio" className="text-xs" style={{ color: "#5A7A96" }}>← Portfolio</Link>
          <div className="text-sm font-semibold text-white mt-2">{company.name}</div>
          <div className="text-xs" style={{ color: "#5A7A96" }}>Founder&apos;s steps</div>
        </div>
        <UseCaseSidebar steps={steps} basePath={`/advisor/companies/${company.id}`} options={options} activeUseCase={active?.useCase ?? null} select={selectUseCase} />
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
