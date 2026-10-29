import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Shell, StagingBadge } from "@/components/shell/Shell";
import { UseCaseSidebar } from "@/components/shell/UseCaseSidebar";
import { stepStates } from "@/lib/use-cases/steps";
import { company } from "@/lib/mockups/acme-hiring";
import { noop } from "./actions";

export const metadata: Metadata = { title: "Mockups · Growth Goaled", robots: { index: false } };

/**
 * V0 of docs/briefs/2026-10-29-visual-founder-flow.md: static, visual-first mockups for owner review.
 * Never served in production; no data access, no auth.
 */
export default function MockupLayout({ children }: { children: ReactNode }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  return (
    <Shell
      sidebar={
        <UseCaseSidebar
          steps={stepStates({ useCase: "hire_or_fix", status: "tracking" })}
          basePath="/mockups"
          options={[{ id: "hire_or_fix", label: company.shortTitle }]}
          activeUseCase="hire_or_fix"
          select={noop}
        />
      }
      topbar={
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
            A
          </div>
          <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>{company.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--blue-muted)", color: "var(--blue)" }}>
            {company.stage}
          </span>
          <StagingBadge />
        </div>
      }
    >
      {children}
    </Shell>
  );
}
