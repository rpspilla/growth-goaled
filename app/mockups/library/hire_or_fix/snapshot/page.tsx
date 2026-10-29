import { Clock, Gauge, Mic, Target, Trophy, Users, List, TrendingUp, Repeat } from "lucide-react";
import { ExpandableDetail, MetricTile, MockupBanner, SourceChip, StatusChip, TONE, signalIcon } from "@/components/visual/primitives";
import { QuartileBar } from "@/components/visual/QuartileBar";
import { company, confirmData, peerMetrics, peerSource, snapshotSignals } from "@/lib/mockups/acme-hiring";

const DATA_ICON = { users: Users, list: List, trophy: Trophy, mic: Mic } as const;

export default function SnapshotMockup() {
  return (
    <div className="p-4 sm:p-8 max-w-6xl space-y-6" data-testid="mockup-snapshot">
      <MockupBanner />

      {/* Header + CTA */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div>
          <div className="label">Growth Snapshot · {company.question}</div>
          <h1 className="font-display text-3xl sm:text-4xl mt-1 leading-tight" style={{ color: "var(--foreground)" }}>
            Early read: <em>efficiency</em>, not headcount, looks like the constraint.
          </h1>
        </div>
        <div className="surface p-5 space-y-3" style={{ borderColor: "var(--green)", borderWidth: 2 }}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Full assessment</span>
            <span className="font-mono text-2xl font-semibold" style={{ color: "var(--foreground)" }}>$149</span>
          </div>
          <button className="btn btn-primary w-full" disabled>Get the full assessment</button>
          <div className="text-xs text-center" style={{ color: "var(--muted-foreground)" }}>or every question · $299/mo plan</div>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile icon={TrendingUp} label="ARR growth" value="72%" compare="Above peer median" tone="green" trend="up" />
        <MetricTile icon={Repeat} label="Net retention" value="108%" compare="Above peer median" tone="green" trend="up" />
        <MetricTile icon={Gauge} label="New ACV per rep" value="$840K" compare="Below peer median" tone="amber" trend="down" />
        <MetricTile icon={Clock} label="Sales cycle" value="94d" compare="16d slower than peers" tone="amber" trend="down" />
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        {/* Peers */}
        <section className="surface p-5" aria-labelledby="peers">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h2 id="peers" className="text-base font-semibold" style={{ color: "var(--foreground)" }}>You vs. peers</h2>
            <span className="text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }}>● you · | median</span>
          </div>
          <div className="divide-y divide-[color:var(--border)]">
            {peerMetrics.map((m) => (
              <QuartileBar key={m.key} m={m} />
            ))}
          </div>
          <div className="mt-3">
            <SourceChip>{peerSource}</SourceChip>
          </div>
        </section>

        {/* Signals */}
        <section className="space-y-3" aria-labelledby="signals">
          <h2 id="signals" className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Signals from your answers</h2>
          {snapshotSignals.map((s) => {
            const { icon: Icon, tone } = signalIcon(s.tone);
            return (
              <div key={s.title} className="surface p-4 flex gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>
                  <Icon size={18} aria-hidden />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{s.title}</div>
                  <div className="text-[11px] font-mono" style={{ color: "var(--subtle-foreground)" }}>{s.basis}</div>
                  <ExpandableDetail>
                    <p>{s.why}</p>
                  </ExpandableDetail>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
        {/* Fit */}
        <section className="surface p-5 flex items-center gap-4" aria-labelledby="fit">
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--green-muted)", color: "var(--green)" }}>
            <Target size={22} aria-hidden />
          </div>
          <div>
            <h2 id="fit" className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Right question for your stage</h2>
            <div className="mt-1"><StatusChip status="positive" word="Good fit" /></div>
          </div>
        </section>

        {/* Confirm */}
        <section className="surface p-5" aria-labelledby="confirm">
          <h2 id="confirm" className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>To confirm, the assessment needs</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {confirmData.map((d) => {
              const Icon = DATA_ICON[d.icon];
              return (
                <div key={d.label} className="rounded-xl p-3 flex flex-col items-center text-center gap-2" style={{ background: "var(--muted)" }}>
                  <Icon size={22} style={{ color: "var(--green)" }} aria-hidden />
                  <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{d.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="surface p-5">
        <ExpandableDetail summary="How we work with companies like yours">
          <p>After the assessment, most Series A teams fix rep productivity and deal velocity for one or two quarters before hiring. We sequence the plan to your runway and target close date.</p>
        </ExpandableDetail>
      </section>
    </div>
  );
}
