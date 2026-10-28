import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { founderContext } from "@/lib/data/founder-context";

/** Data is scoped to the active use case, so it stays locked until one is activated (HANDOFF §13.2). */
export default async function DataLayout({ children }: { children: ReactNode }) {
  const { active } = await founderContext();
  if (active) return children;
  return (
    <div className="px-4 sm:px-8 py-8 max-w-3xl">
      <PageHeader eyebrow="Step 3 of 5" title="Data" subtitle="Share the data your assessment needs." />
      <div className="surface p-6 text-base space-y-3" style={{ color: "var(--foreground)" }}>
        <p>This step unlocks when you buy an assessment. Pick a question in the library, get your free Snapshot, and we&apos;ll show you exactly which data the full assessment needs.</p>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Just paid? We&apos;re confirming with Stripe. Refresh in a moment.</p>
        <Link href="/library" className="btn btn-primary">
          Pick a growth question →
        </Link>
      </div>
    </div>
  );
}
