import Link from "next/link";
import { GenerateButton } from "@/components/deliverables/GenerateButton";
import { STATUS_LABEL } from "@/components/deliverables/status";
import { benchmarkViewFor, getPublishedBenchmark } from "@/lib/data/benchmark";
import { getDeliverable, listQueue } from "@/lib/data/deliverables";
import { targetSummary } from "@/lib/use-cases";
import { generateBenchmark } from "../../../review/actions";
import { companyContext } from "../context";

export const maxDuration = 300;

const card = { background: "var(--card)", borderColor: "var(--border)" };

/** Step 4 mirrored. Until U3 the baseline is Growth Leak's benchmark, reviewed in the existing queue. */
export default async function CompanyBaselinePage({ params }: { params: Promise<{ id: string }> }) {
  const { company, active } = await companyContext((await params).id);
  const [versions, published] = await Promise.all([listQueue([company.id]), getPublishedBenchmark(company.id)]);
  const latest = versions[0];
  const draftView = !published && latest && latest.status !== "failed" && latest.status !== "stalled" ? await getDeliverable(latest.id).then((d) => (d?.content ? benchmarkViewFor(d) : null)) : null;
  const bench = published ?? draftView;
  const target = targetSummary(active?.objective);

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Step 4 · Baseline{active ? ` · ${active.def.shortTitle}` : ""}</div>
          <h1 className="font-display text-3xl font-normal" style={{ color: "var(--foreground)" }}>{company.name}: baseline</h1>
          {target && <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>Founder&apos;s target: {target}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {latest && (
            <Link href={`/advisor/review/${latest.id}`} className="px-5 py-2.5 rounded-lg text-sm font-semibold" style={{ background: "var(--green)", color: "#fff" }}>
              Benchmark v{latest.version}: {STATUS_LABEL[latest.status]?.label ?? latest.status} →
            </Link>
          )}
          {(!latest || ["failed", "stalled", "published", "changes_requested"].includes(latest.status)) && (
            <GenerateButton companyId={company.id} label={latest ? "Generate new benchmark" : "Generate benchmark"} generate={generateBenchmark} />
          )}
        </div>
      </div>
      <div className="rounded-xl border p-5" style={card}>
        <div className="text-xs font-semibold mb-2" style={{ color: "var(--muted-foreground)" }}>
          Benchmark position{bench && !published && <span style={{ color: "var(--amber)" }}> · draft</span>}
        </div>
        {!bench && <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>No benchmark yet.</div>}
        {bench?.rows.map((r) => (
          <div key={r.metric} className="flex justify-between text-sm py-0.5">
            <span style={{ color: "var(--muted-foreground)" }}>{r.label}</span>
            <span className="font-mono" style={{ color: r.status === "ahead" ? "var(--green)" : "var(--amber)" }}>
              {r.value} vs {r.topQuartile}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        Use case baselines (KPIs, gap to target and plan) are built through the same draft, QA and review pipeline. Drafts appear in the{" "}
        <Link href="/advisor/review" style={{ color: "var(--green)" }}>Review Queue</Link>.
      </p>
    </div>
  );
}
