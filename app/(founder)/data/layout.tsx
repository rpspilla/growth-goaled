import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { founderContext } from "@/lib/data/founder-context";

/** Data is scoped to the active use case, so it stays locked until one is activated (HANDOFF §13.2). */
export default async function DataLayout({ children }: { children: ReactNode }) {
  const { active } = await founderContext();
  if (active) {
    return (
      <>
        <div className="px-8 pt-6 -mb-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
          Use case: <span className="font-semibold" style={{ color: "var(--foreground)" }}>{active.def.shortTitle}</span> · {active.def.question}
        </div>
        {children}
      </>
    );
  }
  return (
    <div className="p-8 max-w-3xl">
      <PageHeader eyebrow="Step 3 · Data" title="Data" subtitle="Connect the data your use case needs." />
      <div className="rounded-xl border p-6 text-sm space-y-3" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
        <p>This step unlocks when you activate a use case. Pick one in the library, tell us your objective, and we&apos;ll show you exactly which data it needs.</p>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Just paid? We&apos;re confirming with Stripe. Refresh in a moment.</p>
        <Link href="/library" className="inline-block px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
          Open the Use Case Library →
        </Link>
      </div>
    </div>
  );
}
