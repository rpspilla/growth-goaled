import Link from "next/link";
import { HealthPicker, SummaryEditor } from "@/components/advisor/CompanyControls";
import { listAdvisoryRequests } from "@/lib/data/advisory";
import { latestMetrics, portfolioRows, userName } from "@/lib/data/portfolio";
import { formatMetric, type MetricKey } from "@/lib/metrics";
import { getUseCase, targetSummary } from "@/lib/use-cases";
import { STEPS, journeyStage } from "@/lib/use-cases/steps";
import { updateHealth, updateSummary } from "./actions";
import { companyContext } from "./context";

const CARDS: MetricKey[] = ["arr", "arr_growth", "nrr", "acv"];
const card = { background: "var(--card)", borderColor: "var(--border)" };

/** Step 1 mirrored: company summary, its use cases and which step each is on. */
export default async function CompanyOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { company, useCases } = await companyContext((await params).id);
  const [metrics, [row], summaryBy, advisory] = await Promise.all([
    latestMetrics([company.id]).then((m) => m.get(company.id) ?? new Map()),
    portfolioRows([company]),
    userName(company.advisorSummaryBy),
    listAdvisoryRequests([company.id]),
  ]);
  const base = `/advisor/companies/${company.id}`;

  return (
    <div className="p-8 max-w-6xl space-y-6">
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


      <section>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>Use cases</h2>
        <div className="rounded-xl border divide-y" style={card}>
          {useCases.length === 0 && (
            <div className="p-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
              The founder hasn&apos;t picked a use case yet. <Link href={`${base}/library`} style={{ color: "var(--green)" }}>Open the library</Link> to grant one for a pilot.
            </div>
          )}
          {useCases.flatMap((u) => {
            const def = getUseCase(u.useCase);
            if (!def) return [];
            const n = 1 + journeyStage(u.activatedAt ? { useCase: def.id, status: u.status } : null);
            const step = STEPS[n]!;
            const target = targetSummary(u.objective);
            return [
              <div key={u.id} className="flex items-center gap-4 px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="flex-1">
                  <div className="font-medium" style={{ color: "var(--foreground)" }}>{def.shortTitle}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {u.activatedAt ? `Purchased ${u.activatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${u.activation === "advisor" ? "granted by advisor" : "paid"}` : "Free Snapshot only"}
                    {target && ` · founder's target: ${target}`}
                  </div>
                </div>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Step {n + 1} · {step.label}</span>
              </div>,
            ];
          })}
        </div>
      </section>

      {advisory.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>Advisory requests</h2>
          <div className="rounded-xl border divide-y" style={card}>
            {advisory.map((a) => (
              <div key={a.id} className="px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="flex gap-2 flex-wrap text-xs" style={{ color: "var(--muted-foreground)" }}>
                  <span className="font-semibold" style={{ color: a.status === "new" ? "var(--amber)" : "var(--muted-foreground)" }}>{a.status === "new" ? "New" : a.status}</span>
                  <span>{a.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  {a.useCase && getUseCase(a.useCase) && <span>· {getUseCase(a.useCase)!.shortTitle}</span>}
                </div>
                <div style={{ color: "var(--foreground)" }}>{a.message ?? "No message."}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="rounded-xl border p-5" style={card}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>Growth Intelligence Score</div>
          <div className="font-mono text-4xl font-semibold mb-1" style={{ color: "var(--foreground)" }}>{row?.score != null ? Math.round(row.score) : "—"}</div>
          {row?.score != null && (
            <div className="h-1.5 rounded-full mb-2" style={{ background: "var(--muted)" }}>
              <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, row.score)}%`, background: "var(--green)" }} />
            </div>
          )}
        </div>
      </div>

      <SummaryEditor
        companyId={company.id}
        summary={company.advisorSummary}
        meta={company.advisorSummaryAt ? `${summaryBy ?? "Advisor"} · ${company.advisorSummaryAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : null}
        save={updateSummary}
      />
    </div>
  );
}
