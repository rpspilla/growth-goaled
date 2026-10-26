import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { founderContext } from "@/lib/data/founder-context";
import { targetSummary } from "@/lib/use-cases";
import { GrowthLeakResults } from "./GrowthLeakResults";

// Analysis is drafted after the action responds (next/server after()), within this budget.
export const maxDuration = 300;

/** Step 4: results for the active (purchased) assessment. */
export default async function ResultsPage() {
  const { user, company, active } = await founderContext();
  if (!active || !company) redirect("/library");
  if (active.def.id === "growth_leak") return <GrowthLeakResults user={user} company={company} useCase={active.def} />;

  const target = targetSummary(active.objective);
  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <PageHeader eyebrow="Assessment results" title={active.def.question} subtitle="Your results appear here once they're ready." />
      <div className="rounded-xl border p-6 text-sm space-y-2" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
        <p>An analyst prepares this assessment from the data you share. You&apos;ll see the results here with the evidence behind each finding.</p>
        {target && <p style={{ color: "var(--muted-foreground)" }}>Your target: {target}</p>}
      </div>
    </div>
  );
}
