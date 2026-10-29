"use client";

import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

const usdK = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2).replace(/0$/, "")}M` : `$${Math.round(n / 1000)}K`);
const AXIS = { fontSize: 12, fill: "#6B7889", fontFamily: "var(--font-mono)" };

/** Growth Hiring Plan signature chart: new ACV per rep against the per-rep target. */
export function CapacityChart({ reps, target }: { reps: { name: string; acv: number }[]; target: number }) {
  const summary = reps.map((r) => `${r.name} ${usdK(r.acv)}`).join(", ");
  return (
    <figure aria-label={`New ACV per rep against a ${usdK(target)} target: ${summary}`} className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={reps} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} />
          <YAxis hide domain={[0, Math.max(target, ...reps.map((r) => r.acv)) * 1.15]} />
          <ReferenceLine y={target} stroke="#0D1B2A" strokeDasharray="4 4" />
          <Bar dataKey="acv" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {reps.map((r) => (
              <Cell key={r.name} fill={r.acv >= target ? "#155A3C" : r.acv >= target * 0.75 ? "#1A7049" : "#D97706"} />
            ))}
            <LabelList dataKey="acv" position="top" formatter={(v) => usdK(Number(v))} style={{ fontSize: 12, fontFamily: "var(--font-mono)", fill: "#0D1B2A", fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Stage-to-stage funnel; the biggest drop is highlighted. */
export function FunnelChart({ stages }: { stages: { stage: string; deals: number }[] }) {
  const max = stages[0]?.deals ?? 1;
  let worst = 1;
  stages.forEach((s, i) => {
    if (i > 0 && s.deals / stages[i - 1]!.deals < stages[worst]!.deals / stages[worst - 1]!.deals) worst = i;
  });
  return (
    <figure className="space-y-2" aria-label={`Funnel: ${stages.map((s) => `${s.stage} ${s.deals}`).join(", ")}. Biggest drop into ${stages[worst]!.stage}.`}>
      {stages.map((s, i) => {
        const conv = i ? Math.round((s.deals / stages[i - 1]!.deals) * 100) : null;
        const isWorst = i === worst;
        return (
          <div key={s.stage} className="grid grid-cols-[88px_1fr_56px] items-center gap-2">
            <span className="text-xs font-semibold truncate" style={{ color: "var(--muted-foreground)" }}>{s.stage}</span>
            <div className="h-6 rounded-md" style={{ width: `${(s.deals / max) * 100}%`, minWidth: 28, background: isWorst ? "#D97706" : "#155A3C", opacity: isWorst ? 1 : 0.35 + 0.65 * (s.deals / max) }}>
              <span className="font-mono text-[11px] font-semibold px-2 leading-6" style={{ color: "#fff" }}>{s.deals}</span>
            </div>
            <span className="font-mono text-xs font-semibold text-right" style={{ color: isWorst ? "#92400E" : "var(--subtle-foreground)" }}>
              {conv === null ? "" : `${conv}%`}
            </span>
          </div>
        );
      })}
    </figure>
  );
}

/** Half-gauge: pipeline coverage against the target multiple. */
export function CoverageGauge({ value, target, max = 4 }: { value: number; target: number; max?: number }) {
  const W = 180;
  const R = 70;
  const cx = W / 2;
  const cy = 84;
  const angle = (v: number) => Math.PI * (1 - Math.min(v, max) / max);
  const pt = (v: number, r = R) => [cx + r * Math.cos(angle(v)), cy - r * Math.sin(angle(v))] as const;
  const [x1, y1] = pt(0);
  const [xv, yv] = pt(value);
  const [xm, ym] = pt(max);
  const [tx1, ty1] = pt(target, R - 14);
  const [tx2, ty2] = pt(target, R + 10);
  const ok = value >= target;
  return (
    <figure className="flex flex-col items-center" aria-label={`Pipeline coverage ${value}× against a ${target}× target`}>
      <svg width={W} height={100} viewBox={`0 0 ${W} 100`}>
        <path d={`M${x1},${y1} A${R},${R} 0 0 1 ${xm},${ym}`} fill="none" stroke="var(--muted)" strokeWidth="14" strokeLinecap="round" />
        <path d={`M${x1},${y1} A${R},${R} 0 0 1 ${xv},${yv}`} fill="none" stroke={ok ? "#155A3C" : "#D97706"} strokeWidth="14" strokeLinecap="round" />
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#0D1B2A" strokeWidth="2" />
        <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 600, fill: "#0D1B2A" }}>
          {value}×
        </text>
      </svg>
      <figcaption className="text-xs font-semibold -mt-1" style={{ color: "var(--muted-foreground)" }}>
        Pipeline coverage · target {target}×
      </figcaption>
    </figure>
  );
}
