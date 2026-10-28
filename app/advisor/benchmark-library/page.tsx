import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { card, inputClass, inputStyle, primary, secondary } from "@/components/benchmarks/ui";
import { requireRole } from "@/lib/auth/session";
import { STAGES } from "@/lib/benchmark-library/records";
import { libraryOverview, listDatasets, listSources, type DatasetFilters } from "@/lib/data/benchmark-library";
import { isMetricKey, METRICS } from "@/lib/metrics";

const date = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const STATUS: Record<string, { label: string; color: string }> = {
  published: { label: "Published", color: "var(--green)" },
  validated: { label: "Validated", color: "var(--amber)" },
  draft: { label: "Draft", color: "var(--muted-foreground)" },
  archived: { label: "Archived", color: "var(--muted-foreground)" },
};
const metricName = (m: string) => (isMetricKey(m) ? METRICS[m].label : m);

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl border p-4" style={card}>
      <div className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="text-2xl font-semibold mt-1" style={{ color: "var(--foreground)" }}>{value}</div>
      {note && <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{note}</div>}
    </div>
  );
}

/** Benchmark Library: coverage and quality, then every dataset with filters. Advisors read; admins manage. */
export default async function BenchmarkLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireRole(["advisor", "admin"]);
  const admin = user.role === "admin";
  const sp = await searchParams;
  const arr = sp.arr ? Number(sp.arr.replace(/[$,]/g, "").replace(/m$/i, "e6").replace(/k$/i, "e3")) : undefined;
  const filters: DatasetFilters = {
    q: sp.q,
    source: sp.source,
    metric: sp.metric,
    stage: sp.stage,
    arr: Number.isFinite(arr) ? arr : undefined,
    model: sp.model,
    period: sp.period,
    status: sp.status,
    sort: (["name", "updated", "reviewed", "usage"] as const).find((s) => s === sp.sort),
  };
  const [overview, datasets, sources] = await Promise.all([libraryOverview(), listDatasets(filters), listSources()]);
  const filtered = Object.values(filters).some((v) => v !== undefined && v !== "");

  return (
    <div className="p-4 sm:p-8 max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Internal"
        title="Benchmark Library"
        subtitle="Sourced, versioned benchmark data that assessments compare companies against. Only published versions are used, and every report keeps the exact version and records it used."
      />
      <div className="flex items-center gap-3 flex-wrap -mt-4">
        {admin && <Link href="/advisor/benchmark-library/new" className="px-4 py-2 rounded-lg text-sm font-semibold" style={primary}>New dataset</Link>}
        <Link href="/advisor/benchmark-library/sources" className="px-4 py-2 rounded-lg text-sm font-semibold" style={secondary}>Sources ({sources.length})</Link>
        {admin && <a href="/api/benchmark-library/template" className="text-sm font-semibold" style={{ color: "var(--green)" }}>Download CSV template</a>}
        {!admin && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Read only: administrators manage the library.</span>}
      </div>

      <section aria-labelledby="coverage" className="space-y-3">
        <h2 id="coverage" className="label" style={{ color: "var(--muted-foreground)" }}>Coverage and quality</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Published datasets" value={overview.publishedDatasets} note={`${overview.publishedRecords} records`} />
          <Stat label="Metrics covered" value={overview.publishedMetrics} note={overview.sources.length ? `Sources: ${overview.sources.join(", ")}` : "No published sources yet"} />
          <Stat label="Awaiting review" value={overview.awaitingReview.records} note={`records in ${overview.awaitingReview.versions} draft ${overview.awaitingReview.versions === 1 ? "version" : "versions"}`} />
          <Stat label="Due for review" value={overview.stale.length} note={`Published datasets past their review interval (default ${overview.defaultReviewDays} days)`} />
        </div>
        <div className="grid lg:grid-cols-3 gap-3">
          <div className="rounded-xl border p-4 text-sm" style={card}>
            <div className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>Metrics missing relevant cohorts</div>
            {overview.gaps.length === 0 ? (
              <p style={{ color: "var(--muted-foreground)" }}>Every core metric has a published cohort for every stage.</p>
            ) : (
              <ul className="space-y-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                {overview.gaps.map((g) => (
                  <li key={g.metric}>
                    <span style={{ color: "var(--foreground)" }}>{g.label}</span>: {g.records === 0 ? "no published benchmark" : g.broadOnly ? "only broad cohorts (no stage or ARR)" : `none for ${g.missingStages.join(", ")}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border p-4 text-sm" style={card}>
            <div className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>Needs attention</div>
            {overview.withErrors.length === 0 && overview.stale.length === 0 ? (
              <p style={{ color: "var(--muted-foreground)" }}>No validation errors in drafts, and nothing overdue for review.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {overview.withErrors.map((e) => (
                  <li key={e.versionId}><Link href={`/advisor/benchmark-library/${e.datasetId}?v=${e.versionId}`} style={{ color: "var(--red)" }}>{e.name}: {e.errors} validation {e.errors === 1 ? "error" : "errors"} in the draft</Link></li>
                ))}
                {overview.stale.map((s) => (
                  <li key={s.id}><Link href={`/advisor/benchmark-library/${s.id}`} style={{ color: "var(--amber)" }}>{s.name}: last reviewed {date(s.reviewedAt)}</Link></li>
                ))}
              </ul>
            )}
            <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Old data isn&apos;t treated as invalid: overdue datasets are still used, with a note, until someone reviews them.</p>
          </div>
          <div className="rounded-xl border p-4 text-sm" style={card}>
            <div className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>Most used in reports</div>
            {overview.topUsed.length === 0 ? (
              <p style={{ color: "var(--muted-foreground)" }}>No report has used a library benchmark yet.</p>
            ) : (
              <ol className="space-y-1 text-xs">
                {overview.topUsed.map((t) => (
                  <li key={t.datasetId}><Link href={`/advisor/benchmark-library/${t.datasetId}`} style={{ color: "var(--foreground)" }}>{t.name}</Link> <span style={{ color: "var(--muted-foreground)" }}>· {t.n} {t.n === 1 ? "report" : "reports"}</span></li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="datasets" className="space-y-3">
        <h2 id="datasets" className="label" style={{ color: "var(--muted-foreground)" }}>Datasets</h2>
        <form className="rounded-xl border p-4 grid sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end" style={card} role="search">
          <label className="text-xs sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>Search<input name="q" defaultValue={sp.q} placeholder="Name, source, metric" className={`${inputClass} mt-1`} style={inputStyle} /></label>
          <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>Source
            <select name="source" defaultValue={sp.source ?? ""} className={`${inputClass} mt-1`} style={inputStyle}><option value="">Any</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
          <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>Metric
            <select name="metric" defaultValue={sp.metric ?? ""} className={`${inputClass} mt-1`} style={inputStyle}><option value="">Any</option>{Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select>
          </label>
          <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>Stage
            <select name="stage" defaultValue={sp.stage ?? ""} className={`${inputClass} mt-1`} style={inputStyle}><option value="">Any</option>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>ARR<input name="arr" defaultValue={sp.arr} placeholder="e.g. 4M" className={`${inputClass} mt-1`} style={inputStyle} /></label>
          <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>Business model<input name="model" defaultValue={sp.model} className={`${inputClass} mt-1`} style={inputStyle} /></label>
          <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>Period<input name="period" defaultValue={sp.period} placeholder="e.g. 2025" className={`${inputClass} mt-1`} style={inputStyle} /></label>
          <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>Status
            <select name="status" defaultValue={sp.status ?? ""} className={`${inputClass} mt-1`} style={inputStyle}><option value="">Any</option>{Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select>
          </label>
          <label className="text-xs" style={{ color: "var(--muted-foreground)" }}>Sort
            <select name="sort" defaultValue={sp.sort ?? "updated"} className={`${inputClass} mt-1`} style={inputStyle}>
              <option value="updated">Recently updated</option><option value="name">Name</option><option value="reviewed">Longest since review</option><option value="usage">Most used</option>
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="px-3 py-1.5 rounded-md text-sm font-semibold" style={primary}>Apply</button>
            {filtered && <Link href="/advisor/benchmark-library" className="px-3 py-1.5 rounded-md text-sm" style={secondary}>Clear</Link>}
          </div>
        </form>

        <div className="rounded-xl border overflow-x-auto" style={card}>
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-sm font-semibold" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                <th className="py-2 px-3 font-semibold">Dataset</th>
                <th className="py-2 px-3 font-semibold">Source</th>
                <th className="py-2 px-3 font-semibold">Status</th>
                <th className="py-2 px-3 font-semibold">Metrics</th>
                <th className="py-2 px-3 font-semibold">Cohorts</th>
                <th className="py-2 px-3 font-semibold">Reviewed</th>
                <th className="py-2 px-3 font-semibold">Updated</th>
                <th className="py-2 px-3 font-semibold text-right">Reports</th>
              </tr>
            </thead>
            <tbody>
              {datasets.length === 0 && (
                <tr><td colSpan={8} className="py-6 px-3 text-center" style={{ color: "var(--muted-foreground)" }}>{filtered ? "No datasets match these filters." : "No datasets yet. Add a source, then create a dataset and import or enter its records."}</td></tr>
              )}
              {datasets.map((d) => (
                <tr key={d.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 px-3">
                    <Link href={`/advisor/benchmark-library/${d.id}`} className="font-medium" style={{ color: "var(--foreground)" }}>{d.name}</Link>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{d.records} records{d.periods.length ? ` · ${d.periods.slice(0, 3).join(", ")}` : ""}</div>
                  </td>
                  <td className="py-2.5 px-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <span style={{ color: "var(--foreground)" }}>{d.source.name}</span>
                    {d.source.publisher && <div>{d.source.publisher}</div>}
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    <span className="font-semibold" style={{ color: STATUS[d.status]?.color }}>{STATUS[d.status]?.label}</span>
                    {d.publishedVersion && <div style={{ color: "var(--muted-foreground)" }}>v{d.publishedVersion} live</div>}
                    {d.draftVersion && <div style={{ color: "var(--amber)" }}>v{d.draftVersion.version} {d.draftVersion.status}</div>}
                    {d.stale && <div style={{ color: "var(--amber)" }}>Due for review</div>}
                  </td>
                  <td className="py-2.5 px-3 text-xs" style={{ color: "var(--foreground)" }}>{d.metrics.map(metricName).join(", ") || "—"}</td>
                  <td className="py-2.5 px-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{d.stages.join(", ") || "All stages"}</td>
                  <td className="py-2.5 px-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{date(d.reviewedAt)}</td>
                  <td className="py-2.5 px-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{date(d.updatedAt)}</td>
                  <td className="py-2.5 px-3 text-xs text-right font-mono" style={{ color: "var(--foreground)" }}>{d.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          The earlier cohort benchmarks (Phase 1 benchmark reports and the sample company) are still at <Link href="/advisor/benchmarks" style={{ color: "var(--green)" }}>Legacy cohorts</Link>. Assessments use only this library.
        </p>
      </section>
    </div>
  );
}
