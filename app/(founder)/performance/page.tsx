import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { Sparkline } from "@/components/ui/Sparkline";
import { founderContext } from "@/lib/data/founder-context";
import { companyPerformance } from "@/lib/data/performance";
import { formatMetric, METRICS } from "@/lib/metrics";
import { monthLabel } from "@/lib/metrics-engine/tables";
import { METRIC_GROUPS, WHY } from "@/lib/performance";

/** Company performance: the company's own figures by category, with why each matters and where it came from. */
export default async function PerformancePage() {
  const { company, active } = await founderContext();
  const perf = company ? await companyPerformance(company) : null;
  const total = perf?.metrics.size ?? 0;
  const addData = active ? { href: "/data", label: "Share data" } : { href: "/library", label: "Pick a growth question" };

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl space-y-12">
      <PageHeader
        title="Company performance"
        subtitle="Your own figures, grouped by what they tell you. Calculated from your files where possible; nothing here is compared with other companies."
      />
      {total === 0 ? (
        <EmptyState
          title="No figures yet"
          body="Figures appear as you answer a growth question's survey and share data. Spreadsheets of revenue, deals or finances are calculated automatically."
          action={<Link href={addData.href} className="btn btn-primary">{addData.label} →</Link>}
        />
      ) : (
        <>
          {perf?.monthly && (
            <section className="surface surface-pad -mt-4" aria-label="Monthly recurring revenue">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Monthly recurring revenue</h2>
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Calculated from {perf.monthly.filename}</span>
              </div>
              <div className="mt-4"><Sparkline values={perf.monthly.points.map((p) => p.mrr)} label="Monthly recurring revenue by month" width={800} height={90} /></div>
              <div className="flex justify-between text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
                <span>{monthLabel(perf.monthly.points[0]!.month)}: {formatMetric("arr", perf.monthly.points[0]!.mrr)}</span>
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>{monthLabel(perf.monthly.points.at(-1)!.month)}: {formatMetric("arr", perf.monthly.points.at(-1)!.mrr)}</span>
              </div>
            </section>
          )}
          {METRIC_GROUPS.map((g) => {
            const have = g.metrics.filter((m) => perf!.metrics.has(m));
            const missing = g.metrics.filter((m) => !perf!.metrics.has(m));
            return (
              <Section key={g.id} id={`group-${g.id}`} title={g.title} lead={g.lead}>
                {have.length ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {have.map((m) => <MetricCard key={m} m={perf!.metrics.get(m)!} why={WHY[m]} />)}
                  </div>
                ) : (
                  <p className="surface p-5 text-base" style={{ color: "var(--muted-foreground)" }}>
                    Nothing tracked here yet. <Link href={addData.href} className="link">{addData.label}</Link> to add {missing.slice(0, 3).map((m) => METRICS[m].label).join(", ")}.
                  </p>
                )}
                {have.length > 0 && missing.length > 0 && (
                  <p className="text-sm mt-3" style={{ color: "var(--muted-foreground)" }}>Not tracked yet: {missing.map((m) => METRICS[m].label).join(", ")}.</p>
                )}
              </Section>
            );
          })}
        </>
      )}
    </div>
  );
}
