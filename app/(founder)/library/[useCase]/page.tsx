import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2 } from "lucide-react";
import { DataNeeded } from "@/components/use-cases/DataNeeded";
import { HowItWorks } from "@/components/use-cases/HowItWorks";
import { QuestionnaireForm } from "@/components/use-cases/QuestionnaireForm";
import { OUTCOME_ICONS } from "@/components/visual/icons";
import { DataTypeGrid, ResultsPreview, StepStrip } from "@/components/visual/journey";
import { ExpandableDetail, StatusChip } from "@/components/visual/primitives";
import { QuestionIllustration } from "@/components/visual/QuestionIllustration";
import { founderContext } from "@/lib/data/founder-context";
import { getIntakeAnswers } from "@/lib/data/intake";
import { track } from "@/lib/events";
import { formatPrice, pricing, sellableUseCases } from "@/lib/pricing";
import { getUseCase } from "@/lib/use-cases";
import { questionnaire } from "@/lib/use-cases/questionnaire";
import { visualFor } from "@/lib/use-cases/visual";
import { saveAnswer, submitQuestionnaire } from "../actions";

/** Step 2: the question, how it works and what you get as visuals, then the free questionnaire. Nothing here charges. */
export default async function UseCasePage({ params }: { params: Promise<{ useCase: string }> }) {
  const def = getUseCase((await params).useCase);
  if (!def) notFound();
  const { user, company, useCases } = await founderContext();
  const row = useCases.find((u) => u.useCase === def.id);
  const answers = company ? await getIntakeAnswers(company) : {};
  const { fields, known } = questionnaire(def, answers, company?.revenueBand ?? null);
  const price = formatPrice(pricing().assessmentCents);
  const sellable = sellableUseCases().includes(def.id);
  const v = visualFor(def.id);
  if (company) await track("use_case_viewed", { userId: user.id, companyId: company.id, props: { use_case: def.id, coming_soon: Boolean(def.comingSoon) } });

  const back = (
    <Link href="/library" className="text-sm link inline-flex items-center gap-1">
      <ArrowLeft size={14} aria-hidden /> All growth questions
    </Link>
  );
  const hero = (
    <div className="grid sm:grid-cols-[minmax(0,1fr)_14rem] gap-5 items-center mt-4 mb-6">
      <div>
        <div className="label mb-1">{def.shortTitle}</div>
        <h1 className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>
          {def.question}
        </h1>
        <p className="text-base mt-2" style={{ color: "var(--muted-foreground)" }}>
          {v.oneLine}
        </p>
        <ul className="flex flex-wrap gap-1.5 mt-3" aria-label="What you get">
          {v.outcomes.map((o) => {
            const Icon = OUTCOME_ICONS[o.icon];
            return (
              <li key={o.label} data-label className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
                <Icon size={13} aria-hidden />
                {o.label}
              </li>
            );
          })}
        </ul>
      </div>
      <QuestionIllustration id={def.id} muted={def.comingSoon} className="h-24 sm:h-36" />
    </div>
  );

  if (def.comingSoon) {
    return (
      <div className="px-4 sm:px-8 py-8 max-w-3xl">
        {back}
        {hero}
        <section className="surface surface-pad" aria-labelledby="soon">
          <div className="flex items-center gap-2">
            <StatusChip status="soon" />
          </div>
          <h2 id="soon" className="text-xl font-semibold mt-2" style={{ color: "var(--foreground)" }}>
            Coming soon
          </h2>
          <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>
            Not available to start or buy yet. When it launches, it will give you:
          </p>
          <ul className="text-base space-y-2 mt-4" style={{ color: "var(--foreground)" }}>
            {def.youGet.map((g) => (
              <li key={g} className="flex gap-2.5">
                <Check size={18} className="shrink-0 mt-1" style={{ color: "var(--muted-foreground)" }} aria-hidden />
                <span>{g}</span>
              </li>
            ))}
          </ul>
          <Link href="/library" className="btn btn-primary mt-6">
            See the questions available now →
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl">
      {back}
      {hero}

      <div className="surface p-4 sm:p-5 mb-6">
        <StepStrip price={sellable ? price : null} />
      </div>

      {row?.activatedAt && (
        <div className="surface p-4 mb-6 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--green)" }}>
          <CheckCircle2 size={20} style={{ color: "var(--green)" }} aria-hidden />
          <span className="flex-1 text-base font-semibold" style={{ color: "var(--foreground)" }}>
            You have this assessment.
          </span>
          <Link href="/data" className="btn btn-primary">
            Continue your assessment →
          </Link>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_21rem] gap-6 items-start">
        <section className="surface surface-pad" aria-labelledby="questionnaire">
          <h2 id="questionnaire" className="text-xl sm:text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            A few quick questions
          </h2>
          <p className="text-sm mt-1 mb-5" style={{ color: "var(--muted-foreground)" }}>
            Free. Saved as you go.
          </p>
          {known.length > 0 && (
            <div className="mb-5" aria-label="Already known from your profile">
              <div className="label mb-1.5">From your profile</div>
              <ul className="flex flex-wrap gap-1.5">
                {known.map((k) => (
                  <li key={k.label} data-label className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
                    <Check size={12} style={{ color: "var(--green)" }} aria-hidden />
                    <span style={{ color: "var(--muted-foreground)" }}>{k.label}</span> <span className="font-semibold">{k.value}</span>
                  </li>
                ))}
                <li>
                  <Link href="/profile" className="text-xs link px-1">
                    Edit
                  </Link>
                </li>
              </ul>
            </div>
          )}
          {company ? (
            <QuestionnaireForm useCaseId={def.id} fields={fields} initial={{ ...(row?.objective ?? {}) }} save={saveAnswer} submit={submitQuestionnaire} snapshotHref={`/library/${def.id}/snapshot`} />
          ) : (
            <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
              Your company isn&apos;t set up yet.
            </p>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="surface p-4" aria-labelledby="you-get">
            <h2 id="you-get" className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>
              What you&apos;ll get
            </h2>
            <ResultsPreview id={def.id} />
            <div className="mt-3">
              <ExpandableDetail summary="Everything in the full assessment">
                <p>
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>You&apos;ll decide: </span>
                  {def.decision}
                </p>
                <ul className="space-y-1">
                  {def.youGet.map((g) => (
                    <li key={g}>• {g}</li>
                  ))}
                </ul>
              </ExpandableDetail>
            </div>
          </section>

          <section className="surface p-4" aria-labelledby="data-ask">
            <h2 id="data-ask" className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>
              Data we may ask for
            </h2>
            <DataTypeGrid useCase={def} />
            <div className="mt-3">
              <ExpandableDetail summary="What each one is">
                <DataNeeded useCase={def} />
              </ExpandableDetail>
            </div>
          </section>

          <section className="surface p-4" aria-label="Pricing">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                Growth Snapshot
              </span>
              <span className="font-mono font-semibold" style={{ color: "var(--green)" }}>
                Free
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1.5">
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                Full assessment
              </span>
              <span className="font-mono font-semibold" style={{ color: "var(--foreground)" }}>
                {sellable ? price : "Soon"}
              </span>
            </div>
            <div className="mt-3">
              <ExpandableDetail summary="How it works">
                <p>
                  {sellable
                    ? "One-time, for this question. Built from your answers and data; no meeting needed. You decide after seeing the Snapshot."
                    : "The free Snapshot is available now; the full assessment for this question is launching soon."}
                </p>
                <HowItWorks price={price} sellable={sellable} />
              </ExpandableDetail>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
