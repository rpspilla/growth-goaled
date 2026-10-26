import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PurchaseButton } from "@/components/use-cases/PurchaseButton";
import { founderContext } from "@/lib/data/founder-context";
import { getIntakeAnswers } from "@/lib/data/intake";
import { getReadiness } from "@/lib/data/readiness";
import { track } from "@/lib/events";
import { formatPrice, pricing, sellableUseCases } from "@/lib/pricing";
import { getItem } from "@/lib/readiness";
import { stripeConfigured } from "@/lib/stripe";
import { getUseCase, missingRequired } from "@/lib/use-cases";
import { howWeWork } from "@/lib/use-cases/how-we-work";
import { growthSnapshot } from "@/lib/use-cases/snapshot";
import { startAssessmentCheckout } from "../../actions";

const card = { background: "var(--card)", borderColor: "var(--border)" };
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
  const approach = howWeWork({ useCase: def.id, profile: answers, revenueBand: company.revenueBand });
  const suggested = snapshot.fit.suggested ? getUseCase(snapshot.fit.suggested) : undefined;
  const price = formatPrice(pricing().assessmentCents);
  const sellable = sellableUseCases().includes(def.id) && stripeConfigured();
  const message = checkout ? CHECKOUT_MESSAGE[checkout] : undefined;
  await track("snapshot_viewed", { userId: user.id, companyId: company.id, props: { use_case: def.id, signals: snapshot.signals.length } });

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <Link href={`/library/${def.id}`} className="text-xs" style={{ color: "var(--muted-foreground)" }}>← Edit your answers</Link>
      <PageHeader eyebrow={`Growth Snapshot · ${def.shortTitle}`} title={def.question} subtitle="A free first look based on what you've told us." />
      {message && <p className="text-sm mb-4" role="status" style={{ color: message.color }}>{message.text}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border p-4 text-sm flex gap-3 items-start" style={{ ...card, borderColor: "var(--amber)" }}>
            <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded shrink-0" style={{ background: "var(--amber-muted)", color: "var(--amber)" }}>Hypotheses</span>
            <span style={{ color: "var(--foreground)" }}>
              These are early signals from your answers{snapshot.answersOnly ? " (no figures yet)" : ""}, not conclusions. Nothing here has been checked against your data or compared with other companies.
            </span>
          </div>

          <section className="rounded-xl border p-5" style={{ ...card, borderColor: snapshot.fit.good ? "var(--border)" : "var(--blue)" }}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>Is this the right assessment?</h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{snapshot.fit.note}</p>
            {suggested && (
              <Link href={`/library/${suggested.id}`} className="inline-block mt-2 text-sm font-semibold" style={{ color: "var(--green)" }}>
                Look at {suggested.shortTitle} →
              </Link>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>What your answers suggest</h2>
            <ul className="space-y-3">
              {snapshot.signals.map((s) => (
                <li key={s.title} className="rounded-xl border p-4" style={card}>
                  <div className="text-xs font-semibold mb-1" style={{ color: KIND[s.kind].color }}>{KIND[s.kind].label}</div>
                  <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>{s.title}</div>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{s.detail}</p>
                  <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Based on: {s.basis}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border p-5" style={card} aria-labelledby="how-we-work">
            <h2 id="how-we-work" className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>How we work with companies like yours</h2>
            <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>{approach.audience}</p>
            <ul className="text-sm space-y-1.5 mb-5" style={{ color: "var(--foreground)" }}>
              {approach.approach.map((a) => (
                <li key={a} className="flex gap-2">
                  <span aria-hidden style={{ color: "var(--green)" }}>•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-lg p-4" style={{ background: "var(--muted)" }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--green)" }}>For example, after the assessment</div>
              <p className="text-sm font-medium mb-2" style={{ color: "var(--foreground)" }}>{approach.example.trigger}</p>
              <ol className="text-sm space-y-1.5 list-decimal pl-5" style={{ color: "var(--foreground)" }}>
                {approach.example.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </div>
          </section>

          <section className="rounded-xl border p-5" style={card}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>What it would take to confirm</h2>
            <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>The full assessment tests these against your own data. It needs at least:</p>
            <ul className="text-sm space-y-1">
              {snapshot.dataNeeded.map((d) => (
                <li key={d.key} style={{ color: "var(--foreground)" }}>
                  <span aria-hidden style={{ color: d.have ? "var(--green)" : "var(--muted-foreground)" }}>{d.have ? "✓ " : "○ "}</span>
                  {getItem(d.key)?.name ?? d.key}
                  {d.have && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}> · already shared</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border p-5 lg:sticky lg:top-6" style={{ ...card, borderColor: "var(--green)" }} aria-label="Full assessment">
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--green)" }}>Full assessment</div>
            <div className="font-display text-xl mb-1" style={{ color: "var(--foreground)" }}>{def.shortTitle}</div>
            <div className="font-mono text-2xl font-semibold mb-3" style={{ color: "var(--foreground)" }}>{sellableUseCases().includes(def.id) ? price : "Coming soon"}</div>
            <ul className="text-sm space-y-1 mb-4" style={{ color: "var(--muted-foreground)" }}>
              {def.youGet.map((g) => <li key={g}>• {g}</li>)}
            </ul>
            {row?.activatedAt ? (
              <Link href="/data" className="block text-center px-5 py-2.5 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
                You have this assessment · continue →
              </Link>
            ) : sellable ? (
              <>
                <PurchaseButton useCaseId={def.id} label={`Get the full assessment · ${price}`} checkout={startAssessmentCheckout} />
                <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>One-time payment through Stripe. Your assessment opens once Stripe confirms it.</p>
              </>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {sellableUseCases().includes(def.id)
                  ? "Payments aren't set up in this environment yet."
                  : "The full assessment for this question is launching soon. Your answers are saved, so you'll be ready when it does."}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
