import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PeerComparisonCard } from "@/components/use-cases/PeerComparisonCard";
import { PurchaseButton } from "@/components/use-cases/PurchaseButton";
import { founderContext } from "@/lib/data/founder-context";
import { getIntakeAnswers } from "@/lib/data/intake";
import { snapshotPeers } from "@/lib/data/peers";
import { getReadiness } from "@/lib/data/readiness";
import { track } from "@/lib/events";
import { formatPrice, pricing, sellableUseCases } from "@/lib/pricing";
import { getItem } from "@/lib/readiness";
import { stripeConfigured } from "@/lib/stripe";
import { getUseCase, missingRequired } from "@/lib/use-cases";
import { howWeWork } from "@/lib/use-cases/how-we-work";
import { growthSnapshot } from "@/lib/use-cases/snapshot";
import { startAssessmentCheckout } from "../../actions";

const KIND = {
  watch: { label: "Worth investigating", color: "var(--amber)" },
  positive: { label: "Looks healthy", color: "var(--green)" },
  info: { label: "Context", color: "var(--blue)" },
} as const;

const CHECKOUT_MESSAGE: Record<string, { text: string; color: string }> = {
  cancelled: { text: "Payment cancelled. Nothing was charged, and your answers are saved.", color: "var(--muted-foreground)" },
  failed: { text: "The payment didn't go through, so nothing was charged. You can try again.", color: "var(--red)" },
  pending: { text: "We're waiting for Stripe to confirm your payment. Refresh in a moment; your assessment opens as soon as it's confirmed.", color: "var(--amber)" },
};

/** Step 4: the free Growth Snapshot, then the offer for the full assessment. */
export default async function SnapshotPage({ params, searchParams }: { params: Promise<{ useCase: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const [{ useCase: id }, { checkout }] = await Promise.all([params, searchParams]);
  const def = getUseCase(id);
  if (!def) notFound();
  if (def.comingSoon) redirect(`/library/${def.id}`);
  const { user, company, useCases } = await founderContext();
  if (!company) redirect(`/library/${def.id}`);
  const row = useCases.find((u) => u.useCase === def.id);
  const [answers, readiness] = await Promise.all([getIntakeAnswers(company), getReadiness(company)]);
  if (missingRequired(def, row?.objective, answers).length) redirect(`/library/${def.id}`);

  const snapshot = growthSnapshot({
    useCase: def,
    objective: row?.objective ?? {},
    profile: answers,
    dataStatus: Object.fromEntries(readiness.items.map((i) => [i.itemKey, i.status])),
  });
  const peers = await snapshotPeers(company, answers);
  const approach = howWeWork({ useCase: def.id, profile: answers, revenueBand: company.revenueBand });
  const suggestedDef = snapshot.fit.suggested ? getUseCase(snapshot.fit.suggested) : undefined;
  // Never point founders at a question they can't start yet.
  const suggested = suggestedDef?.comingSoon ? undefined : suggestedDef;
  const price = formatPrice(pricing().assessmentCents);
  const sellable = sellableUseCases().includes(def.id) && stripeConfigured();
  const message = checkout ? CHECKOUT_MESSAGE[checkout] : undefined;
  await track("snapshot_viewed", { userId: user.id, companyId: company.id, props: { use_case: def.id, signals: snapshot.signals.length } });

  const watch = snapshot.signals.filter((x) => x.kind === "watch").length;
  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl">
      <Link href={`/library/${def.id}`} className="text-sm link">← Edit your answers</Link>
      <div className="mt-4">
        <PageHeader
          eyebrow={`Your free Growth Snapshot · ${def.shortTitle}`}
          title={def.question}
          subtitle={watch ? `${watch} ${watch === 1 ? "thing looks" : "things look"} worth investigating, based on your answers.` : "A first look based on your answers."}
        />
      </div>
      {message && <p className="text-base mb-6 -mt-4" role="status" style={{ color: message.color }}>{message.text}</p>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_21rem] gap-8 items-start">
        <div className="space-y-8 min-w-0">
          <div className="flex gap-3 items-start rounded-xl px-4 py-3" style={{ background: "var(--amber-muted)" }} role="note">
            <span className="text-sm font-bold shrink-0" style={{ color: "#92400E" }}>Hypotheses</span>
            <span className="text-sm" style={{ color: "#78350F" }}>
              Early signals from your answers{snapshot.answersOnly ? " (no figures yet)" : ""}, not conclusions. Nothing here has been checked against your own data yet.
            </span>
          </div>

          <section aria-labelledby="signals">
            <h2 id="signals" className="text-xl sm:text-2xl font-semibold mb-4" style={{ color: "var(--foreground)" }}>What your answers suggest</h2>
            <ul className="space-y-4">
              {snapshot.signals.map((x) => (
                <li key={x.title} className="surface p-5" style={{ borderLeft: `4px solid ${KIND[x.kind].color}` }}>
                  <div className="text-sm font-semibold mb-1" style={{ color: KIND[x.kind].color }}>{KIND[x.kind].label}</div>
                  <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{x.title}</div>
                  <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>{x.detail}</p>
                  <p className="text-sm mt-3" style={{ color: "var(--muted-foreground)" }}>Based on: {x.basis}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="peers">
            <h2 id="peers" className="text-xl sm:text-2xl font-semibold" style={{ color: "var(--foreground)" }}>How you compare with peers</h2>
            <p className="text-base mt-1 mb-4" style={{ color: "var(--muted-foreground)" }}>
              Growth, retention and revenue against companies in your industry founded around the same time, from the same sources for every Snapshot. Where no data fits yet, we say so and show Growth Goaled's standard reference instead, labelled as an assumption. The band shows the bottom to top quartile; the line is the median.
            </p>
            <div className="space-y-4">
              {peers.map((c) => <PeerComparisonCard key={c.key} c={c} />)}
            </div>
          </section>

          <section className="surface surface-pad" style={{ borderColor: snapshot.fit.good ? undefined : "var(--blue)" }} aria-labelledby="fit">
            <h2 id="fit" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Is this the right question?</h2>
            <p className="text-base mt-1" style={{ color: "var(--muted-foreground)" }}>{snapshot.fit.note}</p>
            {suggested && <Link href={`/library/${suggested.id}`} className="inline-block mt-3 link">Look at {suggested.shortTitle} →</Link>}
          </section>

          <section className="surface surface-pad" aria-labelledby="confirm">
            <h2 id="confirm" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>What it would take to confirm</h2>
            <p className="text-base mt-1 mb-4" style={{ color: "var(--muted-foreground)" }}>The full assessment tests these against your own data. It needs at least:</p>
            <ul className="space-y-2">
              {snapshot.dataNeeded.map((d) => (
                <li key={d.key} className="flex items-center gap-3 text-base" style={{ color: "var(--foreground)" }}>
                  <span aria-hidden className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: d.have ? "var(--green)" : "var(--muted)", color: d.have ? "#fff" : "var(--muted-foreground)" }}>{d.have ? "✓" : ""}</span>
                  {getItem(d.key)?.name ?? d.key}
                  {d.have && <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>already shared</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="surface surface-pad" aria-labelledby="how-we-work">
            <h2 id="how-we-work" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>How we work with companies like yours</h2>
            <p className="text-base mt-1 mb-4" style={{ color: "var(--muted-foreground)" }}>{approach.audience}</p>
            <ul className="text-base space-y-2 mb-5" style={{ color: "var(--foreground)" }}>
              {approach.approach.map((a) => (
                <li key={a} className="flex gap-2.5"><span aria-hidden style={{ color: "var(--green)" }}>✓</span><span>{a}</span></li>
              ))}
            </ul>
            <details open className="disclosure rounded-xl p-4" style={{ background: "var(--muted)" }}>
              <summary className="text-base">For example, after the assessment</summary>
              <p className="text-base font-medium mt-3 mb-2" style={{ color: "var(--foreground)" }}>{approach.example.trigger}</p>
              <ol className="text-base space-y-1.5 list-decimal pl-5" style={{ color: "var(--foreground)" }}>
                {approach.example.steps.map((x) => <li key={x}>{x}</li>)}
              </ol>
            </details>
          </section>
        </div>

        <aside className="surface surface-pad lg:sticky lg:top-6" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 1px var(--green)" }} aria-label="Full assessment">
          <div className="label" style={{ color: "var(--green)" }}>Next step: the full assessment</div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="font-display text-2xl" style={{ color: "var(--foreground)" }}>{def.shortTitle}</span>
            <span className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>{sellableUseCases().includes(def.id) ? price : "Soon"}</span>
          </div>
          <p className="text-sm mt-2 mb-4" style={{ color: "var(--muted-foreground)" }}>Tests these hypotheses against your own data and gives you a decision and a 30–90 day plan.</p>
          <ul className="text-sm space-y-1.5 mb-5" style={{ color: "var(--foreground)" }}>
            {def.youGet.map((g) => (
              <li key={g} className="flex gap-2"><span aria-hidden style={{ color: "var(--green)" }}>✓</span><span>{g}</span></li>
            ))}
          </ul>
          {row?.activatedAt ? (
            <Link href="/data" className="btn btn-primary btn-lg w-full">You have this assessment · continue →</Link>
          ) : sellable ? (
            <>
              <PurchaseButton useCaseId={def.id} label={`Get the full assessment · ${price}`} checkout={startAssessmentCheckout} />
              <p className="text-sm mt-3" style={{ color: "var(--muted-foreground)" }}>One-time payment through Stripe. No subscription. Your assessment opens as soon as Stripe confirms it.</p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {sellableUseCases().includes(def.id) ? "Payments aren't set up in this environment yet." : "The full assessment for this question is launching soon. Your answers are saved, so you'll be ready when it does."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
