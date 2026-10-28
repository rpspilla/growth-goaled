import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { DataNeeded } from "@/components/use-cases/DataNeeded";
import { HowItWorks } from "@/components/use-cases/HowItWorks";
import { QuestionnaireForm } from "@/components/use-cases/QuestionnaireForm";
import { founderContext } from "@/lib/data/founder-context";
import { getIntakeAnswers } from "@/lib/data/intake";
import { track } from "@/lib/events";
import { formatPrice, pricing, sellableUseCases } from "@/lib/pricing";
import { getUseCase } from "@/lib/use-cases";
import { questionnaire } from "@/lib/use-cases/questionnaire";
import { saveAnswer, submitQuestionnaire } from "../actions";

/** Step 2: what the assessment is, who it's for, what it costs, and the free questionnaire. Nothing here charges. */
export default async function UseCasePage({ params }: { params: Promise<{ useCase: string }> }) {
  const def = getUseCase((await params).useCase);
  if (!def) notFound();
  const { user, company, useCases } = await founderContext();
  const row = useCases.find((u) => u.useCase === def.id);
  const answers = company ? await getIntakeAnswers(company) : {};
  const { fields, known } = questionnaire(def, answers, company?.revenueBand ?? null);
  const price = formatPrice(pricing().assessmentCents);
  const sellable = sellableUseCases().includes(def.id);
  if (company) await track("use_case_viewed", { userId: user.id, companyId: company.id, props: { use_case: def.id, coming_soon: Boolean(def.comingSoon) } });

  if (def.comingSoon) {
    return (
      <div className="px-4 sm:px-8 py-8 max-w-3xl">
        <Link href="/library" className="text-sm link">← All growth questions</Link>
        <div className="mt-4">
          <PageHeader eyebrow={`${def.shortTitle} · Coming soon`} title={def.question} subtitle={def.description} />
        </div>
        <section className="surface surface-pad" aria-labelledby="soon">
          <h2 id="soon" className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>Coming soon</h2>
          <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>This isn&apos;t available to start or buy yet. When it launches, it will give you:</p>
          <ul className="text-base space-y-2 mt-4" style={{ color: "var(--foreground)" }}>
            {def.youGet.map((g) => (
              <li key={g} className="flex gap-2.5"><span aria-hidden style={{ color: "var(--muted-foreground)" }}>•</span><span>{g}</span></li>
            ))}
          </ul>
          <Link href="/library" className="btn btn-primary mt-6">See the questions available now →</Link>
        </section>
      </div>
    );
  }

  const journey = ["Answer a few questions", "See your free Snapshot", `Full assessment from your data${sellable ? ` · ${price}` : ""}`];
  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl">
      <Link href="/library" className="text-sm link">← All growth questions</Link>
      <div className="mt-4">
        <PageHeader eyebrow={def.shortTitle} title={def.question} subtitle={def.description} />
      </div>

      <ol className="flex flex-wrap gap-x-6 gap-y-2 -mt-3 mb-8 text-sm" aria-label="How this works">
        {journey.map((step, i) => (
          <li key={step} className="flex items-center gap-2" aria-current={i === 0 && !row?.activatedAt ? "step" : undefined}>
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: i === 0 ? "var(--green)" : "var(--muted)", color: i === 0 ? "#fff" : "var(--muted-foreground)" }}>{i + 1}</span>
            <span style={{ color: i === 0 ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: i === 0 ? 600 : 400 }}>{step}</span>
            {i === 2 && <span style={{ color: "var(--muted-foreground)" }}>(optional)</span>}
          </li>
        ))}
      </ol>

      {row?.activatedAt && (
        <div className="surface p-5 mb-6 flex items-center gap-4 flex-wrap" style={{ borderColor: "var(--green)" }}>
          <span className="flex-1 text-base" style={{ color: "var(--foreground)" }}>You have this assessment. Your answers are saved and you can still edit them.</span>
          <Link href="/data" className="btn btn-primary">Continue your assessment →</Link>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-8 items-start">
        <section className="surface surface-pad" aria-labelledby="questionnaire">
          <h2 id="questionnaire" className="text-xl sm:text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Start with a few questions</h2>
          <p className="text-base mt-1 mb-6" style={{ color: "var(--muted-foreground)" }}>Free and saved as you go. Your answers produce your Growth Snapshot and tell us whether this is the right question.</p>
          {known.length > 0 && (
            <p className="text-sm mb-6 rounded-lg px-4 py-3" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              Already known from your profile: {known.map((k) => `${k.label} ${k.value}`).join(" · ")} · <Link href="/profile" className="link">edit</Link>
            </p>
          )}
          {company ? (
            <QuestionnaireForm
              useCaseId={def.id}
              fields={fields}
              initial={{ ...(row?.objective ?? {}) }}
              save={saveAnswer}
              submit={submitQuestionnaire}
              snapshotHref={`/library/${def.id}/snapshot`}
            />
          ) : (
            <p className="text-base" style={{ color: "var(--muted-foreground)" }}>Your company isn&apos;t set up yet.</p>
          )}
        </section>

        <aside className="surface surface-pad space-y-6 lg:sticky lg:top-6">
          <div>
            <div className="label mb-1">You&apos;ll decide</div>
            <p className="text-base" style={{ color: "var(--foreground)" }}>{def.decision}</p>
          </div>
          <div>
            <div className="label mb-2">The full assessment gives you</div>
            <ul className="text-sm space-y-1.5" style={{ color: "var(--foreground)" }}>
              {def.youGet.map((g) => (
                <li key={g} className="flex gap-2"><span style={{ color: "var(--green)" }} aria-hidden>✓</span><span>{g}</span></li>
              ))}
            </ul>
          </div>
          <div className="pt-5 border-t" style={{ borderColor: "var(--border)" }} aria-label="Pricing">
            <div className="flex items-baseline justify-between">
              <span className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Growth Snapshot</span>
              <span className="text-base font-semibold" style={{ color: "var(--green)" }}>Free</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Full assessment</span>
              <span className="text-base font-semibold" style={{ color: "var(--foreground)" }}>{sellable ? price : "Coming soon"}</span>
            </div>
            <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
              {sellable ? "One-time, for this question. Built from your answers and data; no meeting needed. You decide after seeing the Snapshot." : "The free Snapshot is available now; the full assessment for this question is launching soon."}
            </p>
          </div>
          <details className="disclosure pt-5 border-t" style={{ borderColor: "var(--border)" }}>
            <summary className="text-sm">How it works</summary>
            <div className="mt-3"><HowItWorks price={price} sellable={sellable} /></div>
          </details>
          <details className="disclosure">
            <summary className="text-sm">Data we may ask for</summary>
            <div className="mt-3"><DataNeeded useCase={def} /></div>
          </details>
        </aside>
      </div>
    </div>
  );
}
