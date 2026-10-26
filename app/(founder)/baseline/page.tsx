import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { founderContext } from "@/lib/data/founder-context";
import { targetSummary } from "@/lib/use-cases";
import { BenchmarkSection } from "./BenchmarkSection";

// The preliminary version is drafted after the action responds (next/server after()), within this budget.
export const maxDuration = 300;

export default async function BaselinePage() {
  const { active } = await founderContext();
  if (!active) redirect("/library");
  if (active.def.id === "growth_leak") return <BenchmarkSection />;

  const target = targetSummary(active.objective);
  return (
    <div className="p-8 max-w-4xl">
      <PageHeader eyebrow={active.def.shortTitle} title="Your baseline" subtitle={active.def.question} />
      <div className="rounded-xl border p-6 text-sm space-y-2" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
        <p>
          Your baseline shows where you stand today against your objective, the gap to your target and a plan to close it. We build it once the data
          it needs is in, and your advisor reviews it before you see the final version.
        </p>
        {target && <p style={{ color: "var(--muted-foreground)" }}>Your target: {target}</p>}
      </div>
    </div>
  );
}
