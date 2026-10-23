import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BenchmarkView } from "@/components/views/BenchmarkView";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { getDashboard } from "@/lib/data/dashboard";
import { founderBenchmarkStatus } from "@/lib/data/deliverables";
import { track } from "@/lib/events";
import { sourceTrailOpened } from "./actions";

export default async function BenchmarkPage() {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  // getDashboard only returns a *published* benchmark, so founders never see drafts.
  const data = company ? await getDashboard(company) : null;
  if (!company || !data?.benchmark) {
    const status = company ? await founderBenchmarkStatus(company.id) : null;
    const started = status && status.status !== "none";
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="How do you compare?" subtitle="Your benchmark appears here once your advisor has reviewed and published it." />
        <div className="rounded-xl border p-6 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          {started ? (
            <>
              Your benchmark is being prepared. <Link href="/processing" style={{ color: "var(--green)" }}>See progress →</Link>
            </>
          ) : (
            <>
              It starts when you send your data to your advisor from <Link href="/readiness" style={{ color: "var(--green)" }}>Data Readiness</Link>.
            </>
          )}
        </div>
      </div>
    );
  }
  await track("deliverable_viewed", { userId: user.id, companyId: company.id, props: { type: "benchmark" } });
  return <BenchmarkView data={data.benchmark} companyName={company.name} scoreBreakdown={data.scoreBreakdown} onSourceTrail={sourceTrailOpened} />;
}
