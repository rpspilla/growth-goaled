"use client";

import { useState } from "react";

type Point = { month: string; mrr: number };

const label = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const money = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const full = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/** A rounded axis: 4 steps from a "nice" floor below the lowest month to a "nice" ceiling above the highest. */
function axis(values: number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, hi * 0.1, 1);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const start = Math.max(0, Math.floor((lo - span * 0.1) / step) * step);
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 0.999; v += step) ticks.push(v);
  return ticks;
}

/**
 * Monthly recurring revenue for the last six months: month on the x-axis, MRR in dollars on the
 * y-axis, the trend as a line, and each month's change on the month before (with its direction)
 * under the axis. Hover or focus a month for its exact figure.
 */
export function MrrChart({ points, source }: { points: Point[]; source: string }) {
  const data = points.slice(-6);
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return null;
  const W = 720;
  const H = 260;
  const pad = { l: 64, r: 24, t: 16, b: 56 };
  const ticks = axis(data.map((d) => d.mrr));
  const y0 = ticks[0]!;
  const y1 = ticks.at(-1)!;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (data.length - 1);
  const y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const change = data.map((d, i) => (i === 0 || data[i - 1]!.mrr <= 0 ? null : (d.mrr / data[i - 1]!.mrr - 1) * 100));
  const first = data[0]!;
  const last = data.at(-1)!;
  const overall = first.mrr > 0 ? (last.mrr / first.mrr - 1) * 100 : null;
  const h = hover === null ? null : data[hover]!;

  return (
    <figure aria-label="Monthly recurring revenue, last six months" className="surface p-5 space-y-2">
      <figcaption className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Monthly recurring revenue</span>
        <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {label(first.month)} – {label(last.month)}: {full(first.mrr)} → <strong style={{ color: "var(--foreground)" }}>{full(last.mrr)}</strong>
          {overall !== null && ` (${pct(overall)})`} · from {source}
        </span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`MRR by month: ${data.map((d) => `${label(d.month)} ${full(d.mrr)}`).join(", ")}`} onMouseLeave={() => setHover(null)}>
          {/* Recessive grid and y-axis labels (dollars) */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="var(--muted-foreground)">{money(t)}</text>
            </g>
          ))}
          <text x={14} y={pad.t + (H - pad.t - pad.b) / 2} transform={`rotate(-90 14 ${pad.t + (H - pad.t - pad.b) / 2})`} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">MRR ($)</text>
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" />}
          <polyline points={data.map((d, i) => `${x(i)},${y(d.mrr)}`).join(" ")} fill="none" stroke="var(--green)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={d.month}>
              <circle cx={x(i)} cy={y(d.mrr)} r={hover === i ? 6 : 4} fill="var(--green)" stroke="var(--card)" strokeWidth={2} />
              {/* x-axis: the month, then its change on the month before */}
              <text x={x(i)} y={H - pad.b + 18} textAnchor="middle" fontSize={12} fill="var(--foreground)">{label(d.month)}</text>
              {change[i] !== null && (
                <text x={x(i)} y={H - pad.b + 36} textAnchor="middle" fontSize={12} fill="var(--foreground)">
                  <tspan fill={change[i]! >= 0 ? "var(--green)" : "var(--red)"}>{change[i]! >= 0 ? "▲" : "▼"}</tspan> {pct(change[i]!)}
                </text>
              )}
              {/* A hit target wider than the mark */}
              <rect x={x(i) - (W - pad.l - pad.r) / (data.length - 1) / 2} y={pad.t} width={(W - pad.l - pad.r) / (data.length - 1)} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${label(d.month)}: ${full(d.mrr)}${change[i] !== null ? `, ${pct(change[i]!)} on the month before` : ""}`} />
            </g>
          ))}
        </svg>
        {h && hover !== null && (
          <div role="tooltip" className="absolute pointer-events-none rounded-lg px-3 py-2 text-sm shadow-md" style={{ left: `${(x(hover) / W) * 100}%`, top: 0, transform: `translateX(${hover > data.length / 2 ? "-105%" : "5%"})`, background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
            <div className="font-semibold">{label(h.month)}</div>
            <div>{full(h.mrr)} MRR</div>
            {change[hover] !== null && <div style={{ color: "var(--muted-foreground)" }}>{pct(change[hover]!)} on the month before</div>}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Monthly recurring revenue by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>MRR</th>
            <th>Change on the month before</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.month}>
              <td>{label(d.month)}</td>
              <td>{full(d.mrr)}</td>
              <td>{change[i] === null ? "—" : pct(change[i]!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
