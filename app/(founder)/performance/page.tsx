import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CurrentPlanCard } from "@/components/plan/CurrentPlanCard";
import { BusinessUpdateForm } from "@/components/performance/BusinessUpdateForm";
import { InboxDropzone } from "@/components/readiness/InboxDropzone";
import { MetricCard } from "@/components/ui/MetricCard";
import { Section } from "@/components/ui/Section";
import { Sparkline } from "@/components/ui/Sparkline";
import { BUSINESS_METRICS, businessMetrics, type BusinessKey, type Reading } from "@/lib/data/business-metrics";
import { currentPlan } from "@/lib/data/current-plan";
import { listDataRequests } from "@/lib/data/data-requests";
import { companyBlobPrefix } from "@/lib/data/documents";
import { founderContext } from "@/lib/data/founder-context";
import { companyPerformance } from "@/lib/data/performance";
import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import { monthLabel } from "@/lib/metrics-engine/tables";
import { METRIC_GROUPS, WHY } from "@/lib/performance";
import { addBusinessUpdateAction } from "./actions";

const KEYS = Object.keys(BUSINESS_METRICS) as BusinessKey[];
const when = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmt = (r: Pick<Reading, "metric" | "value">) => formatMetric(r.metric as MetricKey, r.value);
const sub = (k: BusinessKey, r: Reading) => (k === "revenue" ? `ARR · about ${formatMetric("arr", r.value / 12)} a month` : METRICS[r.metric as MetricKey].label);

/**
 * Company performance: (i) progress on the plan with the advisor and (ii) the business numbers
 * (revenue, month-over-month growth, retention), each kept with the date it arrived so changes show.
 * New files drop straight in here; an advisor's data request links to the upload area.
 */
export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const [{ company }, { request }] = await Promise.all([founderContext(), searchParams]);
  if (!company) return null;
  const [current, biz, perf, requests] = await Promise.all([currentPlan(company), businessMetrics(company), companyPerformance(company), listDataRequests(company.id, { open: true })]);
  const others = METRIC_GROUPS.map((g) => ({ ...g, have: g.metrics.filter((m) => perf.metrics.has(m) && !["arr", "mom_growth", "nrr", "grr"].includes(m)) })).filter((g) => g.have.length);
  const month = new Date().toISOString().slice(0, 7);

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl space-y-12">
      <PageHeader title="Company performance" subtitle="Progress on your plan and your business numbers. Every update is kept with the date it arrived, so you can see what changed." />

      {requests.length > 0 && (
        <section aria-label="Your advisor asked for an update" className="surface p-5 -mt-4 space-y-2" style={{ background: "var(--amber-muted)", borderColor: "var(--amber)" }}>
          <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--foreground)" }}>
            <Inbox size={18} aria-hidden /> {requests[0]!.requestedBy ?? "Your advisor"} asked for an update
          </div>
          {requests.map((r) => (
            <div key={r.id} className={`text-base ${r.id === request ? "font-medium" : ""}`} style={{ color: "var(--foreground)" }}>
              {r.items.length > 0 && <ul className="list-disc pl-5">{r.items.map((i) => <li key={i}>{i}</li>)}</ul>}
              {r.message && <p className="italic mt-1" style={{ color: "var(--muted-foreground)" }}>&ldquo;{r.message}&rdquo;</p>}
            </div>
          ))}
          <a href="#upload" className="link text-sm">Drop the files below ↓</a>
        </section>
      )}

      <Section id="plan-progress" title="Action plan progress">
        <CurrentPlanCard current={current} heading="Current plan with your advisor" />
      </Section>

      <Section id="business" title="Business metrics" lead="Revenue, month-over-month growth and retention. They update each time new data arrives, from your files or typed in below.">
        <div className="grid sm:grid-cols-3 gap-4">
          {KEYS.map((k) => {
            const r = biz.latest[k];
            return (
              <div key={k} className="surface p-5" aria-label={BUSINESS_METRICS[k].label}>
                <div className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>{BUSINESS_METRICS[k].label}</div>
                {r ? (
                  <>
                    <div className="font-mono text-3xl font-semibold mt-1" style={{ color: "var(--foreground)" }}>{fmt(r)}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{sub(k, r)}{r.period ? ` · ${r.period}` : ""}</div>
                    {r.previous && (
                      <div className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
                        Was {fmt(r.previous)} on {when(r.previous.at)}
                      </div>
                    )}
                    <div className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Updated {when(r.at)} · {r.source}{r.confirmed ? "" : " · not yet checked"}</div>
                  </>
                ) : (
                  <p className="text-base mt-2" style={{ color: "var(--muted-foreground)" }}>No figure yet. Share a file or add an update below.</p>
                )}
              </div>
            );
          })}
        </div>
        {perf.monthly && (
          <div className="surface p-5 mt-4" aria-label="Monthly recurring revenue">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>Monthly recurring revenue</span>
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Calculated from {perf.monthly.filename}</span>
            </div>
            <div className="mt-3"><Sparkline values={perf.monthly.points.map((p) => p.mrr)} label="Monthly recurring revenue by month" width={800} height={70} /></div>
            <div className="flex justify-between text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
              <span>{monthLabel(perf.monthly.points[0]!.month)}: {formatMetric("arr", perf.monthly.points[0]!.mrr)}</span>
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>{monthLabel(perf.monthly.points.at(-1)!.month)}: {formatMetric("arr", perf.monthly.points.at(-1)!.mrr)}</span>
            </div>
          </div>
        )}
        <div className="surface p-5 mt-4 space-y-3">
          <h3 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Add an update</h3>
          <BusinessUpdateForm save={addBusinessUpdateAction} month={month} />
        </div>
        <div className="mt-4">
          <h3 className="text-base font-semibold mb-2" style={{ color: "var(--foreground)" }}>Update history</h3>
          {biz.updates.length ? (
            <ol aria-label="Update history" className="surface divide-y" style={{ borderColor: "var(--border)" }}>
              {biz.updates.map((u) => (
                <li key={u.key} className="p-4 flex gap-4 flex-wrap items-baseline" style={{ borderColor: "var(--border)" }}>
                  <time className="text-sm font-semibold w-28 shrink-0" style={{ color: "var(--foreground)" }} dateTime={u.at.toISOString()}>{when(u.at)}</time>
                  <span className="text-sm flex-1 min-w-[10rem]" style={{ color: "var(--muted-foreground)" }}>{u.source}</span>
                  <span className="text-sm flex gap-4 flex-wrap" style={{ color: "var(--foreground)" }}>
                    {KEYS.filter((k) => u.values[k]).map((k) => (
                      <span key={k}>{BUSINESS_METRICS[k].label}: <span className="font-mono font-semibold">{fmt(u.values[k]!)}</span></span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="surface p-4 text-base" style={{ color: "var(--muted-foreground)" }}>No updates yet. Each file you share or update you add shows here with its date.</p>
          )}
        </div>
      </Section>

      <section id="upload" aria-label="Share new data" className="scroll-mt-24 space-y-3">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>Share new data</h2>
          <p className="text-base" style={{ color: "var(--muted-foreground)" }}>Drag and drop anything: revenue exports, financial models, CRM reports, board decks. Figures are read automatically and every file is kept in <Link href="/documents" className="link">Documents</Link>.</p>
        </div>
        <InboxDropzone blobPrefix={companyBlobPrefix(company.id)} />
      </section>

      {others.length > 0 && (
        <Section id="other" title="Other figures" lead="Everything else on file, grouped by what it tells you.">
          <div className="space-y-8">
            {others.map((g) => (
              <div key={g.id}>
                <h3 className="text-base font-semibold mb-3" style={{ color: "var(--foreground)" }}>{g.title}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {g.have.map((m) => <MetricCard key={m} m={perf.metrics.get(m)!} why={WHY[m]} />)}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
