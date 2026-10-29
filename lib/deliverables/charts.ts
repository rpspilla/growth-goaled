import { z } from "zod";
import type { FileAnalysis } from "@/lib/metrics-engine";

/**
 * Chart data saved with a Decision Brief (visual-founder-flow brief §5): the structured tables
 * the metrics engine computed from the founder's files when the brief was built, so the Results
 * page can draw its signature charts from exactly what the brief rests on. Nothing here is
 * written by the model; a later file never changes an existing version's charts.
 */

const bridge = z.object({
  from: z.string(),
  to: z.string(),
  startArr: z.number(),
  newArr: z.number(),
  expansionArr: z.number(),
  contractionArr: z.number(),
  churnedArr: z.number(),
  endArr: z.number(),
  customersStart: z.number(),
  customersEnd: z.number(),
  source: z.string(),
});
const segmentRow = z.object({ name: z.string(), won: z.number(), lost: z.number(), winRate: z.number().nullable(), avgWonAmount: z.number().nullable(), smallSample: z.boolean() });

export const briefChartsSchema = z.object({
  bridge: bridge.nullable().default(null),
  monthly: z.object({ points: z.array(z.object({ month: z.string(), mrr: z.number() })), source: z.string() }).nullable().default(null),
  /** Closed deals grouped by a dimension (Segment, Source, Industry, Company size, Owner). */
  segments: z.array(z.object({ dimension: z.string(), rows: z.array(segmentRow), source: z.string() })).default([]),
  pipeline: z.object({ won: z.number(), lost: z.number(), open: z.number(), openAmount: z.number(), source: z.string() }).nullable().default(null),
});

export type BriefCharts = z.infer<typeof briefChartsSchema>;

export const EMPTY_CHARTS: BriefCharts = { bridge: null, monthly: null, segments: [], pipeline: null };

/**
 * Picks, across every analysed file, the best table for each chart: the per-customer bridge with
 * the most starting customers (an aggregate monthly sheet reads as a single "customer", so one-
 * customer bridges are ignored), the longest MRR series, and for each segment dimension the
 * grouping with the most closed deals.
 */
export function chartsFromAnalyses(files: { filename: string; analysis: FileAnalysis }[]): BriefCharts {
  const out: BriefCharts = { ...EMPTY_CHARTS, segments: [] };
  for (const { filename, analysis: a } of files) {
    const b = a.bridge;
    if (b && b.customersStart >= 2 && (!out.bridge || b.customersStart > out.bridge.customersStart)) {
      out.bridge = { from: b.from, to: b.to, startArr: b.startArr, newArr: b.newArr, expansionArr: b.expansionArr, contractionArr: b.contractionArr, churnedArr: b.churnedArr, endArr: b.endArr, customersStart: b.customersStart, customersEnd: b.customersEnd, source: filename };
    }
    if (a.monthly && a.monthly.length >= 3 && (!out.monthly || a.monthly.length > out.monthly.points.length)) out.monthly = { points: a.monthly, source: filename };
    for (const s of a.segments ?? []) {
      const rows = s.rows.filter((r) => r.won + r.lost > 0).map((r) => ({ name: r.name, won: r.won, lost: r.lost, winRate: r.winRate, avgWonAmount: r.avgWonAmount, smallSample: r.smallSample }));
      if (rows.length < 2) continue;
      const closed = rows.reduce((n, r) => n + r.won + r.lost, 0);
      const i = out.segments.findIndex((x) => x.dimension === s.dimension);
      const have = i >= 0 ? out.segments[i]!.rows.reduce((n, r) => n + r.won + r.lost, 0) : -1;
      if (closed > have) {
        const entry = { dimension: s.dimension, rows, source: filename };
        if (i >= 0) out.segments[i] = entry;
        else out.segments.push(entry);
      }
    }
    const p = a.pipeline;
    if (p && p.wonCount + p.lostCount > 0 && (!out.pipeline || p.wonCount + p.lostCount > out.pipeline.won + out.pipeline.lost)) {
      out.pipeline = { won: p.wonCount, lost: p.lostCount, open: p.openCount, openAmount: p.openAmount, source: filename };
    }
  }
  return out;
}
