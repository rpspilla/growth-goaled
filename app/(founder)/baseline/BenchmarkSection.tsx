import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BenchmarkView } from "@/components/views/BenchmarkView";
import { BuildingRefresh } from "@/components/deliverables/BuildingRefresh";
import { CompletionList } from "@/components/deliverables/CompletionList";
import { PreliminaryTrigger } from "@/components/deliverables/PreliminaryTrigger";
import { RebuildButton } from "@/components/deliverables/RebuildButton";
import { AnalyzingDots } from "@/components/readiness/DocumentCard";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { getDashboard } from "@/lib/data/dashboard";
import { founderBenchmark } from "@/lib/data/preliminary";
import { track } from "@/lib/events";
import { sourceTrailOpened } from "./actions";

const card = { background: "var(--card)", borderColor: "var(--border)" };

/**
 * Growth Leak's interim baseline: the Phase 1 benchmark (preliminary, then advisor-approved).
 * Shown only once Growth Leak is active; replaced by the use case baseline in U3.
 */
export async function BenchmarkSection() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (!company) return <div className="p-8 max-w-4xl"><PageHeader title="How do you compare?" subtitle="Your company isn't set up yet." /></div>;

  const state = await founderBenchmark(company);

  if (state.kind === "published") {
    const data = await getDashboard(company);
    await track("deliverable_viewed", { userId: user.id, companyId: company.id, props: { type: "benchmark" } });
    return <BenchmarkView data={state.view} companyName={company.name} scoreBreakdown={data.scoreBreakdown} onSourceTrail={sourceTrailOpened} />;
  }

  if (state.view) {
    await track("deliverable_viewed", { userId: user.id, companyId: company.id, props: { type: "benchmark", preliminary: true } });
    return (
      <>
        <div className="px-8 pt-8 max-w-6xl">
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

      {state.state === "building" && (
        <div className="rounded-xl border p-6" style={card}>
          <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Building your preliminary benchmark</div>
          <AnalyzingDots label="Comparing your figures with your peer cohort and checking every number..." />
          <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Usually a minute or two. This page updates on its own.</p>
        </div>
      )}

      {state.state === "unavailable" && (
        <div className="rounded-xl border p-6 text-sm space-y-3" style={card}>
          <div style={{ color: "var(--foreground)" }}>{state.reason ?? "We can't build a preliminary benchmark yet."}</div>
          <RebuildButton label="Try again" />
        </div>
      )}

      {state.advisorInProgress && (
        <div className="rounded-xl border p-6 text-sm" style={{ ...card, color: "var(--foreground)" }}>
          Your advisor is preparing your full, reviewed benchmark. You&apos;ll see it here as soon as it&apos;s published. <Link href="/processing" style={{ color: "var(--green)" }}>See progress →</Link>
        </div>
      )}

      {state.state === "none" && !state.advisorInProgress && (
        <div className="rounded-xl border p-6 text-sm space-y-3" style={card}>
          <div style={{ color: "var(--foreground)" }}>
            Upload your data in <Link href="/data" style={{ color: "var(--green)" }}>Data Readiness</Link> and we&apos;ll build a preliminary benchmark right away.
          </div>
          <RebuildButton label="Build it now from what I've shared" />
        </div>
      )}

      <CompletionList steps={state.steps} />
    </div>
  );
}
