import Link from "next/link";
import { notFound } from "next/navigation";
import { HealthPicker, SummaryEditor } from "@/components/advisor/CompanyControls";
import { ReadinessReview, type ReviewItem } from "@/components/advisor/ReadinessReview";
import { GenerateButton } from "@/components/deliverables/GenerateButton";
import { STATUS_LABEL } from "@/components/deliverables/status";
import { requireRole } from "@/lib/auth/session";
import { benchmarkViewFor, getPublishedBenchmark } from "@/lib/data/benchmark";
import { getManagedCompany } from "@/lib/data/companies";
import { getDeliverable, listQueue } from "@/lib/data/deliverables";
import { latestMetrics, portfolioRows, userName } from "@/lib/data/portfolio";
import { getReadiness } from "@/lib/data/readiness";
import { listRegisterItems } from "@/lib/data/registers";
import { formatMetric, type MetricKey } from "@/lib/metrics";
import { PROGRESS_PHASES, progressIndex } from "@/lib/phases";
import { CATEGORIES, getItem } from "@/lib/readiness";
import { registerTypeMeta } from "@/lib/registers";
import { generateBenchmark } from "../../review/actions";
import { reviewItem, updateHealth, updateSummary } from "./actions";

export const maxDuration = 300;

const CARDS: MetricKey[] = ["arr", "arr_growth", "nrr", "acv"];
const card = { background: "var(--card)", borderColor: "var(--border)" };

export default async function CompanyViewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const company = await getManagedCompany(user, id);
  if (!company) notFound();

  const [metrics, readiness, questions, versions, published, [row], summaryBy] = await Promise.all([
    latestMetrics([company.id]).then((m) => m.get(company.id) ?? new Map()),
    getReadiness(company),
    listRegisterItems([company.id], { status: "open" }),
    listQueue([company.id]),
    getPublishedBenchmark(company.id),
    portfolioRows([company]),
    userName(company.advisorSummaryBy),
  ]);
  const latest = versions[0];
  const draftView = !published && latest && latest.status !== "failed" && latest.status !== "stalled" ? await getDeliverable(latest.id).then((d) => (d?.content ? benchmarkViewFor(d) : null)) : null;
  const bench = published ?? draftView;
  const a = readiness.assessment;
  const progress = progressIndex(company.phase);

  const reviewItems: ReviewItem[] = readiness.items.flatMap((i) => {
    const def = getItem(i.itemKey);
    if (!def) return [];
    const months = i.coverageStart && i.coverageEnd ? `${i.coverageStart.slice(0, 7)} to ${i.coverageEnd.slice(0, 7)}` : null;
    return [
      {
        key: i.itemKey,
        name: def.name,
        category: def.category,
        required: def.required,
        status: i.status,
        quality: i.quality,
        coverage: months,
        sourceSystem: i.sourceSystem,
        limitations: i.limitations,
        followUp: i.followUp,
        defaultFollowUp: def.followUp,
        files: readiness.files.filter((f) => f.itemKeys.includes(i.itemKey)).length,
      },
    ];
  });
  const order = new Map(CATEGORIES.flatMap((c) => c.items.map((it) => it.key)).map((k, n) => [k, n]));
  reviewItems.sort((x, y) => (order.get(x.key) ?? 0) - (order.get(y.key) ?? 0));

  return (
    <div className="p-8 max-w-6xl space-y-6">
      <Link href="/advisor/portfolio" className="text-xs" style={{ color: "var(--muted-foreground)" }}>← Portfolio</Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold" style={{ background: "var(--secondary)", color: "var(--foreground)" }}>{company.name[0]?.toUpperCase()}</div>
            <h1 className="font-display text-3xl font-normal" style={{ color: "var(--foreground)" }}>{company.name}</h1>
            {company.stage && <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: "var(--blue-muted)", color: "var(--blue)" }}>{company.stage}</span>}
            {row && row.attention.length > 0 && <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: "var(--amber-muted)", color: "var(--amber)" }}>Attention required</span>}
            {company.isSample && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>(sample)</span>}
          </div>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {[company.industry, company.website?.replace(/^https?:\/\//, ""), company.salesModel].filter(Boolean).join(" · ") || "No profile details yet"}
          </p>
          <div className="mt-3">
            <HealthPicker companyId={company.id} health={company.health} update={updateHealth} />
          </div>
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

      {row && row.attention.length > 0 && (
        <ul className="text-sm rounded-xl border p-4 space-y-1" style={{ ...card, borderColor: "var(--amber)" }}>
          {row.attention.map((t) => <li key={t} style={{ color: "var(--foreground)" }}>• {t}</li>)}
        </ul>
      )}

      <div className="grid grid-cols-4 gap-4">
        {CARDS.map((m) => {
          const v = metrics.get(m);
          return (
            <div key={m} className="rounded-xl border p-4" style={card}>
              <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>{m === "arr_growth" ? "Growth" : m.toUpperCase()}</div>
              <div className="font-mono text-xl font-semibold" style={{ color: v ? "var(--foreground)" : "var(--muted-foreground)" }}>{v ? formatMetric(m, v.value) : "—"}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="rounded-xl border p-5" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>Growth Intelligence Score</div>
          <div className="font-mono text-4xl font-semibold mb-1" style={{ color: "var(--foreground)" }}>{row?.score != null ? Math.round(row.score) : "—"}</div>
          {row?.score != null && (
            <div className="h-1.5 rounded-full mb-2" style={{ background: "var(--muted)" }}>
              <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, row.score)}%`, background: "var(--green)" }} />
            </div>
          )}
          <div className="mt-4 pt-4 border-t space-y-1" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs font-semibold mb-2" style={{ color: "var(--muted-foreground)" }}>
              Benchmark position{bench && !published && <span style={{ color: "var(--amber)" }}> · draft</span>}
            </div>
            {!bench && <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>No benchmark yet.</div>}
            {bench?.rows.map((r) => (
              <div key={r.metric} className="flex justify-between text-xs">
                <span style={{ color: "var(--muted-foreground)" }}>{r.label}</span>
                <span className="font-mono" style={{ color: r.status === "ahead" ? "var(--green)" : "var(--amber)" }}>
                  {r.value} vs {r.topQuartile}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-5" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>Current phase</div>
          <div className="text-sm font-semibold mb-3 capitalize" style={{ color: "var(--foreground)" }}>{company.phase}</div>
          <div className="space-y-2">
            {PROGRESS_PHASES.map((p, i) => (
              <div key={p} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ background: i < progress ? "var(--green)" : i === progress ? "var(--amber)" : "var(--muted)" }} />
                <span className="text-xs" style={{ color: i <= progress ? "var(--foreground)" : "var(--muted-foreground)" }}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-5" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>Data readiness</div>
          <div className="space-y-2 text-xs">
            {[
              ["Required items supplied", `${a.collection.requiredPercent}%`],
              ["Validated by advisor", `${a.quality.validated} of ${a.quality.supplied}`],
              ["Quality concerns", String(a.quality.issues.filter((i) => i.kind !== "no_coverage").length)],
              ["Metrics blocked", String(a.analytical.filter((m) => m.state === "blocked").length)],
              ["Files", String(readiness.files.length)],
              ["Open questions", String(questions.filter((q) => q.owner === "founder").length)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span style={{ color: "var(--muted-foreground)" }}>{k}</span>
                <span className="font-mono font-medium" style={{ color: "var(--foreground)" }}>{v}</span>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: a.readyForBenchmark ? "var(--green)" : "var(--muted-foreground)" }}>
            {a.readyForBenchmark ? "Inputs the benchmark needs are supplied." : a.benchmarkBlockers.join("; ")}
          </p>
        </div>
      </div>

      <SummaryEditor
        companyId={company.id}
        summary={company.advisorSummary}
        meta={company.advisorSummaryAt ? `${summaryBy ?? "Advisor"} · ${company.advisorSummaryAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : null}
        save={updateSummary}
      />

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>Review the founder&apos;s data</h2>
          <ReadinessReview companyId={company.id} items={reviewItems} review={reviewItem} />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Open questions · {questions.length}</h2>
              <Link href={`/advisor/registers?company=${company.id}`} className="text-xs" style={{ color: "var(--green)" }}>Registers →</Link>
            </div>
            <div className="rounded-xl border" style={card}>
              {questions.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>None open.</div>}
              {questions.slice(0, 6).map((q) => (
                <div key={q.id} className="px-4 py-2.5 border-b text-sm" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs mr-2" style={{ color: registerTypeMeta(q.type).color }}>{registerTypeMeta(q.type).badge}</span>
                  <span style={{ color: "var(--foreground)" }}>{q.title}</span>
                  {q.owner === "advisor" && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}> · advisor</span>}
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>Files · {readiness.files.length}</h2>
            <div className="rounded-xl border" style={card}>
              {readiness.files.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>No files uploaded.</div>}
              {readiness.files.slice(0, 10).map((f) => (
                <div key={f.id} className="px-4 py-2.5 border-b text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  <span className="text-sm" style={{ color: "var(--foreground)" }}>{f.filename}</span> · {f.status}
                  {f.dataPointsFound > 0 && ` · ${f.dataPointsFound} values`}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
