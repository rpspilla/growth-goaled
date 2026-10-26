import { analyzeFinance } from "./finance";
import { analyzePipeline } from "./pipeline";
import { analyzeRevenue } from "./revenue";
import { toTable } from "./tables";
import type { CalculatedMetric, FileAnalysis } from "./types";

export type { CalculatedMetric, FileAnalysis, RevenueBridge, SegmentRow } from "./types";

/**
 * Runs every calculator over every sheet of a file and merges the results. When two sheets
 * produce the same metric, the one with more supporting rows wins and the other is noted.
 * Deterministic: the same file always gives the same figures.
 */
export function analyzeSheets(sheets: { name: string; rows: string[][] }[]): FileAnalysis {
  const out: FileAnalysis = { metrics: [], warnings: [] };
  const byMetric = new Map<string, CalculatedMetric>();
  for (const sheet of sheets) {
    const t = toTable(sheet);
    if (!t) continue;
    for (const run of [analyzeRevenue, analyzePipeline, analyzeFinance]) {
      const a = run(t);
      if (!a) continue;
      out.warnings.push(...a.warnings);
      for (const m of a.metrics) {
        const existing = byMetric.get(m.metric);
        if (!existing) byMetric.set(m.metric, m);
        else if (m.source.rows > existing.source.rows) {
          out.warnings.push(`${m.metric} found in both "${existing.source.sheet}" and "${m.source.sheet}"; used "${m.source.sheet}" (more rows).`);
          byMetric.set(m.metric, m);
        }
      }
      out.monthly ??= a.monthly;
      out.bridge ??= a.bridge;
      out.topCustomers ??= a.topCustomers;
      out.pipeline ??= a.pipeline;
      if (a.segments?.length) out.segments = [...(out.segments ?? []), ...a.segments];
    }
  }
  out.metrics = [...byMetric.values()];
  return out;
}
