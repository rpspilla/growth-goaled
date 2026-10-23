"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BenchmarkView as BenchmarkData } from "@/lib/data/benchmark";
import { SourceTrailPanel } from "@/components/SourceTrailPanel";

function StatusPill({ status }: { status: "ahead" | "behind" }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{
        background: status === "ahead" ? "var(--green-muted)" : "var(--amber-muted)",
        color: status === "ahead" ? "var(--green)" : "var(--amber)",
      }}
    >
      {status === "ahead" ? "↑ Ahead" : "↓ Behind"}
    </span>
  );
}

export function BenchmarkView({
  data,
  companyName,
  scoreBreakdown,
  baselineHref,
  onSourceTrail,
}: {
  data: BenchmarkData;
  companyName: string;
  scoreBreakdown: { label: string; score: number }[] | null;
  baselineHref?: string;
  /** Called when a Source Trail is opened (analytics). */
  onSourceTrail?: (claimKey: string) => void;
}) {
  const [openClaim, setOpenClaimState] = useState<string | null>(null);
  const setOpenClaim = (key: string | null) => {
    setOpenClaimState(key);
    if (key) onSourceTrail?.(key);
  };
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [barsReady, setBarsReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBarsReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="p-8 max-w-6xl">
      <SourceTrailPanel claim={openClaim ? (data.claims[openClaim] ?? null) : null} onClose={() => setOpenClaim(null)} />

      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          How do you compare?
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          We compared {companyName} against companies with similar stage, ARR, business model and GTM characteristics.
        </p>
      </div>

      {/* Cohort badge */}
      <div
        className="inline-flex items-center gap-4 rounded-xl border px-5 py-3 mb-8 flex-wrap"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div>
          <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Benchmark Cohort</div>
          <div className="font-semibold text-sm mt-0.5" style={{ color: "var(--foreground)" }}>
            {data.cohort.companyCount != null ? `${data.cohort.companyCount} comparable companies` : data.cohort.name}
          </div>
        </div>
        <div className="w-px h-8" style={{ background: "var(--border)" }} />
        {data.cohort.tags.map((tag) => (
          <span
            key={tag}
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="grid grid-cols-4 px-5 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
              {["Metric", companyName, "Top Quartile", "Status"].map((h) => (
                <div key={h} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                  {h}
                </div>
              ))}
            </div>
            {data.rows.map((row) => (
              <button
                type="button"
                key={row.metric}
                className="w-full text-left grid grid-cols-4 items-center px-5 py-4 border-b cursor-pointer transition-all"
                style={{ borderColor: "var(--border)", background: hoveredRow === row.metric ? "var(--muted)" : "var(--card)" }}
                onMouseEnter={() => setHoveredRow(row.metric)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => setOpenClaim(row.claimKey)}
              >
                <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{row.label}</div>
                <div>
                  <div className="font-mono font-semibold text-sm" style={{ color: "var(--foreground)" }}>{row.value}</div>
                  {row.median && (
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Median: {row.median}</div>
                  )}
                </div>
                <div className="font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>{row.topQuartile}</div>
                <div className="flex items-center gap-2">
                  <StatusPill status={row.status} />
                  {hoveredRow === row.metric && (
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>View source →</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Key insight */}
          <div className="rounded-xl p-5 border-l-4" style={{ background: "var(--navy)", borderLeftColor: "var(--green)" }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--green)" }}>
              Growth Intelligence Analysis
            </div>
            <p className="text-base font-medium leading-relaxed mb-2" style={{ color: "#E2EAF4" }}>{data.insight.headline}</p>
            <p className="text-sm leading-relaxed mb-3" style={{ color: "#7A98B4" }}>{data.insight.body}</p>
            <div className="flex items-center gap-4">
              <button className="text-xs font-semibold" style={{ color: "var(--green)" }} onClick={() => setOpenClaim(data.insight.claimKey)}>
                View methodology and sources →
              </button>
              {baselineHref && (
                <Link className="text-xs font-semibold" style={{ color: "#5A7A96" }} href={baselineHref}>
                  See full baseline →
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {data.radar.length >= 3 && (
            <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>Performance Radar</div>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={data.radar}>
                  <PolarGrid stroke="#E2E8F0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "#64748B" }} />
                  <Radar name="Cohort median" dataKey="median" stroke="#CBD5E1" fill="#CBD5E1" fillOpacity={0.2} strokeWidth={1.5} />
                  <Radar name={companyName} dataKey="company" stroke="#155A3C" fill="#155A3C" fillOpacity={0.35} strokeWidth={2} />
                  <Tooltip
                    formatter={(value) => [`${value}% of top quartile`]}
                    contentStyle={{ background: "white", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "11px" }}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-1 justify-center">
                {[
                  ["var(--green)", companyName],
                  ["#CBD5E1", "Cohort median"],
                ].map(([color, label]) => (
                  <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <div className="w-3 h-0.5 rounded" style={{ background: color }} />
                    {label}
                  </div>
                ))}
              </div>
              <div className="text-xs text-center mt-2" style={{ color: "var(--muted-foreground)" }}>
                Scaled to top-quartile performance (100).
              </div>
            </div>
          )}

          {scoreBreakdown && scoreBreakdown.length > 0 && (
            <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="text-sm font-semibold mb-4" style={{ color: "var(--foreground)" }}>Score Breakdown</div>
              <div className="space-y-3">
                {scoreBreakdown.map(({ label, score }, i) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
                      <span className="font-mono font-semibold" style={{ color: "var(--foreground)" }}>{score}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${barsReady ? score : 0}%`,
                          background: score >= 75 ? "var(--green)" : score >= 55 ? "var(--amber)" : "var(--red)",
                          transition: `width ${0.6 + i * 0.1}s cubic-bezier(0.16, 1, 0.3, 1)`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Click any row to view sources and methodology.</div>
        {baselineHref && (
          <Link
            href={baselineHref}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--green)", color: "#fff" }}
          >
            View Baseline →
          </Link>
        )}
      </div>
    </div>
  );
}
