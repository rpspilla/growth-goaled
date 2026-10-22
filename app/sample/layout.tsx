import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSampleCompany } from "@/lib/data/dashboard";
import { Shell, StagingBadge } from "@/components/shell/Shell";
import { FounderSidebar } from "@/components/shell/FounderSidebar";
import { SAMPLE_PATHS } from "./paths";

export const metadata: Metadata = { title: "Sample company · Growth Goaled" };

/** Public, read-only demo of the founder experience for the seeded Acme AI company. */
export default async function SampleLayout({ children }: { children: ReactNode }) {
  const company = await getSampleCompany();

  return (
    <Shell
      sidebar={<FounderSidebar phase={company?.phase ?? "intake"} basePath="/sample" available={SAMPLE_PATHS} />}
      topbar={
        <>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
              style={{ background: "var(--green-muted)", color: "var(--green)" }}
            >
              {company?.name[0] ?? "S"}
            </div>
            <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>{company?.name ?? "Sample company"}</span>
            {company?.stage && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--blue-muted)", color: "var(--blue)" }}>
                {company.stage}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}>
              Sample company · read-only
            </span>
            <StagingBadge />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/sign-in" className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm font-semibold px-3 py-1.5 rounded-md"
              style={{ background: "var(--green)", color: "#fff" }}
            >
              Start your growth profile
            </Link>
          </div>
        </>
      }
    >
      {company ? (
        children
      ) : (
        <div className="p-8 text-sm" style={{ color: "var(--muted-foreground)" }}>
          The sample company hasn&apos;t been seeded in this environment yet.
        </div>
      )}
    </Shell>
  );
}
