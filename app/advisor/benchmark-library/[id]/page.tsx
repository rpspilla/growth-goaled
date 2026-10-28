import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ComparisonPreview } from "@/components/benchmark-library/ComparisonPreview";
import { DatasetForm } from "@/components/benchmark-library/DatasetForm";
import { RecordForm } from "@/components/benchmark-library/RecordForm";
import { RecordRow } from "@/components/benchmark-library/RecordRow";
import { VersionActions } from "@/components/benchmark-library/VersionActions";
import { card, primary } from "@/components/benchmarks/ui";
import { requireRole } from "@/lib/auth/session";
import type { CandidateRecord } from "@/lib/benchmark-library/match";
import { cohortKey, describeCohort, PERIOD_BASIS_LABEL, statisticLabel, validateRecord } from "@/lib/benchmark-library/records";
import { getDataset, listRecords, listSources, toRaw, versionIssues } from "@/lib/data/benchmark-library";
import { formatMetric, isMetricKey, METRICS } from "@/lib/metrics";
import { archiveDatasetAction, deleteRecordAction, openDraftAction, saveDatasetAction, saveRecordAction, versionAction } from "../actions";

const date = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const STATUS_COLOR: Record<string, string> = { published: "var(--green)", validated: "var(--amber)", draft: "var(--muted-foreground)", archived: "var(--muted-foreground)" };
const KIND: Record<string, string> = { published_report: "Published report", licensed_dataset: "Licensed dataset", internal_research: "Internal research", aggregated_customer: "Aggregated customer data" };

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-5" style={card} aria-label={title}>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="flex-1 label" style={{ color: "var(--muted-foreground)" }}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One dataset: provenance, versions and history, records with validation, imports, usage and the customer preview. */
export default async function DatasetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; metric?: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const admin = user.role === "admin";
  const { id } = await params;
  const sp = await searchParams;
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await getDataset(id) : null;
  if (!data) notFound();
  const { dataset, source, versions, imports, usage } = data;
  const draft = versions.find((v) => v.status === "draft" || v.status === "validated");
  const published = versions.find((v) => v.status === "published");
  const selected = versions.find((v) => v.id === sp.v) ?? (admin ? draft : undefined) ?? published ?? versions[0];
  const [records, issues, sources] = selected ? await Promise.all([listRecords(selected.id), versionIssues(selected.id), admin ? listSources() : []]) : [[], [], []];
  const editable = admin && !dataset.archivedAt && (selected?.status === "draft" || selected?.status === "validated");
  const shown = sp.metric ? records.filter((r) => r.metric === sp.metric) : records;
  const errors = issues.filter((i) => i.severity === "error");
  const general = issues.filter((i) => !i.recordId);

  // Preview groups: one per cohort and period of each metric, as the matching service would group them.
  const candidates: CandidateRecord[] = records.flatMap((r) => {
    const { record } = validateRecord(toRaw(r));
    return record
      ? [{ ...record, id: r.id, versionId: r.versionId, version: selected!.version, datasetId: dataset.id, datasetName: dataset.name, reviewedAt: null, source: { id: source.id, name: source.name, publisher: source.publisher, url: source.url, documentRef: source.documentRef, publishedOn: source.publishedOn, attribution: source.attribution, kind: source.kind, reliability: source.reliability, allowCustomerDisplay: source.allowCustomerDisplay, allowDerived: source.allowDerived, reviewIntervalDays: source.reviewIntervalDays } }]
      : [];
  });
  const groups = new Map<string, CandidateRecord[]>();
  for (const c of candidates) {
    const k = [c.metric, cohortKey(c), c.period, c.periodBasis].join("#");
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const previewGroups = [...groups.entries()].map(([key, rs]) => ({ key, label: `${isMetricKey(rs[0]!.metric) ? METRICS[rs[0]!.metric].label : rs[0]!.metric} · ${describeCohort(rs[0]!)} · ${rs[0]!.period}`, records: rs }));
  const metrics = [...new Set(records.map((r) => r.metric))];
  const fmt = (metric: string, v: number | null) => (v === null ? "—" : isMetricKey(metric) ? formatMetric(metric, v) : String(v));

  return (
    <div className="p-4 sm:p-8 max-w-6xl space-y-5">
      <Link href="/advisor/benchmark-library" className="text-sm" style={{ color: "var(--green)" }}>← Benchmark Library</Link>
      <PageHeader eyebrow="Benchmark dataset" title={dataset.name} subtitle={dataset.description ?? undefined} />

      <div className="grid lg:grid-cols-3 gap-5 -mt-4">
        <Section title="Source and provenance">
          <div className="text-sm space-y-1" style={{ color: "var(--muted-foreground)" }}>
            <div className="font-semibold" style={{ color: "var(--foreground)" }}>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.name}</a> : source.name}</div>
            <div>{[source.publisher, KIND[source.kind]].filter(Boolean).join(" · ")}</div>
            {source.documentRef && <div>{source.documentRef}</div>}
            <div>Published {source.publishedOn ?? "—"}{source.collectionPeriod ? ` · collected ${source.collectionPeriod}` : ""}</div>
            <div>Reliability: {source.reliability.replace(/_/g, " ")} · verified {date(source.lastVerifiedAt)}</div>
            <div>Customer display {source.allowCustomerDisplay ? "allowed" : <span style={{ color: "var(--amber)" }}>not allowed</span>} · derived figures {source.allowDerived ? "allowed" : "not allowed"}</div>
            {source.attribution && <div>Attribution: {source.attribution}</div>}
            {source.licenceNote && <div>Licence: {source.licenceNote}</div>}
            <Link href="/advisor/benchmark-library/sources" className="text-xs font-semibold" style={{ color: "var(--green)" }}>All sources →</Link>
          </div>
        </Section>
        <Section title="Dataset">
          <dl className="text-sm space-y-1" style={{ color: "var(--muted-foreground)" }}>
            <div>Status: <span className="font-semibold" style={{ color: dataset.archivedAt ? "var(--muted-foreground)" : published ? "var(--green)" : "var(--amber)" }}>{dataset.archivedAt ? `Archived ${date(dataset.archivedAt)}` : published ? `Version ${published.version} published` : "Not published yet"}</span></div>
            <div>Company types: {dataset.companyTypes.join(", ") || "—"}</div>
            <div>Business models: {dataset.businessModels.join(", ") || "—"}</div>
            <div>Created {date(dataset.createdAt)}{data.createdBy ? ` by ${data.createdBy}` : ""}</div>
            <div>Last reviewed: {date(published ? new Date(Math.max(published.publishedAt?.getTime() ?? 0, published.lastReviewedAt?.getTime() ?? 0)) : null)}</div>
          </dl>
          {admin && !dataset.archivedAt && (
            <details className="mt-3">
              <summary className="text-xs font-semibold cursor-pointer" style={{ color: "var(--green)" }}>Edit details</summary>
              <div className="mt-2"><DatasetForm sources={sources} dataset={dataset} action={saveDatasetAction} /></div>
            </details>
          )}
        </Section>
        <Section title={`Used in reports (${usage.length})`}>
          {usage.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No assessment has used this dataset yet.</p>
          ) : (
            <ul className="text-xs space-y-1.5">
              {usage.slice(0, 12).map((u) => (
                <li key={u.deliverableId}>
                  <Link href={`/advisor/companies/${u.companyId}/baseline`} style={{ color: "var(--foreground)" }}>{u.company}</Link>
                  <span style={{ color: "var(--muted-foreground)" }}> · {u.useCase?.replace(/_/g, " ")} brief v{u.reportVersion} · dataset v{u.datasetVersion} · {u.metrics.map((m) => (isMetricKey(m) ? METRICS[m].label : m)).join(", ")} · {date(u.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Versions">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--muted-foreground)" }}>
              <th className="py-1.5">Version</th><th className="py-1.5">Status</th><th className="py-1.5">Created</th><th className="py-1.5">Published</th><th className="py-1.5">Effective</th><th className="py-1.5">Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-t" style={{ borderColor: "var(--border)", background: v.id === selected?.id ? "var(--muted)" : undefined }}>
                <td className="py-1.5"><Link href={`/advisor/benchmark-library/${dataset.id}?v=${v.id}`} className="font-semibold" style={{ color: "var(--foreground)" }}>v{v.version}</Link></td>
                <td className="py-1.5 capitalize" style={{ color: STATUS_COLOR[v.status] }}>{v.status}</td>
                <td className="py-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{date(v.createdAt)}</td>
                <td className="py-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{date(v.publishedAt)}</td>
                <td className="py-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{v.effectiveDate ?? "—"}</td>
                <td className="py-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{date(v.lastReviewedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {selected && (
        <Section
          title={`Version ${selected.version} · ${selected.status} · ${records.length} records`}
          aside={admin && editable ? <Link href={`/advisor/benchmark-library/${dataset.id}/import`} className="px-3 py-1.5 rounded-md text-sm font-semibold" style={primary}>Import CSV</Link> : null}
        >
          {admin && <div className="mb-4"><VersionActions datasetId={dataset.id} versionId={selected.id} status={selected.status} hasDraft={Boolean(draft)} datasetArchived={Boolean(dataset.archivedAt)} act={versionAction} openDraft={openDraftAction} archiveDataset={archiveDatasetAction} /></div>}
          {selected.status !== "published" && selected.status !== "archived" && (
            <p className="text-sm mb-3" style={{ color: errors.length ? "var(--red)" : "var(--green)" }} role="status">
              {errors.length ? `${errors.length} validation ${errors.length === 1 ? "error" : "errors"} to fix before publishing.` : "No validation errors."} {issues.length - errors.length > 0 && <span style={{ color: "var(--muted-foreground)" }}>{issues.length - errors.length} warnings.</span>}
            </p>
          )}
          {general.length > 0 && <ul className="text-xs mb-3 space-y-0.5">{general.map((g) => <li key={g.message} style={{ color: g.severity === "error" ? "var(--red)" : "var(--amber)" }}>• {g.message}</li>)}</ul>}
          {metrics.length > 1 && (
            <div className="flex gap-2 flex-wrap text-xs mb-2">
              <Link href={`/advisor/benchmark-library/${dataset.id}?v=${selected.id}`} style={{ color: sp.metric ? "var(--muted-foreground)" : "var(--foreground)", fontWeight: sp.metric ? 400 : 600 }}>All</Link>
              {metrics.map((m) => (
                <Link key={m} href={`/advisor/benchmark-library/${dataset.id}?v=${selected.id}&metric=${m}`} style={{ color: sp.metric === m ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: sp.metric === m ? 600 : 400 }}>{isMetricKey(m) ? METRICS[m].label : m}</Link>
              ))}
            </div>
          )}
          <ul>
            {shown.length === 0 && <li className="text-sm py-2" style={{ color: "var(--muted-foreground)" }}>No records yet.</li>}
            {shown.map((r) => {
              const own = issues.filter((i) => i.recordId === r.id);
              return (
                <RecordRow key={r.id} datasetId={dataset.id} recordId={r.id} editable={editable} raw={toRaw(r)} save={saveRecordAction} remove={deleteRecordAction}>
                  <div className="flex items-baseline gap-2 flex-wrap text-sm">
                    <span className="font-semibold" style={{ color: "var(--foreground)" }}>{r.displayName}</span>
                    <span style={{ color: "var(--muted-foreground)" }}>{statisticLabel(r)}</span>
                    <span className="font-mono font-semibold" style={{ color: "var(--foreground)" }}>{r.statistic === "range" ? `${fmt(r.metric, r.valueLow)}–${fmt(r.metric, r.valueHigh)}` : fmt(r.metric, r.value)}</span>
                    {!r.definitionMatches && <span className="text-xs" style={{ color: "var(--amber)" }}>definition not confirmed</span>}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {describeCohort(r)} · {r.period} ({PERIOD_BASIS_LABEL[r.periodBasis].toLowerCase()}) · {r.sampleSize !== null ? `n = ${r.sampleSize}` : "no sample size"} · {r.unit} · {r.metric}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{r.definition}{r.cohortDefinition ? ` · Cohort: ${r.cohortDefinition}` : ""}{r.limitations ? ` · Limitations: ${r.limitations}` : ""}</div>
                  {own.length > 0 && <ul className="text-xs mt-1 space-y-0.5">{own.map((i, k) => <li key={k} style={{ color: i.severity === "error" ? "var(--red)" : "var(--amber)" }}>{i.severity === "error" ? "✗" : "!"} {i.message}</li>)}</ul>}
                </RecordRow>
              );
            })}
          </ul>
          {editable && (
            <details className="mt-4">
              <summary className="text-sm font-semibold cursor-pointer" style={{ color: "var(--green)" }}>Add a record by hand</summary>
              <div className="mt-3"><RecordForm datasetId={dataset.id} versionId={selected.id} action={saveRecordAction} /></div>
            </details>
          )}
          {!editable && admin && !dataset.archivedAt && selected.status === "published" && <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>Published versions can&apos;t be changed, so reports stay reproducible. Use &ldquo;New version&rdquo; to start a draft copy.</p>}
        </Section>
      )}

      {selected && (
        <Section title="Customer preview">
          <ComparisonPreview groups={previewGroups} />
        </Section>
      )}

      {selected && selected.history.length > 0 && (
        <Section title={`Version ${selected.version} history`}>
          <ol className="text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
            {[...selected.history].reverse().map((e, i) => <li key={i}>{date(e.at)} · <span style={{ color: "var(--foreground)" }}>{e.action}</span>{e.by ? ` · ${e.by}` : ""}{e.note ? ` · ${e.note}` : ""}</li>)}
          </ol>
        </Section>
      )}

      <Section title={`Imports (${imports.length})`}>
        {imports.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No CSV imports yet.</p>
        ) : (
          <ul className="text-xs space-y-2">
            {imports.map((i) => (
              <li key={i.id}>
                <span className="font-semibold" style={{ color: i.status === "committed" ? "var(--foreground)" : "var(--red)" }}>{i.filename}</span>
                <span style={{ color: "var(--muted-foreground)" }}> · {date(i.createdAt)} · {i.by ?? "unknown"} · {i.status} · {i.rowsTotal} rows: {i.rowsAccepted} accepted, {i.rowsRejected} rejected, {i.rowsSkipped} skipped{i.blobUrl ? " · file stored" : ""}</span>
                {i.errors.length > 0 && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer" style={{ color: "var(--muted-foreground)" }}>{i.errors.length} {i.errors.length === 1 ? "error" : "errors"}</summary>
                    <ul className="mt-1 space-y-0.5">{i.errors.slice(0, 50).map((e, k) => <li key={k} style={{ color: "var(--red)" }}>Line {e.line}{e.field ? ` (${e.field})` : ""}: {e.message}</li>)}</ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
