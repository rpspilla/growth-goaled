import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SourceForm } from "@/components/benchmark-library/SourceForm";
import { VerifySourceButton } from "@/components/benchmark-library/VerifySourceButton";
import { card } from "@/components/benchmarks/ui";
import { requireRole } from "@/lib/auth/session";
import { listSources } from "@/lib/data/benchmark-library";
import { saveSourceAction, verifySourceAction } from "../actions";

const KIND: Record<string, string> = { published_report: "Published report", licensed_dataset: "Licensed dataset", internal_research: "Internal research", aggregated_customer: "Aggregated customer data" };
const RELIABILITY: Record<string, { label: string; color: string }> = {
  unverified: { label: "Unverified", color: "var(--muted-foreground)" },
  reliable: { label: "Reliable", color: "var(--green)" },
  use_with_caution: { label: "Use with caution", color: "var(--amber)" },
  unreliable: { label: "Unreliable", color: "var(--red)" },
};
const date = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

/** Every source with its provenance, licence terms and review status. */
export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const admin = user.role === "admin";
  const sp = await searchParams;
  const sources = await listSources();
  const editing = sources.find((s) => s.id === sp.edit);

  return (
    <div className="p-4 sm:p-8 max-w-6xl space-y-5">
      <Link href="/advisor/benchmark-library" className="text-sm" style={{ color: "var(--green)" }}>← Benchmark Library</Link>
      <PageHeader eyebrow="Benchmark Library" title="Sources" subtitle="Who published the data, when, under what licence, and how far it can be trusted. Datasets inherit these terms." />
      {admin && (editing ? <SourceForm key={editing.id} source={editing} action={saveSourceAction} /> : sp.new !== undefined ? <SourceForm action={saveSourceAction} /> : (
        <Link href="/advisor/benchmark-library/sources?new" className="inline-block px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>Add a source</Link>
      ))}
      <div className="space-y-3">
        {sources.length === 0 && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No sources yet.</p>}
        {sources.map((s) => (
          <article key={s.id} className="rounded-xl border p-4 text-sm" style={card}>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-60">
                <div className="font-semibold" style={{ color: "var(--foreground)" }}>
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.name}</a> : s.name}
                </div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {[s.publisher, KIND[s.kind], s.publishedOn ? `published ${s.publishedOn}` : null, s.collectionPeriod ? `collected ${s.collectionPeriod}` : null, s.documentRef].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="text-xs font-semibold" style={{ color: RELIABILITY[s.reliability]?.color }}>{RELIABILITY[s.reliability]?.label}</span>
              {admin && <Link href={`/advisor/benchmark-library/sources?edit=${s.id}`} className="text-xs font-semibold" style={{ color: "var(--green)" }}>Edit</Link>}
            </div>
            <dl className="grid sm:grid-cols-3 gap-x-4 gap-y-1 mt-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <div><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Customer display: </dt><dd className="inline">{s.allowCustomerDisplay ? "allowed" : "not allowed"}</dd></div>
              <div><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Derived figures: </dt><dd className="inline">{s.allowDerived ? "allowed" : "not allowed"}</dd></div>
              <div><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Datasets: </dt><dd className="inline">{s.datasets}</dd></div>
              <div><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Last verified: </dt><dd className="inline">{date(s.lastVerifiedAt)}</dd></div>
              <div><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Updates: </dt><dd className="inline">{s.updateFrequency ?? "—"}</dd></div>
              <div><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Review every: </dt><dd className="inline">{s.reviewIntervalDays ?? 365} days</dd></div>
              {s.attribution && <div className="sm:col-span-3"><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Attribution: </dt><dd className="inline">{s.attribution}</dd></div>}
              {s.licenceNote && <div className="sm:col-span-3"><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Licence: </dt><dd className="inline">{s.licenceNote}</dd></div>}
              {s.kind === "aggregated_customer" && <div className="sm:col-span-3"><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Safeguards: </dt><dd className="inline">consent {s.consentReference ?? "missing"}; at least {s.minAggregationSize ?? "?"} companies per cohort</dd></div>}
              {admin && s.notes && <div className="sm:col-span-3"><dt className="inline font-medium" style={{ color: "var(--foreground)" }}>Notes: </dt><dd className="inline">{s.notes}</dd></div>}
            </dl>
            {admin && <div className="mt-2"><VerifySourceButton id={s.id} verify={verifySourceAction} /></div>}
          </article>
        ))}
      </div>
    </div>
  );
}
