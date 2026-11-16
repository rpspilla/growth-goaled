import Link from "next/link";
import type { ReactNode } from "react";
import { selectUseCase } from "@/components/shell/actions";
import { UseCaseSidebar } from "@/components/shell/UseCaseSidebar";
import { advisorNav } from "@/lib/nav";
import { companyContext } from "./context";
import { CompanyBrandBar } from "@/components/brand/CompanyBrandBar";
import { companySite } from "@/lib/data/company-site";

/** Opening a company shows the founder's menu for it, in the same order (HANDOFF §13.7), plus advisor actions on each. */
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company } = await companyContext(id);
  const site = await companySite(company);
  return (
    <div className="flex min-h-full">
      <aside className="w-56 shrink-0 flex flex-col" style={{ background: "var(--navy)", color: "#C8D3E0" }} aria-label={`${company.name} menu`}>
        <div className="px-4 pt-5 pb-3">
          <Link href="/advisor/portfolio" className="text-xs" style={{ color: "#5A7A96" }}>← Portfolio</Link>
          <div className="text-sm font-semibold text-white mt-2">{company.name}</div>
        </div>
        <UseCaseSidebar items={advisorNav(company.id)} options={[]} activeUseCase={null} select={selectUseCase} label="Founder's view" collapsible={false} />
      </aside>
      <div className="flex-1 min-w-0">
        <CompanyBrandBar name={company.name} logoUrl={site.logoUrl} about={site.about} website={site.website} hideOn={[]} />
        {children}
      </div>
    </div>
  );
}
