import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, BarChart3, Check, CheckCircle2, Clock, FlaskConical, Repeat, Target, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { displayValue, getField } from "@/lib/intake";
import { positionTone, shortPosition } from "@/components/use-cases/PeerComparisonCard";
import { dataItemIcon, dataItemShort, OUTCOME_ICONS } from "@/components/visual/icons";
import { ExpandableDetail, MetricTile, StatusChip, signalIcon, TONE } from "@/components/visual/primitives";
import { visualFor } from "@/lib/use-cases/visual";
import { PeerComparisons } from "@/components/use-cases/PeerComparisons";
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
  watch: { label: "Worth investigating" },
  positive: { label: "Looks healthy" },
  info: { label: "Context" },
} as const;

const CHECKOUT_MESSAGE: Record<string, { text: string; color: string }> = {
  cancelled: { text: "Payment cancelled. Nothing was charged, and your answers are saved.", color: "var(--muted-foreground)" },
  failed: { text: "The payment didn't go through, so nothing was charged. You can try again.", color: "var(--red)" },
  pending: { text: "We're waiting for Stripe to confirm your payment. Refresh in a moment; your assessment opens as soon as it's confirmed.", color: "var(--amber)" },
};

/** Short tile labels for the founder's own answers on the Snapshot (exact or a range). */
const ANSWER_TILE: Record<string, { label: string; icon: typeof Users; format?: (v: string) => string }> = {
  "gtm.sales_reps": { label: "Sales reps (AEs)", icon: Users },
  "customers.sales_cycle": { label: "Sales cycle", icon: Clock, format: (v) => (/^\d+$/.test(v) ? `${v} days` : v) },
  "customers.acv": { label: "Average ACV", icon: Wallet, format: (v) => (/^[\d,]+$/.test(v) ? `$${v}` : v) },
  "customers.count": { label: "Customers", icon: Users },
  "customers.segment": { label: "Segment", icon: Target },
  "customers.gross_retention": { label: "Gross churn", icon: TrendingDown, format: (v) => (/^[\d.]+$/.test(v) ? `${v}%` : v) },
  "company.arr": { label: "Revenue", icon: BarChart3 },
  "company.growth": { label: "Growth", icon: TrendingUp },
  "customers.nrr": { label: "Retention", icon: Repeat },
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

  const counts = { watch: snapshot.signals.filter((x) => x.kind === "watch").length, positive: snapshot.signals.filter((x) => x.kind === "positive").length };
  // Tiles: the founder's own figures, coloured by where they sit against peers.
  const peerTiles = peers.filter((c) => c.company).slice(0, 3);
  const TILE_ICON = { growth: TrendingUp, retention: Repeat, revenue: BarChart3 } as const;
  const covered = new Set(peerTiles.map((c) => ({ growth: "company.growth", retention: "customers.nrr", revenue: "company.arr" })[c.key]));
  const answerTiles = def.snapshotProfile
    .filter((q) => !covered.has(`${q.section}.${q.field}`))
    .flatMap((q) => {
      const field = getField(q.section, q.field);
      const exact = answers[`${q.section}.${q.field}`];
      const range = answers[`${q.section}.${q.field}_range`];
      const value = exact !== null && exact !== undefined && exact !== "" ? displayValue(field!, exact) : range ? String(range) : null;
      const meta = ANSWER_TILE[`${q.section}.${q.field}`];
      return field && value && meta ? [{ key: `${q.section}.${q.field}`, label: meta.label, icon: meta.icon, value: meta.format ? meta.format(value) : value }] : [];
    })
    .slice(0, Math.max(0, 3 - peerTiles.length));
  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl">
      <Link href={`/library/${def.id}`} className="text-sm link inline-flex items-center gap-1">
        <ArrowLeft size={14} aria-hidden /> Edit your answers
      </Link>
      {message && (
        <p className="text-base mt-4" role="status" style={{ color: message.color }}>
          {message.text}
        </p>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem] gap-6 items-start mt-4">
        <div className="space-y-6 min-w-0">
          <header>
            <div className="label">Free Growth Snapshot · {def.shortTitle}</div>
            <h1 className="font-display text-3xl sm:text-4xl leading-tight mt-1" style={{ color: "var(--foreground)" }}>
              {def.question}
            </h1>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span data-label className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--amber-muted)", color: "#92400E" }} title={`Early signals from your answers${snapshot.answersOnly ? " (no figures yet)" : ""}, not conclusions. Nothing here has been checked against your own data yet.`}>
                <FlaskConical size={13} aria-hidden />
                <span>Hypotheses</span>
              </span>
              <span data-label className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                From your answers{snapshot.answersOnly ? " (no figures yet)" : ""} · not yet checked against your data
              </span>
            </div>
          </header>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {answerTiles.map((t) => (
              <MetricTile key={t.key} icon={t.icon} label={t.label} value={t.value} compare="Your answer" />
            ))}
            {peerTiles.map((c) => {
              const tone = c.status === "compared" || c.status === "reference" ? positionTone(c.position) : "neutral";
              const word = c.status === "compared" || c.status === "reference" ? shortPosition(c.position) : null;
              return <MetricTile key={c.key} icon={TILE_ICON[c.key]} label={c.title} value={c.company!.text} compare={word ?? undefined} tone={tone} trend={tone === "green" ? "up" : tone === "amber" ? "down" : undefined} />;
            })}
            <MetricTile icon={AlertTriangle} label="Worth investigating" value={String(counts.watch)} compare={counts.positive ? `${counts.positive} looking healthy` : undefined} tone={counts.positive ? "green" : "neutral"} />
          </div>

          <section aria-labelledby="signals">
            <h2 id="signals" className="text-xl font-semibold mb-3" style={{ color: "var(--foreground)" }}>
              What your answers suggest
            </h2>
            <ul className="grid md:grid-cols-2 gap-3">
              {snapshot.signals.map((x) => {
                const { icon: Icon, tone } = signalIcon(x.kind);
                return (
                  <li key={x.title} className="surface p-4 flex gap-3">
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: TONE[tone].bg, color: TONE[tone].fg }} aria-label={KIND[x.kind].label} role="img">
                      <Icon size={18} aria-hidden />
                    </span>
                    <div className="min-w-0 space-y-1.5">
                      <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {x.title}
                      </div>
                      <div data-label className="text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }}>
                        Based on: {x.basis}
                      </div>
                      <ExpandableDetail>
                        <p>{x.detail}</p>
                      </ExpandableDetail>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <PeerComparisons peers={peers} columns={3} />

          <div className="grid md:grid-cols-[1fr_1.6fr] gap-3">
            <section className="surface p-4 flex gap-3 items-start" aria-labelledby="fit">
              <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: snapshot.fit.good ? "var(--green-muted)" : "var(--blue-muted)", color: snapshot.fit.good ? "var(--green)" : "var(--blue)" }}>
                <Target size={20} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="fit" className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  Is this the right question?
                </h2>
                <div className="mt-1">{snapshot.fit.good ? <StatusChip status="positive" word="Good fit" /> : <StatusChip status="info" word="Another fits better" />}</div>
                <div className="mt-2">
                  <ExpandableDetail summary="Why">
                    <p>{snapshot.fit.note}</p>
                  </ExpandableDetail>
                </div>
                {suggested && (
                  <Link href={`/library/${suggested.id}`} className="inline-block mt-2 text-sm link">
                    Look at {suggested.shortTitle} →
                  </Link>
                )}
              </div>
            </section>

            <section className="surface p-4" aria-labelledby="confirm">
              <h2 id="confirm" className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>
                What it would take to confirm
              </h2>
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {snapshot.dataNeeded.map((d) => {
                  const item = getItem(d.key);
                  const Icon = dataItemIcon(d.key, item?.category);
                  return (
                    <li key={d.key} title={item?.name} className="relative rounded-xl p-3 flex flex-col items-center text-center gap-1.5" style={{ background: d.have ? "var(--green-muted)" : "var(--muted)" }}>
                      {d.have && <CheckCircle2 size={14} className="absolute top-1.5 right-1.5" style={{ color: "var(--green)" }} aria-label="already shared" />}
                      <Icon size={20} style={{ color: d.have ? "var(--green)" : "var(--muted-foreground)" }} aria-hidden />
                      <span className="text-xs font-semibold leading-tight" style={{ color: "var(--foreground)" }}>
                        {dataItemShort(d.key, item?.name ?? d.key)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <section className="surface p-4" aria-labelledby="how-we-work">
            <details className="group">
              <summary className="cursor-pointer list-none flex items-center gap-2">
                <span className="transition-transform group-open:rotate-90" style={{ color: "var(--green)" }} aria-hidden>
                  ›
                </span>
                <h2 id="how-we-work" className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  How we work with companies like yours
                </h2>
              </summary>
              <div className="mt-3 space-y-3 text-sm" style={{ color: "var(--muted-foreground)" }}>
                <p>{approach.audience}</p>
                <ul className="space-y-1.5" style={{ color: "var(--foreground)" }}>
                  {approach.approach.map((a) => (
                    <li key={a} className="flex gap-2">
                      <Check size={16} className="shrink-0 mt-0.5" style={{ color: "var(--green)" }} aria-hidden />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
                <div className="rounded-xl p-3" style={{ background: "var(--muted)" }}>
                  <p className="font-medium" style={{ color: "var(--foreground)" }}>
                    {approach.example.trigger}
                  </p>
                  <ol className="space-y-1 list-decimal pl-5 mt-1.5" style={{ color: "var(--foreground)" }}>
                    {approach.example.steps.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </details>
          </section>
        </div>

        <aside className="surface p-5 lg:sticky lg:top-6 space-y-3" style={{ borderColor: "var(--green)", borderWidth: 2 }} aria-label="Full assessment">
          <div className="label" style={{ color: "var(--green)" }}>
            Next: the full assessment
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl leading-tight" style={{ color: "var(--foreground)" }}>
              {def.shortTitle}
            </span>
            <span className="font-mono text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
              {sellableUseCases().includes(def.id) ? price : "Soon"}
            </span>
          </div>
          <ul className="grid grid-cols-3 gap-1.5" aria-label="What you get">
            {visualFor(def.id).outcomes.map((o) => {
              const Icon = OUTCOME_ICONS[o.icon];
              return (
                <li key={o.label} data-label className="rounded-lg p-2 flex flex-col items-center text-center gap-1 text-[11px] font-semibold leading-tight" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
                  <Icon size={16} aria-hidden />
                  {o.label}
                </li>
              );
            })}
          </ul>
          {row?.activatedAt ? (
            <Link href="/data" className="btn btn-primary btn-lg w-full">
              You have this assessment · continue →
            </Link>
          ) : sellable ? (
            <>
              <PurchaseButton useCaseId={def.id} label={`Get the full assessment · ${price}`} checkout={startAssessmentCheckout} />
              <p data-label className="text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
                One-time · Stripe · no subscription
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {sellableUseCases().includes(def.id) ? "Payments aren't set up in this environment yet." : "The full assessment for this question is launching soon. Your answers are saved, so you'll be ready when it does."}
            </p>
          )}
          <ExpandableDetail summary="Everything it includes">
            <p>Tests these hypotheses against your own data and gives you a decision and a 30–90 day plan.</p>
            <ul className="space-y-1">
              {def.youGet.map((g) => (
                <li key={g}>• {g}</li>
              ))}
            </ul>
            <p>Your assessment opens as soon as Stripe confirms the payment.</p>
          </ExpandableDetail>
        </aside>
      </div>
    </div>
  );
}
