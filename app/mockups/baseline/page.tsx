import { ArrowRight, Briefcase, Clock, Gauge, Mic, Trophy, Users, Filter, PhoneCall, UserPlus } from "lucide-react";
import { ExpandableDetail, MetricTile, MockupBanner, ProgressRing, SourceChip, StatusChip, VerdictBadge } from "@/components/visual/primitives";
import { CapacityChart, CoverageGauge, FunnelChart } from "@/components/visual/charts";
import { company, confidence, dataGaps, dimensions, funnel, pipelineCoverage, repTarget, reps, stagedPlan, verdict, type PlanAction } from "@/lib/mockups/acme-hiring";

const DIM_ICON = { capacity: Users, pipeline: Filter, sales_calls: PhoneCall, hiring: UserPlus } as const;
const GAP_ICON = { mic: Mic, briefcase: Briefcase } as const;

function ActionCard({ a }: { a: PlanAction }) {
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="text-sm font-semibold leading-snug" style={{ color: "var(--foreground)" }}>{a.title}</div>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--green-muted)", color: "var(--green)" }}>KPI · {a.kpi}</span>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--subtle-foreground)" }}>{a.owner}</span>
      </div>
    </div>
  );
}

export default function ResultsMockup() {
  return (
    <div className="p-4 sm:p-8 max-w-6xl space-y-6" data-testid="mockup-results">
      <MockupBanner />

      {/* Answer card */}
      <section className="surface p-5 sm:p-7" aria-labelledby="answer">
        <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
          <div className="space-y-3">
            <div className="label">Results · {company.question}</div>
            <VerdictBadge label={verdict.label} tone={verdict.tone} />
            <h1 id="answer" className="font-display text-3xl sm:text-4xl leading-tight" style={{ color: "var(--foreground)" }}>
              {verdict.answer}
            </h1>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button className="btn btn-primary" disabled>
                Commit to this plan <ArrowRight size={16} aria-hidden />
              </button>
              <span className="text-sm link">Review with an advisor</span>
            </div>
          </div>
          <div className="flex lg:flex-col items-center gap-2">
            <ProgressRing value={confidence.score} label={`Confidence · ${confidence.level}`} tone="amber" />
            <span className="text-[11px] font-mono text-center max-w-[150px]" style={{ color: "var(--subtle-foreground)" }}>{confidence.basis}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <MetricTile icon={Gauge} label="New ACV per rep" value="$840K" compare="Peer median $920K" tone="amber" trend="down" />
          <MetricTile icon={Clock} label="Sales cycle" value="94d" compare="Peer median 78d" tone="amber" trend="down" />
          <MetricTile icon={Trophy} label="Win rate" value="28%" compare="Top quartile 24%" tone="green" trend="up" />
        </div>
      </section>

      {/* Signature visuals */}
      <div className="grid lg:grid-cols-[3fr_2fr] gap-6">
        <section className="surface p-5" aria-labelledby="capacity-chart">
          <div className="flex items-center justify-between gap-2">
            <h2 id="capacity-chart" className="text-base font-semibold" style={{ color: "var(--foreground)" }}>New ACV per rep vs. target</h2>
            <StatusChip status="watch" word="3 of 5 under" />
          </div>
          <div className="text-[11px] font-mono mt-1" style={{ color: "var(--subtle-foreground)" }}>- - - target $1.0M per rep</div>
          <CapacityChart reps={reps} target={repTarget} />
          <SourceChip>rep roster + closed-won deals, last 12 months</SourceChip>
        </section>
        <section className="surface p-5 space-y-4" aria-labelledby="funnel-chart">
          <div className="flex items-start justify-between gap-4">
            <h2 id="funnel-chart" className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Where deals stall</h2>
            <CoverageGauge value={pipelineCoverage.value} target={pipelineCoverage.target} />
          </div>
          <FunnelChart stages={funnel} />
          <SourceChip>CRM export · deals created in last 12 months</SourceChip>
        </section>
      </div>

      {/* Plan dimensions */}
      <section aria-labelledby="dims" className="space-y-3">
        <h2 id="dims" className="text-base font-semibold" style={{ color: "var(--foreground)" }}>By area</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {dimensions.map((d) => {
            const Icon = DIM_ICON[d.id as keyof typeof DIM_ICON];
            return (
              <div key={d.id} className="surface p-4 flex flex-col gap-3" style={d.status === "missing" ? { background: "var(--muted)" } : undefined}>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Icon size={18} className="shrink-0 mt-0.5" style={{ color: "var(--green)" }} aria-hidden />
                    <span className="text-sm font-semibold leading-snug" style={{ color: "var(--foreground)" }}>{d.title}</span>
                  </div>
                  <StatusChip status={d.status} />
                </div>
                {d.findings.length ? (
                  <ul className="space-y-1.5">
                    {d.findings.map((f) => (
                      <li key={f} className="text-sm flex gap-2" style={{ color: "var(--foreground)" }}>
                        <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--green)" }} aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-sm link">Add data →</span>
                )}
                {d.evidence.length > 0 && (
                  <div className="mt-auto">
                    <ExpandableDetail summary="Show evidence">
                      {d.evidence.map((e) => (
                        <p key={e}>{e}</p>
                      ))}
                    </ExpandableDetail>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Staged plan */}
      <section className="surface p-5" aria-labelledby="plan">
        <h2 id="plan" className="text-base font-semibold mb-4" style={{ color: "var(--foreground)" }}>Your plan</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {(
            [
              ["Now", "0–30 days", stagedPlan.now],
              ["Next", "30–90 days", stagedPlan.next],
              ["Later", "When the KPI moves", stagedPlan.later],
            ] as const
          ).map(([col, when, items]) => (
            <div key={col} className="rounded-2xl p-3 space-y-2" style={{ background: "var(--muted)" }}>
              <div className="flex items-baseline justify-between px-1">
                <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{col}</span>
                <span className="text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }}>{when}</span>
              </div>
              {items.map((a) => (
                <ActionCard key={a.title} a={a} />
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Data gaps */}
      <section className="flex flex-wrap items-center gap-3" aria-label="Data that would raise confidence">
        <span className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>Raise confidence:</span>
        {dataGaps.map((g) => {
          const Icon = GAP_ICON[g.icon];
          return (
            <span key={g.label} className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl border border-dashed" style={{ borderColor: "#CBD5E1", color: "var(--foreground)" }}>
              <Icon size={16} style={{ color: "var(--amber)" }} aria-hidden />
              {g.label}
            </span>
          );
        })}
      </section>
    </div>
  );
}
