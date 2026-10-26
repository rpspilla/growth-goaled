import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { AnalyzingDots } from "@/components/readiness/DocumentCard";
import { AdvisoryOffer } from "@/components/use-cases/AdvisoryOffer";
import { RunAssessmentButton } from "@/components/use-cases/RunAssessmentButton";
import { AssessmentResults } from "@/components/views/AssessmentResults";
import { founderAssessment } from "@/lib/data/assessments";
import { figureChoices } from "@/lib/data/figures";
import { FigureChecker } from "@/components/use-cases/FigureChecker";
import { founderContext } from "@/lib/data/founder-context";
import { track } from "@/lib/events";
import { advisoryHref, formatPrice, pricing } from "@/lib/pricing";
import { assessmentMetrics, getUseCase, targetSummary } from "@/lib/use-cases";
import { chooseFigureAction, enterFigureAction, sourceTrailOpened } from "./actions";

// The assessment is drafted after the action responds (next/server after()), within this budget.
export const maxDuration = 300;

const card = { background: "var(--card)", borderColor: "var(--border)" };

/** Step 4: results for the active (purchased) assessment, the same for every use case. */
export default async function ResultsPage() {
  const { user, company, active } = await founderContext();
  if (!active || !company) redirect("/library");
  const def = active.def;
  const [state, choices] = await Promise.all([founderAssessment(company.id, def.id), figureChoices(company, assessmentMetrics(def, active.objective))]);
  const figures = (
    <FigureChecker
      choices={choices}
      choose={chooseFigureAction}
      enter={enterFigureAction}
      rerun={state.state === "building" ? null : <RunAssessmentButton label={state.state === "ready" ? "Re-run with these figures" : "Run the assessment"} primary />}
    />
  );

  if (state.state === "ready") {
    const next = def.nextUseCase ? getUseCase(def.nextUseCase) : undefined;
    await track("deliverable_viewed", { userId: user.id, companyId: company.id, props: { type: "assessment", use_case: def.id, version: state.view.version } });
    return (
      <AssessmentResults
        title={def.question}
        data={state.view}
        nextUseCase={next ? { href: `/library/${next.id}`, question: next.question } : null}
        advisory={<AdvisoryOffer kind={state.view.advisor} price={formatPrice(pricing().advisoryFromCents)} href={advisoryHref(def.id, state.view.advisor)} target={targetSummary(active.objective)} />}
        reviewHref={advisoryHref(def.id, "review")}
        figures={figures}
        actions={
          <div className="mt-3">
            <RunAssessmentButton label="Re-run with my latest data" />
          </div>
        }
        onSourceTrail={sourceTrailOpened}
      />
    );
  }

  const target = targetSummary(active.objective);
  return (
    <div className="p-4 sm:p-8 max-w-4xl space-y-6">
      <BuildingRefresh active={state.state === "building"} />
      <PageHeader eyebrow="Assessment results" title={def.question} subtitle="Your results appear here as soon as they're ready." />
      {figures}
      {state.state === "building" && (
        <div className="rounded-xl border p-6" style={card}>
          <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Analyzing your data</div>
          <AnalyzingDots label="Working through your answers and figures, then checking every number..." />
          <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Usually a few minutes. This page updates on its own.</p>
        </div>
      )}
      {state.state === "failed" && (
        <div className="rounded-xl border p-6 text-sm space-y-3" style={{ ...card, borderColor: "var(--amber)" }}>
          <p style={{ color: "var(--foreground)" }}>{state.reason}</p>
          <div className="flex items-center gap-4 flex-wrap">
            <RunAssessmentButton label="Run it again" primary />
            <a href={advisoryHref(def.id, "review")} className="text-sm font-semibold" style={{ color: "var(--green)" }}>Book time with an executive advisor →</a>
          </div>
        </div>
      )}
      {state.state === "not_started" && (
        <div className="rounded-xl border p-6 text-sm space-y-3" style={card}>
          <p style={{ color: "var(--foreground)" }}>Share the data this assessment needs, then press &ldquo;Analyze my data&rdquo;. Your results are built from your answers and data in a few minutes.</p>
          <Link href="/data" className="inline-block px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>Go to Data →</Link>
        </div>
      )}
      {target && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Your target: {target}</p>}
    </div>
  );
}
