"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

/*
 * The Results page's signature charts. Every one plots figures computed in code from the
 * founder's files (or saved with the brief); none takes a hard-coded value. Each has a text
 * alternative for screen readers and stays legible at 390px.
 */

const C = { green: "#155A3C", greenLight: "#1A7049", amber: "#D97706", red: "#B91C1C", navy: "#0D1B2A", grey: "#94A3B8", subtle: "#6B7889" };
const AXIS = { fontSize: 12, fill: C.subtle, fontFamily: "var(--font-mono)" };
const LABEL = { fontSize: 12, fontFamily: "var(--font-mono)", fill: C.navy, fontWeight: 600 } as const;

export const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `$${+(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M` : a >= 1_000 ? `$${Math.round(a / 1_000)}K` : `$${Math.round(a)}`;
  return n < 0 ? `−${s}` : s;
};

/** One-line chart labels: "Food & Beverage Producers" → "Food & Beverage…". */
const short = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A category tick that never wraps (Recharts wraps long ticks onto several lines). */
function OneLineTick({ x, y, payload, width = 140 }: { x?: number; y?: number; payload?: { value: string }; width?: number }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" style={{ ...AXIS, fill: C.navy }}>
      <title>{payload?.value}</title>
      {short(String(payload?.value ?? ""), Math.floor(width / 7.2))}
    </text>
  );
}

const tooltipStyle = { contentStyle: { borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }, labelStyle: { fontWeight: 600, color: C.navy } };

/* ------------------------------------------------------------------ Fix Churn */

export type Bridge = { from: string; to: string; startArr: number; newArr: number; expansionArr: number; contractionArr: number; churnedArr: number; endArr: number };

/** ARR bridge waterfall: start → +new → +expansion → −contraction → −churn → end. */
export function ArrBridgeChart({ b }: { b: Bridge }) {
  const steps: { name: string; delta: number; total?: boolean }[] = [
    { name: "Start", delta: b.startArr, total: true },
    { name: "New", delta: b.newArr },
    { name: "Expansion", delta: b.expansionArr },
    { name: "Contraction", delta: -b.contractionArr },
    { name: "Churn", delta: -b.churnedArr },
    { name: "End", delta: b.endArr, total: true },
  ].filter((s) => s.total || s.delta !== 0);
  let run = 0;
  const data = steps.map((s) => {
    if (s.total) {
      run = s.delta;
      return { name: s.name, base: 0, value: s.delta, label: money(s.delta), kind: "total" };
    }
    const base = s.delta >= 0 ? run : run + s.delta;
    run += s.delta;
    return { name: s.name, base, value: Math.abs(s.delta), label: `${s.delta >= 0 ? "+" : "−"}${money(Math.abs(s.delta))}`, kind: s.delta >= 0 ? "up" : "down" };
  });
  const summary = `ARR bridge ${b.from} to ${b.to}: ${data.map((d) => `${d.name} ${d.label}`).join(", ")}.`;
  return (
    <figure aria-label={summary} className="w-full h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} interval={0} />
          <YAxis hide domain={[0, "dataMax"]} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="w" radius={[5, 5, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.kind === "total" ? C.grey : d.kind === "up" ? C.green : C.amber} />
            ))}
            <LabelList dataKey="label" position="top" style={LABEL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Monthly recurring revenue over time. */
export function MrrTrend({ months }: { months: { month: string; mrr: number }[] }) {
  const last = months.at(-1);
  const first = months[0];
  return (
    <figure aria-label={`MRR from ${first?.month} (${money(first?.mrr ?? 0)}) to ${last?.month} (${money(last?.mrr ?? 0)}).`} className="w-full h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="mrr-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.green} stopOpacity={0.25} />
              <stop offset="100%" stopColor={C.green} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#EEF1F4" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={AXIS} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={money} width={52} />
          <Tooltip {...tooltipStyle} formatter={(v) => [money(Number(v)), "MRR"]} />
          <Area type="monotone" dataKey="mrr" stroke={C.green} strokeWidth={2} fill="url(#mrr-fill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}

/* ---------------------------------------------------------- Growth Hiring Plan */

/** Won value per rep (deal owner), against a per-rep reference line when one is sourced. */
export function RepCapacityChart({ reps, target, targetLabel }: { reps: { name: string; value: number }[]; target: number | null; targetLabel?: string }) {
  const max = Math.max(target ?? 0, ...reps.map((r) => r.value)) * 1.15;
  const summary = `Won value per rep: ${reps.map((r) => `${r.name} ${money(r.value)}`).join(", ")}${target ? `. Reference ${money(target)}` : ""}.`;
  return (
    <figure aria-label={summary} className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={reps} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} interval={0} tickFormatter={(v) => short(String(v), 12)} />
          <YAxis hide domain={[0, max]} />
          {target !== null && <ReferenceLine y={target} stroke={C.navy} strokeDasharray="4 4" ifOverflow="extendDomain" />}
          <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {reps.map((r) => (
              <Cell key={r.name} fill={target === null ? C.greenLight : r.value >= target ? C.green : r.value >= target * 0.75 ? C.greenLight : C.amber} />
            ))}
            <LabelList dataKey="value" position="top" formatter={(v) => money(Number(v))} style={LABEL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {target !== null && targetLabel && <figcaption className="sr-only">{targetLabel}</figcaption>}
    </figure>
  );
}

/** You vs. the peer median and top quartile on one metric, as three bars. */
export function PeerBars({ label, you, median, top, format }: { label: string; you: number; median: number | null; top: number | null; format: (n: number) => string }) {
  const rows = [
    { name: "You", value: you, fill: median !== null && you < median ? C.amber : C.green },
    ...(median !== null ? [{ name: "Peer median", value: median, fill: C.grey }] : []),
    ...(top !== null ? [{ name: "Top quartile", value: top, fill: "#CBD5E1" }] : []),
  ];
  return (
    <figure aria-label={`${label}: ${rows.map((r) => `${r.name} ${format(r.value)}`).join(", ")}.`} className="w-full" style={{ height: rows.length * 44 + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, left: 0, bottom: 4 }}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={<OneLineTick width={96} />} width={100} interval={0} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.fill} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(v) => format(Number(v))} style={LABEL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Half-gauge: pipeline coverage, with an optional reference multiple (labelled by the caller). */
export function CoverageGauge({ value, target, max = 5 }: { value: number; target: number | null; max?: number }) {
  const W = 180;
  const R = 70;
  const cx = W / 2;
  const cy = 84;
  const angle = (v: number) => Math.PI * (1 - Math.min(Math.max(v, 0), max) / max);
  const pt = (v: number, r = R) => [cx + r * Math.cos(angle(v)), cy - r * Math.sin(angle(v))] as const;
  const [x1, y1] = pt(0);
  const [xv, yv] = pt(value);
  const [xm, ym] = pt(max);
  const ok = target === null || value >= target;
  return (
    <svg width={W} height={100} viewBox={`0 0 ${W} 100`} role="img" aria-label={`Pipeline coverage ${value}×${target !== null ? ` against ${target}×` : ""}`}>
      <path d={`M${x1},${y1} A${R},${R} 0 0 1 ${xm},${ym}`} fill="none" stroke="#F1F5F9" strokeWidth="14" strokeLinecap="round" />
      {value > 0 && <path d={`M${x1},${y1} A${R},${R} 0 0 1 ${xv},${yv}`} fill="none" stroke={ok ? C.green : C.amber} strokeWidth="14" strokeLinecap="round" />}
      {target !== null &&
        (() => {
          const [a, b] = pt(target, R - 14);
          const [c, d] = pt(target, R + 10);
          return <line x1={a} y1={b} x2={c} y2={d} stroke={C.navy} strokeWidth="2" />;
        })()}
      <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 600, fill: C.navy }}>
        {+value.toFixed(1)}×
      </text>
    </svg>
  );
}

/** Closed and open deals as one stacked bar: won, lost, open. */
export function DealOutcomes({ won, lost, open }: { won: number; lost: number; open: number }) {
  const total = won + lost + open || 1;
  const parts = [
    { name: "Won", n: won, color: C.green },
    { name: "Lost", n: lost, color: C.amber },
    { name: "Open", n: open, color: C.grey },
  ];
  return (
    <figure aria-label={`Deals: ${won} won, ${lost} lost, ${open} open.`} className="space-y-2">
      <div className="flex h-7 rounded-md overflow-hidden" aria-hidden>
        {parts.map((p) =>
          p.n ? (
            <div key={p.name} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} className="flex items-center justify-center text-[11px] font-mono font-semibold text-white min-w-[1.5rem]">
              {p.n}
            </div>
          ) : null,
        )}
      </div>
      <div className="flex gap-4 text-xs font-semibold" style={{ color: "var(--muted-foreground)" }} aria-hidden>
        {parts.map((p) => (
          <span key={p.name} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
        ))}
      </div>
    </figure>
  );
}

/* ---------------------------------------------------- Repeatable Sales Motion */

export type SegmentPoint = { name: string; winRate: number; avgWon: number; won: number; smallSample: boolean };

/** Segments: win rate (x) × average won deal (y), bubble = won deals. Top-right is the motion to build on. */
export function SegmentScatter({ points, dimension }: { points: SegmentPoint[]; dimension: string }) {
  // Alternate labels above and below in order of win rate, so neighbouring bubbles don't collide.
  const order = [...points].sort((a, b) => a.winRate - b.winRate).map((p) => p.name);
  const data = points.map((p) => ({ ...p, x: p.winRate, y: p.avgWon, z: Math.max(1, p.won), below: order.indexOf(p.name) % 2 === 1 }));
  const best = [...data].sort((a, b) => b.x * b.y * b.z - a.x * a.y * a.z)[0];
  const summary = `${dimension}: ${data.map((d) => `${d.name} win rate ${d.x}%, average won ${money(d.y)}, ${d.won} won`).join("; ")}.`;
  return (
    <figure aria-label={summary} className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 28, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#EEF1F4" />
          <XAxis type="number" dataKey="x" name="Win rate" unit="%" tick={AXIS} tickLine={false} axisLine={false} domain={[0, 100]} label={{ value: "Win rate", position: "insideBottomRight", offset: -4, style: { ...AXIS } }} />
          <YAxis type="number" dataKey="y" name="Avg won deal" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={money} width={52} domain={[0, (max: number) => Math.ceil((max * 1.3) / 10_000) * 10_000]} />
          <ZAxis type="number" dataKey="z" range={[80, 900]} name="Won deals" />
          <Tooltip {...tooltipStyle} formatter={(v, n) => (n === "Avg won deal" ? money(Number(v)) : n === "Win rate" ? `${v}%` : String(v))} labelFormatter={() => ""} />
          <Scatter data={data} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d === best ? C.green : d.smallSample ? C.grey : C.greenLight} fillOpacity={d === best ? 0.95 : 0.55} stroke={d === best ? C.navy : "none"} />
            ))}
            <LabelList
              dataKey="name"
              content={(p) => {
                const { x, y, width, height, value, index } = p as { x?: number; y?: number; width?: number; height?: number; value?: string; index?: number };
                if (x === undefined || y === undefined) return null;
                const below = data[index ?? 0]?.below;
                return (
                  <text x={Number(x) + Number(width ?? 0) / 2} y={below ? Number(y) + Number(height ?? 0) + 14 : Number(y) - 6} textAnchor="middle" style={{ ...LABEL, fontSize: 11 }}>
                    {short(String(value ?? ""), 20)}
                  </text>
                );
              }}
            />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Win rate by channel (lead source), best first. */
export function ChannelBars({ rows }: { rows: { name: string; winRate: number; won: number }[] }) {
  const data = [...rows].sort((a, b) => b.winRate - a.winRate).slice(0, 6);
  const top = data[0]?.winRate ?? 0;
  return (
    <figure aria-label={`Win rate by channel: ${data.map((d) => `${d.name} ${d.winRate}%`).join(", ")}.`} className="w-full" style={{ height: data.length * 38 + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
          <XAxis type="number" hide domain={[0, 100]} />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={<OneLineTick width={184} />} width={190} interval={0} />
          <Bar dataKey="winRate" radius={[0, 6, 6, 0]} barSize={18} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.winRate === top ? C.green : C.greenLight} fillOpacity={d.winRate === top ? 1 : 0.55} />
            ))}
            <LabelList dataKey="winRate" position="right" formatter={(v) => `${v}%`} style={LABEL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
