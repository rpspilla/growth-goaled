import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { CohortForm } from "@/components/benchmarks/CohortForm";
import { ImportForm } from "@/components/benchmarks/ImportForm";
import { MetricActions } from "@/components/benchmarks/MetricActions";
import { ResearchPanel, type RunView } from "@/components/benchmarks/ResearchPanel";
import { card } from "@/components/benchmarks/ui";
import { requireRole } from "@/lib/auth/session";
import { describeCriteria } from "@/lib/benchmarks";
import { getCohort, latestResearchRun, listCohortMetrics, listCohorts, listSources, type MetricRow } from "@/lib/data/benchmarks";
import { formatMetric, isMetricKey, METRICS } from "@/lib/metrics";
import { changeMetricStatus, discardMetric, importCsv, researchCohort, saveCohort } from "./actions";

// Research runs after the action responds (next/server after()), within this budget.
export const maxDuration = 300;

const fmt = (metric: string, v: number | null) => (v === null ? "—" : isMetricKey(metric) ? formatMetric(metric, v) : String(v));
const STATUS_ORDER = ["proposed", "approved", "retired"] as const;
const STATUS_LABEL = { proposed: "Proposed (not used until approved)", approved: "Approved (used by agents)", retired: "Retired" };

function MetricsTable({ rows, readOnly }: { rows: MetricRow[]; readOnly: boolean }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={card}>
      <div className="grid grid-cols-12 px-4 py-2 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}>
        <div className="col-span-3">Metric</div>
        <div className="col-span-1 text-right">P25</div>
        <div className="col-span-1 text-right">Median</div>
        <div className="col-span-1 text-right">Top Q</div>
        <div className="col-span-1 text-right">n</div>
        <div className="col-span-3 pl-3">Source</div>
        <div className="col-span-2 text-right" />
      </div>
      {rows.map((m) => (
        <div key={m.id} className="grid grid-cols-12 items-center px-4 py-3 border-b text-sm" style={{ borderColor: "var(--border)" }}>
          <div className="col-span-3">
            <div className="font-medium" style={{ color: "var(--foreground)" }}>{isMetricKey(m.metric) ? METRICS[m.metric].label : m.metric}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {m.period ?? "No period"}
              {isMetricKey(m.metric) && METRICS[m.metric].lowerIsBetter && " · lower is better"}
            </div>
          </div>
          <div className="col-span-1 text-right font-mono text-xs" style={{ color: "var(--foreground)" }}>{fmt(m.metric, m.p25)}</div>
          <div className="col-span-1 text-right font-mono text-xs font-semibold" style={{ color: "var(--foreground)" }}>{fmt(m.metric, m.median)}</div>
          <div className="col-span-1 text-right font-mono text-xs" style={{ color: "var(--foreground)" }}>{fmt(m.metric, m.p75)}</div>
          <div className="col-span-1 text-right font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>{m.sampleSize ?? "—"}</div>
          <div className="col-span-3 pl-3 text-xs min-w-0" style={{ color: "var(--muted-foreground)" }}>
            {m.source ? (
              <>
                {m.source.url ? (
                  <a href={m.source.url} target="_blank" rel="noopener noreferrer" className="underline truncate block" style={{ color: "var(--foreground)" }}>{m.source.name}</a>
                ) : (
                  <span className="truncate block" style={{ color: "var(--foreground)" }}>{m.source.name}</span>
                )}
                <span className="capitalize">{m.source.type}</span>
                {m.source.year && ` · ${m.source.year}`}
              </>
            ) : (
              "No source"
            )}
          </div>
          <div className="col-span-2">
            <MetricActions id={m.id} status={m.status} readOnly={readOnly} change={changeMetricStatus} discard={discardMetric} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function BenchmarksPage({ searchParams }: { searchParams: Promise<{ cohort?: string; tab?: string }> }) {
  await requireRole(["advisor", "admin"]);
  const params = await searchParams;
  const [cohorts, sources] = await Promise.all([listCohorts(), params.tab === "sources" ? listSources() : null]);
  const selectedId = params.cohort && /^[0-9a-f-]{36}$/.test(params.cohort) ? params.cohort : null;
  const selected = selectedId ? await getCohort(selectedId) : null;
  const [metrics, run] = selected ? await Promise.all([listCohortMetrics(selected.id), latestResearchRun(selected.id)]) : [[], null];
  const runOutput = run?.output as { proposed?: number; rejected?: string[]; not_found?: string[] } | null | undefined;
  const runView: RunView = run
    ? { status: run.status, createdAt: run.createdAt.toISOString(), error: run.error, proposed: runOutput?.proposed ?? null, rejected: runOutput?.rejected ?? [], notFound: runOutput?.not_found ?? [] }
    : null;
  const tab = (active: boolean) => ({ background: active ? "var(--card)" : "transparent", color: active ? "var(--foreground)" : "var(--muted-foreground)" });

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader title="Benchmark Library" subtitle="Cohorts, sources and benchmark rows. Only approved rows are ever used by agents or shown to founders." />

      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: "var(--muted)", width: "fit-content" }}>
        <Link href="/advisor/benchmarks" className="px-4 py-2 rounded-md text-sm font-medium" style={tab(params.tab !== "sources")}>Cohorts</Link>
        <Link href="/advisor/benchmarks?tab=sources" className="px-4 py-2 rounded-md text-sm font-medium" style={tab(params.tab === "sources")}>Sources</Link>
      </div>

      {sources ? (
        <div className="rounded-xl border overflow-hidden" style={card}>
          {sources.length === 0 && <div className="p-6 text-sm" style={{ color: "var(--muted-foreground)" }}>No sources yet.</div>}
          {sources.map((s) => (
            <div key={s.id} className="px-5 py-4 border-b flex items-start gap-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.name}</a> : s.name}
                </div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  <span className="capitalize">{s.type}</span>
                  {s.publisher && ` · ${s.publisher}`}
                  {s.year && ` · ${s.year}`}
                  {s.licenceNote && ` · ${s.licenceNote}`}
                </div>
                {s.notes && <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{s.notes}</div>}
              </div>
              <div className="text-xs text-right" style={{ color: "var(--muted-foreground)" }}>
                <div className="font-mono" style={{ color: "var(--foreground)" }}>{s.approved}/{s.rows}</div>
                rows approved
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-xl border overflow-hidden" style={card}>
              {cohorts.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>No cohorts yet.</div>}
              {cohorts.map((c) => (
                <Link
                  key={c.id}
                  href={`/advisor/benchmarks?cohort=${c.id}`}
                  className="block px-4 py-3 border-b"
                  style={{ borderColor: "var(--border)", background: c.id === selected?.id ? "var(--muted)" : undefined }}
                >
                  <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                    {c.name}
                    {c.isSample && <span className="ml-2 text-xs font-normal" style={{ color: "var(--amber)" }}>sample</span>}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{describeCriteria(c.criteria)}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    {c.approved} approved{c.proposed > 0 && <span style={{ color: "var(--amber)" }}> · {c.proposed} to review</span>}
                  </div>
                </Link>
              ))}
            </div>
            <CohortForm action={saveCohort} />
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!selected ? (
              <div className="rounded-xl border p-6 text-sm" style={{ ...card, color: "var(--muted-foreground)" }}>Choose a cohort, or create one, to manage its benchmark rows.</div>
            ) : (
              <>
                {selected.isSample ? (
                  <div className="rounded-xl border p-4 text-sm" style={{ ...card, color: "var(--muted-foreground)" }}>
                    This is the illustrative cohort for the sample company. It&apos;s never matched to real companies and can&apos;t be edited.
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    <CohortForm key={selected.id} cohort={selected} action={saveCohort} />
                    <div className="space-y-4">
                      <ResearchPanel cohortId={selected.id} run={runView} research={researchCohort} />
                      <ImportForm cohortId={selected.id} action={importCsv} />
                    </div>
                  </div>
                )}
                {STATUS_ORDER.map((s) => {
                  const rows = metrics.filter((m) => m.status === s);
                  if (!rows.length) return null;
                  return (
                    <section key={s}>
                      <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>{STATUS_LABEL[s]} · {rows.length}</h2>
                      <MetricsTable rows={rows} readOnly={selected.isSample} />
                    </section>
                  );
                })}
                {metrics.length === 0 && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No benchmark rows yet. Research public data or import a CSV.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
