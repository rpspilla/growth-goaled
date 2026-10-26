import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { JourneyVisual } from "@/components/use-cases/JourneyVisual";
import { assessmentCompletions } from "@/lib/data/assessments";
import { founderContext } from "@/lib/data/founder-context";
import { getUseCase, targetSummary } from "@/lib/use-cases";
import { journeyStage, nextAction } from "@/lib/use-cases/steps";

const STATUS_LINE: Record<string, string> = {
  objective: "Free Snapshot · not purchased",
  active: "Purchased · sharing data",
  baseline_in_review: "Purchased · analysis started",
  tracking: "Complete",
  closed: "Closed",
};

export default async function OverviewPage() {
  const { company, useCases, active } = await founderContext();
  const state = active && { useCase: active.def.id, status: active.status };
  const started = useCases.find((u) => !u.activatedAt);
  const action = nextAction(state, started ? (getUseCase(started.useCase)?.id ?? null) : null);
  const listed = useCases.filter((u) => getUseCase(u.useCase));
  const completed = company ? await assessmentCompletions(company.id) : {};

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <PageHeader
        title={company ? `Welcome to Growth Goaled, ${company.name}` : "Welcome to Growth Goaled"}
        subtitle="Pick the decision you're facing. Get a free Snapshot from a few questions, then a full assessment from your own data when you're ready."
      />
      <JourneyVisual stage={journeyStage(state)} action={{ label: action.label, href: action.path }} />

      {listed.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Your assessments</h2>
            <Link href="/assessments" className="text-xs" style={{ color: "var(--green)" }}>All assessments →</Link>
          </div>
          <div className="rounded-xl border divide-y" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            {listed.map((u) => {
              const def = getUseCase(u.useCase)!;
              const target = targetSummary(u.objective);
              return (
                <Link key={u.id} href={u.activatedAt ? `/assessments/open?use_case=${def.id}` : `/library/${def.id}/snapshot`} className="flex items-center gap-4 px-4 py-3 hover:opacity-80" style={{ borderColor: "var(--border)" }}>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{def.question}</div>
                    {target && <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Your target: {target}</div>}
                  </div>
                  <span className="text-xs" style={{ color: u.activatedAt ? "var(--green)" : "var(--muted-foreground)" }}>{u.activatedAt && completed[u.useCase] ? "Purchased · results ready" : (STATUS_LINE[u.status] ?? u.status)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
