import Link from "next/link";
import type { ReactNode } from "react";
import { RallyLogo } from "@/components/brand/Rally";

/** The public CRO network (Nov 24, 2026): no sign-in; growthgoaled.com links here. */
export default function NetworkLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <header className="border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4 flex-wrap">
          <Link href="/network" aria-label="Rally: the CROs behind Rally">
            <RallyLogo tone="light" />
          </Link>
          <span className="flex-1" />
          <Link href="/sign-in" className="btn btn-primary text-sm">Get Free Beta Access</Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">{children}</main>
    </div>
  );
}
