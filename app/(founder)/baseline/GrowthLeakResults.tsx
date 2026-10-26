import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { CompletionList } from "@/components/deliverables/CompletionList";
import { PreliminaryTrigger } from "@/components/deliverables/PreliminaryTrigger";
import { RebuildButton } from "@/components/deliverables/RebuildButton";
import { AnalyzingDots } from "@/components/readiness/DocumentCard";
import { AdvisoryOffer } from "@/components/use-cases/AdvisoryOffer";
import { AssessmentResults } from "@/components/views/AssessmentResults";
import type { Company } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";
import { founderBenchmark } from "@/lib/data/preliminary";
import { track } from "@/lib/events";
import { formatPrice, pricing } from "@/lib/pricing";
import { getUseCase, type UseCaseDef } from "@/lib/use-cases";
import { resultConfidence } from "@/lib/use-cases/results";
import { sourceTrailOpened } from "./actions";

const card = { background: "var(--card)", borderColor: "var(--border)" };

/**
 * Growth Leak results, built by the existing report pipeline (preliminary first,
 * then the analyst-reviewed version). Shown only once the assessment is purchased.
 */
export async function GrowthLeakResults({ user, company, useCase }: { user: User; company: Company; useCase: UseCaseDef }) {
  const state = await founderBenchmark(company);
  const next = useCase.nextUseCase ? getUseCase(useCase.nextUseCase) : undefined;
  const nextUseCase = next ? { href: `/library/${next.id}`, question: next.question } : null;
  const advisory = <AdvisoryOffer price={formatPrice(pricing().advisoryFromCents)} useCase={useCase.id} />;

  const view = state.kind === "published" ? state.view : state.view;
  if (view) {
    const preliminary = state.kind === "preliminary";
    const steps = state.kind === "preliminary" ? state.steps : [];
    await track("deliverable_viewed", { userId: user.id, companyId: company.id, props: { type: "assessment", use_case: useCase.id, preliminary } });
    return (
      <>
        {preliminary && (
          <div className="px-4 sm:px-8 pt-6 max-w-5xl flex justify-end">
            <RebuildButton />
          </div>
        )}
        <AssessmentResults
          title={useCase.question}
          data={view}
          preliminary={preliminary}
          confidence={resultConfidence({ reviewed: !preliminary, unconfirmed: view.rows.filter((r) => r.unconfirmed).length, gaps: steps.length, metrics: view.rows.length })}
          steps={steps}
          nextUseCase={nextUseCase}
          advisory={advisory}
          onSourceTrail={sourceTrailOpened}
        />
      </>
    );
  }

  // Not ready yet: say exactly where it stands and what's needed.
  if (state.kind !== "preliminary") return null;
  return (
    <div className="p-4 sm:p-8 max-w-5xl space-y-6">
      <PreliminaryTrigger filesWorking={false} />
      <BuildingRefresh active={state.state === "building"} />
      <PageHeader eyebrow="Assessment results" title={useCase.question} subtitle="Your results appear here as soon as they're ready." />

      {state.state === "building" && (
        <div className="rounded-xl border p-6" style={card}>
          <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Analyzing your data</div>
          <AnalyzingDots label="Working through your figures and checking every number..." />
          <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Usually a minute or two. This page updates on its own.</p>
        </div>
      )}

      {state.state === "unavailable" && (
        <div className="rounded-xl border p-6 text-sm space-y-3" style={card}>
          <div style={{ color: "var(--foreground)" }}>{state.reason ?? "We can't produce results from what's been shared yet."}</div>
          <RebuildButton label="Try again" />
        </div>
      )}

      {state.advisorInProgress && (
        <div className="rounded-xl border p-6 text-sm" style={{ ...card, color: "var(--foreground)" }}>
          An analyst is preparing your reviewed results. You&apos;ll see them here as soon as they&apos;re ready.
        </div>
      )}

      {state.state === "none" && !state.advisorInProgress && (
        <div className="rounded-xl border p-6 text-sm space-y-3" style={card}>
          <div style={{ color: "var(--foreground)" }}>
            Share your data in <Link href="/data" style={{ color: "var(--green)" }}>Data</Link> and we&apos;ll start analyzing it right away.
          </div>
          <RebuildButton label="Analyze what I've shared" />
        </div>
      )}

      <CompletionList steps={state.steps} />
    </div>
  );
}
