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

const card = { background: "var(--card)", borderColor: "var(--border)" };

/** Step 2: what the assessment is, who it's for, what it costs, and the free questionnaire. Nothing here charges. */
export default async function UseCasePage({ params }: { params: Promise<{ useCase: string }> }) {
  const def = getUseCase((await params).useCase);
  if (!def) notFound();
  const { user, company, useCases } = await founderContext();
  const row = useCases.find((u) => u.useCase === def.id);
  const answers = company ? await getIntakeAnswers(company) : {};
  const { fields, known } = questionnaire(def, answers);
  const price = formatPrice(pricing().assessmentCents);
  const sellable = sellableUseCases().includes(def.id);
  if (company) await track("use_case_viewed", { userId: user.id, companyId: company.id, props: { use_case: def.id } });

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <Link href="/library" className="text-xs" style={{ color: "var(--muted-foreground)" }}>← Use Case Library</Link>
      <PageHeader eyebrow={def.shortTitle} title={def.question} subtitle={def.description} />

      {row?.activatedAt && (
        <div className="rounded-xl border p-4 mb-6 flex items-center gap-3 flex-wrap" style={{ ...card, borderColor: "var(--green)" }}>
          <span className="flex-1 text-sm" style={{ color: "var(--foreground)" }}>You have this assessment. Your answers below are saved and you can still edit them.</span>
          <Link href="/data" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>Continue your assessment →</Link>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 rounded-xl border p-5 sm:p-6 order-2 lg:order-1" style={card} aria-labelledby="questionnaire">
          <h2 id="questionnaire" className="text-lg font-semibold mb-1" style={{ color: "var(--foreground)" }}>Start with a few questions</h2>
          <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
            Free, and saved as you go. Your answers tell us whether this assessment fits and give you a first Growth Snapshot.
          </p>
          {known.length > 0 && (
            <p className="text-xs mb-5" style={{ color: "var(--muted-foreground)" }}>
              From your company profile: {known.map((k) => `${k.label} ${k.value}`).join(" · ")} · <Link href="/profile" style={{ color: "var(--green)" }}>edit</Link>
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
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Your company isn&apos;t set up yet.</p>
          )}
        </section>

        <aside className="space-y-6 order-1 lg:order-2">
          <div className="rounded-xl border p-5" style={card}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Who it&apos;s for</div>
            <p className="text-sm" style={{ color: "var(--foreground)" }}>{def.forWho}</p>
          </div>
          <div className="rounded-xl border p-5" style={card}>
            <div className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>What you&apos;ll receive</div>
            <ul className="text-sm space-y-1" style={{ color: "var(--muted-foreground)" }}>
              {def.youGet.map((g) => <li key={g}>• {g}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border p-5" style={card} aria-label="Pricing">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Full assessment</span>
              <span className="font-mono text-lg font-semibold" style={{ color: "var(--foreground)" }}>{sellable ? price : "Coming soon"}</span>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
              {sellable
                ? "One-time payment for this question. Self-service: built from your answers and data, no meeting required."
                : "The free Snapshot is available now; the full assessment for this question is launching soon."}
            </p>
            <div className="text-xs font-medium" style={{ color: "var(--green)" }}>Growth Snapshot: free</div>
          </div>
          <div className="rounded-xl border p-5" style={card}>
            <div className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>How it works</div>
            <HowItWorks price={price} sellable={sellable} />
          </div>
          <div className="rounded-xl border p-5" style={card}>
            <div className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>Data we may ask for</div>
            <DataNeeded useCase={def} />
          </div>
        </aside>
      </div>
    </div>
  );
}
