"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CircleDashed } from "lucide-react";
import { ArrBridgeChart, ChannelBars, CoverageGauge, DealOutcomes, MrrTrend, money, PeerBars, RepCapacityChart, SegmentScatter } from "@/components/visual/results-charts";
import type { BaselineRow } from "@/lib/data/assessments";
import type { BriefCharts } from "@/lib/deliverables/charts";
import type { UseCaseId } from "@/lib/use-cases/types";

/*
 * One signature chart (or two) per question, drawn only from tables computed in code from the
 * founder's files and from their calculated figures. When the data for a chart isn't there, a
 * "Needs data" tile links to the item on the Data step: never a placeholder chart.
 */

function ChartCard({ title, chip, source, children, wide = false }: { title: string; chip?: ReactNode; source: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`surface p-5 min-w-0 ${wide ? "lg:col-span-2" : ""}`} aria-label={title}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
          {title}
        </h3>
        {chip}
      </div>
      {children}
      <div className="mt-2">
        <span data-label className="inline-flex text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--subtle-foreground)" }}>
          Source · {source}
        </span>
      </div>
    </section>
  );
}

function Chip({ tone, children }: { tone: "green" | "amber" | "neutral"; children: ReactNode }) {
  const c = tone === "green" ? { bg: "var(--green-muted)", fg: "var(--green)" } : tone === "amber" ? { bg: "var(--amber-muted)", fg: "#92400E" } : { bg: "var(--muted)", fg: "var(--muted-foreground)" };
  return (
    <span data-label className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>
      {children}
    </span>
  );
}

export function NeedsData({ title, item, itemName, dataPath = "/data" }: { title: string; item: string; itemName: string; dataPath?: string }) {
  return (
    <section className="rounded-xl border-2 border-dashed p-5 flex flex-col items-start gap-2 min-w-0" style={{ borderColor: "var(--border)" }} aria-label={`${title}: needs data`}>
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
        <CircleDashed size={13} aria-hidden /> Needs data
      </span>
      <h3 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
        {title}
      </h3>
      <Link href={`${dataPath}#item-${item}`} className="text-sm link">
        Add {itemName} →
      </Link>
    </section>
  );
}

const pct = (n: number) => `${Math.round(n)}%`;

export function SignatureCharts({ useCase, charts, baseline, dataPath = "/data" }: { useCase: UseCaseId; charts: BriefCharts; baseline: BaselineRow[]; dataPath?: string }) {
  const fig = (m: string) => baseline.find((b) => b.metric === m);
  const cards: ReactNode[] = [];
  const needs = (title: string, item: string, itemName: string) => <NeedsData key={title} title={title} item={item} itemName={itemName} dataPath={dataPath} />;

  if (useCase === "growth_leak") {
    const b = charts.bridge;
    if (b) {
      const lost = b.churnedArr + b.contractionArr;
      cards.push(
        <ChartCard key="bridge" wide title={`ARR bridge · ${b.from} → ${b.to}`} chip={<Chip tone={lost > 0 ? "amber" : "green"}>{money(lost)} lost</Chip>} source={`${b.source} · ${b.customersStart} starting customers`}>
          <ArrBridgeChart b={b} />
        </ChartCard>,
      );
    } else cards.push(needs("ARR bridge: where revenue comes and goes", "revenue_by_customer", "revenue by customer"));
    if (charts.monthly) {
      const pts = charts.monthly.points;
      const change = pts.length > 1 && pts[0]!.mrr > 0 ? ((pts.at(-1)!.mrr / pts[0]!.mrr - 1) * 100) : null;
      cards.push(
        <ChartCard key="mrr" wide title="Monthly recurring revenue" chip={change !== null ? <Chip tone={change >= 0 ? "green" : "amber"}>{change >= 0 ? "+" : ""}{pct(change)} over {pts.length} months</Chip> : undefined} source={charts.monthly.source}>
          <MrrTrend months={pts} />
        </ChartCard>,
      );
    } else if (!b) cards.push(needs("Revenue trend", "monthly_revenue", "monthly revenue"));
  }

  if (useCase === "hire_or_fix") {
    const owners = charts.segments.find((s) => s.dimension === "Owner");
    const ae = fig("ae_productivity");
    const reps = owners?.rows.filter((r) => r.avgWonAmount !== null && r.won > 0).map((r) => ({ name: r.name, value: Math.round(r.won * r.avgWonAmount!) }));
    if (owners && reps && reps.length >= 2) {
      const target = ae?.medianRaw ?? null;
      const under = target !== null ? reps.filter((r) => r.value < target).length : null;
      cards.push(
        <ChartCard key="reps" wide title={target !== null ? "Won value per rep vs peer median" : "Won value per rep"} chip={under !== null ? <Chip tone={under ? "amber" : "green"}>{under} of {reps.length} under</Chip> : undefined} source={`${owners.source}${target !== null ? " · peer median from your brief's reference data" : ""}`}>
          {target !== null && (
            <p data-label className="text-[11px] font-mono -mt-1 mb-1" style={{ color: "var(--subtle-foreground)" }}>
              - - - peer median {money(target)} new ACV per rep
            </p>
          )}
          <RepCapacityChart reps={reps} target={target} />
        </ChartCard>,
      );
    } else if (ae) {
      cards.push(
        <ChartCard key="ae" wide title="New ACV per rep" source={ae.method ?? ae.period ?? "your figures"}>
          <PeerBars label="New ACV per rep" you={ae.raw} median={ae.medianRaw} top={ae.topQuartileRaw} format={money} />
        </ChartCard>,
      );
    } else cards.push(needs("Capacity per rep", "roster", "your rep roster"));
    const cov = fig("pipeline_coverage");
    if (cov) {
      cards.push(
        <ChartCard key="cov" title="Pipeline coverage" chip={<Chip tone={cov.raw >= 3 ? "green" : "amber"}>{cov.raw >= 3 ? "Covered" : "Thin"}</Chip>} source={`${cov.period ?? "current"} · 3× is a common rule (assumption)`}>
          <div className="flex justify-center">
            <CoverageGauge value={cov.raw} target={3} />
          </div>
        </ChartCard>,
      );
    } else cards.push(needs("Pipeline coverage", "opportunities", "your pipeline"));
    if (charts.pipeline) {
      const p = charts.pipeline;
      cards.push(
        <ChartCard key="deals" title="Deals" chip={<Chip tone="neutral">{pct((p.won / (p.won + p.lost)) * 100)} win rate</Chip>} source={p.source}>
          <DealOutcomes won={p.won} lost={p.lost} open={p.open} />
        </ChartCard>,
      );
    }
  }

  if (useCase === "winning_icp") {
    const seg = ["Segment", "Industry", "Company size"].map((d) => charts.segments.find((s) => s.dimension === d)).find((s) => s && s.rows.filter((r) => r.avgWonAmount !== null).length >= 2);
    if (seg) {
      const points = seg.rows.filter((r) => r.winRate !== null && r.avgWonAmount !== null).map((r) => ({ name: r.name, winRate: Math.round(r.winRate!), avgWon: r.avgWonAmount!, won: r.won, smallSample: r.smallSample }));
      const best = [...points].sort((a, b) => b.winRate * b.avgWon * b.won - a.winRate * a.avgWon * a.won)[0];
      cards.push(
        <ChartCard key="seg" wide title={`${seg.dimension}s: win rate × deal size`} chip={best ? <Chip tone="green">Best: {best.name}</Chip> : undefined} source={`${seg.source} · bubble = deals won`}>
          <SegmentScatter points={points} dimension={seg.dimension} />
        </ChartCard>,
      );
    } else cards.push(needs("Segments by win rate and deal size", "win_loss", "won and lost deals"));
    const ch = charts.segments.find((s) => s.dimension === "Source");
    if (ch) {
      const rows = ch.rows.filter((r) => r.winRate !== null).map((r) => ({ name: r.name, winRate: Math.round(r.winRate!), won: r.won }));
      cards.push(
        <ChartCard key="ch" wide title="Win rate by channel" source={ch.source}>
          <ChannelBars rows={rows} />
        </ChartCard>,
      );
    } else cards.push(needs("Channels", "lead_source", "lead source"));
  }

  // Any question: figures with a peer median, as bars (never more than two).
  if (!cards.length) {
    for (const r of baseline.filter((b) => b.medianRaw !== null).slice(0, 2)) {
      cards.push(
        <ChartCard key={r.metric} title={r.label} source={r.period ?? "your figures"}>
          <PeerBars label={r.label} you={r.raw} median={r.medianRaw} top={r.topQuartileRaw} format={(n) => (r.value.endsWith("%") ? pct(n) : money(n))} />
        </ChartCard>,
      );
    }
  }

  const shown = cards.filter(Boolean);
  if (!shown.length) return null;
  return <div className="grid lg:grid-cols-2 gap-4">{shown}</div>;
}
