import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BenchmarkView } from "@/components/views/BenchmarkView";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { CompletionList } from "@/components/deliverables/CompletionList";
import { PayButton } from "@/components/deliverables/PayButton";
import { PreliminaryTrigger } from "@/components/deliverables/PreliminaryTrigger";
import { RebuildButton } from "@/components/deliverables/RebuildButton";
import { AnalyzingDots } from "@/components/readiness/DocumentCard";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { getDashboard } from "@/lib/data/dashboard";
import { confirmCheckout } from "@/lib/data/payments";
import { founderBenchmark } from "@/lib/data/preliminary";
import { track } from "@/lib/events";
import { BENCHMARK_PRICE_CENTS, formatPrice, stripeConfigured } from "@/lib/stripe";
import { sourceTrailOpened } from "./actions";

// The preliminary Benchmark is drafted after the action responds (next/server after()), within this budget.
export const maxDuration = 300;

const card = { background: "var(--card)", borderColor: "var(--border)" };

export default async function BenchmarkPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const user = await requireRole(["founder"]);
  let company = await getFounderCompany(user);
  const params = await searchParams;
  if (!company) return <div className="p-8 max-w-4xl"><PageHeader title="How do you compare?" subtitle="Your company isn't set up yet." /></div>;

  // Back from Stripe: confirm with Stripe directly in case the webhook hasn't arrived yet.
  let justPaid = false;
  if (params.checkout === "success" && params.session_id && !company.benchmarkUnlockedAt && stripeConfigured()) {
    justPaid = await confirmCheckout(company, params.session_id).catch(() => false);
    if (justPaid) company = (await getFounderCompany(user))!;
  }

  const state = await founderBenchmark(company);

  if (state.kind === "published") {
    const data = await getDashboard(company);
    await track("deliverable_viewed", { userId: user.id, companyId: company.id, props: { type: "benchmark" } });
    return <BenchmarkView data={state.view} companyName={company.name} scoreBreakdown={data.scoreBreakdown} onSourceTrail={sourceTrailOpened} />;
  }

  const price = formatPrice(BENCHMARK_PRICE_CENTS);

  if (state.view) {
    await track("deliverable_viewed", { userId: user.id, companyId: company.id, props: { type: "benchmark", preliminary: true } });
    return (
      <>
        <div className="px-8 pt-8 max-w-6xl">
          {justPaid && <p className="text-sm mb-3 font-medium" style={{ color: "var(--green)" }}>Payment received. Thanks, here&apos;s your benchmark.</p>}
          <div className="rounded-xl border p-4 text-sm flex items-start gap-3 flex-wrap" style={{ ...card, borderColor: "var(--amber)" }}>
            <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: "var(--amber-muted)", color: "var(--amber)" }}>Preliminary</span>
            <span className="flex-1" style={{ color: "var(--foreground)" }}>
              Built automatically from your data and approved benchmark sources. Not yet reviewed by your advisor. Figures marked &ldquo;from your file&rdquo; haven&apos;t been confirmed by you.
            </span>
            <RebuildButton />
          </div>
        </div>
        <BenchmarkView data={state.view} companyName={company.name} scoreBreakdown={null} onSourceTrail={sourceTrailOpened} />
        <div className="px-8 pb-10 max-w-6xl">
          <CompletionList steps={state.steps} />
        </div>
      </>
    );
  }

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <PreliminaryTrigger filesWorking={false} />
      <BuildingRefresh active={state.state === "building"} />
      <PageHeader title="How do you compare?" subtitle="Your benchmark against companies like yours, built from the data you've shared." />
      {params.checkout === "cancelled" && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Payment cancelled. You can unlock your benchmark any time.</p>}
      {params.checkout === "success" && !justPaid && !company.benchmarkUnlockedAt && (
        <p className="text-sm" style={{ color: "var(--amber)" }}>We&apos;re confirming your payment with Stripe. Refresh in a moment.</p>
      )}

      {state.state === "building" && (
        <div className="rounded-xl border p-6" style={card}>
          <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Building your preliminary benchmark</div>
          <AnalyzingDots label="Comparing your figures with your peer cohort and checking every number..." />
          <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Usually a minute or two. This page updates on its own.</p>
        </div>
      )}

      {state.state === "ready" && state.preview && (
        <div className="rounded-xl border p-6 grid md:grid-cols-5 gap-6" style={card}>
          <div className="md:col-span-3">
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--green)" }}>Your preliminary benchmark is ready</div>
            <div className="font-display text-2xl mb-2" style={{ color: "var(--foreground)" }}>
              {state.preview.metrics.length} {state.preview.metrics.length === 1 ? "metric" : "metrics"} compared with {state.preview.companyCount ? `${state.preview.companyCount} comparable companies` : state.preview.cohortName}
            </div>
            <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>Peer cohort: {state.preview.cohortName} · {state.preview.criteria}</p>
            <ul className="space-y-1.5 mb-4">
              {state.preview.metrics.map((m) => (
                <li key={m} className="text-sm flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                  <span aria-hidden>🔒</span> {m} <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>· your figure vs. median and top quartile</span>
                </li>
              ))}
              <li className="text-sm flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                <span aria-hidden>🔒</span> Key insight, strengths, watch areas and your first priority
              </li>
            </ul>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Preliminary: built automatically from your data and approved benchmark sources, before advisor review.
            </p>
          </div>
          <div className="md:col-span-2 flex flex-col justify-center">
            <PayButton price={price} disabled={!stripeConfigured()} />
          </div>
        </div>
      )}

      {state.state === "unavailable" && (
        <div className="rounded-xl border p-6 text-sm space-y-3" style={card}>
          <div style={{ color: "var(--foreground)" }}>{state.reason ?? "We can't build a preliminary benchmark yet."}</div>
          <RebuildButton label="Try again" />
        </div>
      )}

      {state.advisorInProgress && state.state !== "ready" && (
        <div className="rounded-xl border p-6 text-sm" style={{ ...card, color: "var(--foreground)" }}>
          Your advisor is preparing your full, reviewed benchmark. You&apos;ll see it here as soon as it&apos;s published. <Link href="/processing" style={{ color: "var(--green)" }}>See progress →</Link>
        </div>
      )}

      {state.state === "none" && !state.advisorInProgress && (
        <div className="rounded-xl border p-6 text-sm space-y-3" style={card}>
          <div style={{ color: "var(--foreground)" }}>
            Upload your data in <Link href="/readiness" style={{ color: "var(--green)" }}>Data Readiness</Link> and we&apos;ll build a preliminary benchmark right away.
          </div>
          <RebuildButton label="Build it now from what I've shared" />
        </div>
      )}

      <CompletionList steps={state.steps} />
    </div>
  );
}
