"use client";

import { useState } from "react";
import { BenchmarkComparisonCard } from "@/components/benchmarks/BenchmarkComparisonCard";
import { inputClass, inputStyle } from "@/components/benchmarks/ui";
import { compare } from "@/lib/benchmark-library/compare";
import type { CandidateRecord } from "@/lib/benchmark-library/match";
import { readNumber } from "@/lib/benchmark-library/records";
import { isMetricKey } from "@/lib/metrics";

/**
 * Shows exactly what a customer would see for one cohort of this version, using a value you type
 * for an imaginary company. Uses the same comparison code and card as real reports.
 */
export function ComparisonPreview({ groups }: { groups: { key: string; label: string; records: CandidateRecord[] }[] }) {
  const usable = groups.filter((g) => isMetricKey(g.records[0]!.metric));
  const [key, setKey] = useState(usable[0]?.key ?? "");
  const [raw, setRaw] = useState("");
  const group = usable.find((g) => g.key === key);
  const value = readNumber(raw);
  const first = group?.records[0];
  const c =
    group && first && isMetricKey(first.metric) && value !== null && !Number.isNaN(value)
      ? compare(
          { metric: first.metric, value, period: null, origin: "manual" },
          { status: "matched", metric: first.metric, quality: group.records.every((r) => r.definitionMatches) ? "strong" : "directional", selection: "auto", records: group.records, matchedOn: [], caveats: [], alternatives: [] },
        )
      : null;
  if (!usable.length) return <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Add a record for one of Growth Goaled&apos;s metrics to preview it.</p>;
  const head = group?.records[0];
  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap items-end">
        <label className="text-xs font-medium flex-1 min-w-60" style={{ color: "var(--muted-foreground)" }}>
          Cohort
          <select value={key} onChange={(e) => setKey(e.target.value)} className={`${inputClass} mt-1`} style={inputStyle}>
            {usable.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium w-48" style={{ color: "var(--muted-foreground)" }}>
          Example company value
          <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="e.g. 94" className={`${inputClass} mt-1`} style={inputStyle} />
        </label>
      </div>
      {head && !head.source.allowCustomerDisplay && <p className="text-xs" style={{ color: "var(--amber)" }}>The source&apos;s licence isn&apos;t marked as allowing customer display, so customers won&apos;t see this comparison.</p>}
      {c ? <BenchmarkComparisonCard c={c} preview /> : <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Type an example value to see the customer view.</p>}
    </div>
  );
}
