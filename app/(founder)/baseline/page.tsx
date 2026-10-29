import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Database, Loader2, Mic, UserCheck } from "lucide-react";
import { TONE } from "@/components/visual/primitives";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { AnalyzingDots } from "@/components/readiness/DocumentCard";
import { AdvisoryOffer } from "@/components/use-cases/AdvisoryOffer";
import { RunAssessmentButton } from "@/components/use-cases/RunAssessmentButton";
import { AssessmentResults } from "@/components/views/AssessmentResults";
import { founderAssessment, salesCallCount } from "@/lib/data/assessments";
import { figureChoices } from "@/lib/data/figures";
import { FigureChecker } from "@/components/use-cases/FigureChecker";
import { founderContext } from "@/lib/data/founder-context";
import { dimensionViews } from "@/lib/data/dimensions";
import { track } from "@/lib/events";
import { advisoryHref, formatPrice, pricing } from "@/lib/pricing";
import { assessmentMetrics, getUseCase, targetSummary } from "@/lib/use-cases";
import { CommitPlanButton } from "@/components/progress/CommitPlanButton";
import { commitPlanAction } from "../progress/actions";
import { chooseFigureAction, enterFigureAction, sourceTrailOpened } from "./actions";

// The assessment is drafted after the action responds (next/server after()), within this budget.
export const maxDuration = 300;


/** Step 4: results for the active (purchased) assessment, the same for every use case. */
export default async function ResultsPage() {
  const { user, company, active } = await founderContext();
  if (!active || !company) redirect("/library");
  const def = active.def;
  const [state, choices] = await Promise.all([founderAssessment(company.id, def.id), figureChoices(company, assessmentMetrics(def, active.objective))]);
  const figures = (
    <FigureChecker
      key="figures"
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
        advisory={<AdvisoryOffer key="advisory" kind={state.view.advisor} price={formatPrice(pricing().advisoryFromCents)} href={advisoryHref(def.id, state.view.advisor)} target={targetSummary(active.objective)} />}
        reviewHref={advisoryHref(def.id, "review")}
        figures={figures}
        dimensions={await dimensionViews(company, def, "/data")}
        compareHref="/overview#peers"
        commit={<CommitPlanButton key="commit" committedAt={state.view.committedAt} commit={commitPlanAction.bind(null, state.view.deliverableId)} />}
        actions={
          <div key="actions" className="pt-1 space-y-3">
            {state.newerInReview && (
              <p className="rounded-lg px-4 py-3 text-base" role="status" style={{ background: "var(--blue-muted)", color: "var(--foreground)" }}>
                A newer version of this report is with an advisor for review. This is your latest reviewed report; you&apos;ll see the new one as soon as it&apos;s reviewed.
              </p>
            )}
            <RunAssessmentButton label="Re-run my report" />
          </div>
        }
        onSourceTrail={sourceTrailOpened}
      />
    );
  }

  const target = targetSummary(active.objective);
  const calls = state.state === "in_review" && def.salesCallsToPublish ? await salesCallCount(company) : 0;
  const STATUS = {
    building: { icon: Loader2, tone: "green" as const, title: "Analyzing your data", spin: true },
    failed: { icon: AlertTriangle, tone: "amber" as const, title: "The report didn't finish", spin: false },
    in_review: { icon: UserCheck, tone: "blue" as const, title: "Your report is with an advisor for review", spin: false },
    not_started: { icon: Database, tone: "neutral" as const, title: "Share your data, then run your report", spin: false },
  }[state.state];
  const Icon = STATUS.icon;
  return (
    <div className="px-4 sm:px-8 py-8 max-w-4xl space-y-6">
      <BuildingRefresh active={state.state === "building"} />
      <header>
        <div className="label">Results</div>
        <h1 className="font-display text-2xl sm:text-3xl mt-1" style={{ color: "var(--foreground)" }}>
          {def.question}
        </h1>
      </header>
      <section className="surface p-6 flex gap-5 items-start flex-wrap sm:flex-nowrap" style={{ borderColor: STATUS.tone === "neutral" ? undefined : TONE[STATUS.tone].fg }} aria-labelledby="results-status">
        <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: TONE[STATUS.tone].bg, color: TONE[STATUS.tone].fg }} aria-hidden>
          <Icon size={28} className={STATUS.spin ? "animate-spin" : undefined} />
        </span>
        <div className="flex-1 min-w-0 space-y-3">
          <h2 id="results-status" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
            {STATUS.title}
          </h2>
          {state.state === "building" && (
            <>
              <AnalyzingDots label="Working through your answers and figures, then checking every number..." />
              <p data-label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Usually a few minutes · this page updates on its own
              </p>
            </>
          )}
          {state.state === "failed" && (
            <>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {state.reason}
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                <RunAssessmentButton label="Run it again" primary />
                <a href={advisoryHref(def.id, "review")} className="link text-sm">
                  Book time with an executive advisor →
                </a>
              </div>
            </>
          )}
          {state.state === "in_review" && (
            <>
              {def.salesCallsToPublish ? (
                <div>
                  <div className="flex items-center gap-1" aria-hidden>
                    {Array.from({ length: def.salesCallsToPublish }, (_, i) => (
                      <span key={i} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: i < calls ? "var(--green)" : "var(--muted)", color: i < calls ? "#fff" : "var(--subtle-foreground)" }}>
                        <Mic size={15} />
                      </span>
                    ))}
                  </div>
                  <p className="text-sm mt-2" style={{ color: "var(--foreground)" }}>
                    <span className="font-semibold">
                      {calls} of {def.salesCallsToPublish} recorded sales calls.
                    </span>{" "}
                    Share {def.salesCallsToPublish} to skip the review.
                  </p>
                </div>
              ) : null}
              <details className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                <summary className="cursor-pointer font-semibold" style={{ color: "var(--green)" }}>
                  Why the review?
                </summary>
                <p className="mt-1">
                  {def.salesCallsToPublish
                    ? `Reports for this question publish straight away when at least ${def.salesCallsToPublish} recorded sales calls are shared. With fewer, an advisor checks the report first. You'll see it as soon as they've reviewed it. Rather not wait? Upload ${def.salesCallsToPublish} recorded sales calls (recordings or transcripts) on the Data step, then re-run your report.`
                    : "An advisor is checking it before it's shared. You'll see it as soon as they've reviewed it."}
                </p>
              </details>
              <Link href="/data" className="btn btn-primary">
                Go to Data →
              </Link>
            </>
          )}
          {state.state === "not_started" && (
            <>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Results are built from your answers and data in a few minutes.
              </p>
              <Link href="/data" className="btn btn-primary">
                Go to Data →
              </Link>
            </>
          )}
        </div>
      </section>
      {figures}
      {target && (
        <p data-label className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Your target: {target}
        </p>
      )}
    </div>
  );
}
