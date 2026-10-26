import { parseDateCell } from "@/lib/file-profile";
import { findColumn, median, parseNumber, round, type Table } from "./tables";
import type { CalculatedMetric, FileAnalysis, SegmentRow } from "./types";

/**
 * Opportunities from a CRM export: one row per deal with a stage or outcome, amount, created
 * and close dates, and optionally owner, source and segment. Win rate and cycle use deals
 * closed in the 12 months to the latest close date in the file (not today), so re-running on
 * the same file gives the same answer.
 */

const STAGE = [/^(stage|deal stage|status|outcome|result)$/i, /stage|status|outcome/i];
const AMOUNT = [/^(amount|deal amount|value|deal value|acv|arr)$/i, /amount|value|acv/i];
const CREATED = [/^(created|create date|created date|created at|opened)$/i, /creat|open(ed)? date/i];
const CLOSED = [/^(close date|closed date|closed at|closed|close)$/i, /clos/i];
const OWNER = [/^(owner|deal owner|rep|ae|account executive|sales rep)$/i, /owner|rep\b/i];
const DIMENSIONS: [string, RegExp[]][] = [
  ["Source", [/^(source|lead source|channel|original source)$/i, /source|channel/i]],
  ["Segment", [/^(segment|customer segment|market segment)$/i, /segment/i]],
  ["Industry", [/^(industry|vertical)$/i, /industry|vertical/i]],
  ["Company size", [/^(company size|size|employees|employee band)$/i, /size|employees/i]],
];

const outcome = (s: string) => (/closed[\s-]*won|^won$|\bwon\b/i.test(s) ? "won" : /closed[\s-]*lost|^lost$|\blost\b|disqualif/i.test(s) ? "lost" : "open");
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
const SMALL = 5;

type Deal = { outcome: "won" | "lost" | "open"; amount: number | null; created: string | null; closed: string | null; owner: string; dims: Record<string, string> };

export function analyzePipeline(t: Table): FileAnalysis | null {
  const si = findColumn(t.header, STAGE);
  const ai = findColumn(t.header, AMOUNT);
  if (si < 0 || ai < 0) return null;
  const ci = findColumn(t.header, CREATED);
  const di = findColumn(t.header, CLOSED);
  const oi = findColumn(t.header, OWNER);
  const dims = DIMENSIONS.map(([name, p]) => [name, findColumn(t.header, p)] as const).filter(([, i]) => i >= 0 && i !== si && i !== ai);
  const deals: Deal[] = t.rows
    .map((r) => ({
      outcome: outcome(r[si] ?? "") as Deal["outcome"],
      amount: parseNumber(r[ai]),
      created: ci >= 0 ? parseDateCell(r[ci] ?? "") : null,
      closed: di >= 0 ? parseDateCell(r[di] ?? "") : null,
      owner: oi >= 0 ? (r[oi] ?? "").trim() : "",
      dims: Object.fromEntries(dims.map(([name, i]) => [name, (r[i] ?? "").trim() || "Unknown"])),
    }))
    .filter((d) => d.amount !== null || d.outcome !== "open");
  if (deals.length < 3) return null;
  const warnings: string[] = [];
  const closedDates = deals.map((d) => d.closed).filter((d): d is string => Boolean(d)).sort();
  const asOf = closedDates.at(-1) ?? null;
  const windowStart = asOf ? new Date(Date.parse(asOf) - 365 * 86_400_000).toISOString().slice(0, 10) : null;
  const inWindow = (d: Deal) => d.outcome !== "open" && (!asOf || !d.closed || d.closed >= windowStart!);
  const closed = deals.filter(inWindow);
  const won = closed.filter((d) => d.outcome === "won");
  const lost = closed.filter((d) => d.outcome === "lost");
  const period = asOf ? `${windowStart} to ${asOf}` : "All closed deals in the file";
  if (!asOf) warnings.push(`${t.sheet}: no close dates found, so win rate uses every closed deal regardless of when it closed.`);
  const source = { sheet: t.sheet, rows: t.rows.length, columns: [t.header[si]!, t.header[ai]!, ...(ci >= 0 ? [t.header[ci]!] : []), ...(di >= 0 ? [t.header[di]!] : [])] };
  const metrics: CalculatedMetric[] = [];

  if (won.length + lost.length >= 1) {
    metrics.push({ metric: "win_rate", value: round((won.length / (won.length + lost.length)) * 100), period, method: `Won ÷ (won + lost) for deals closed in the period (${won.length} won, ${lost.length} lost).`, source, sampleSize: won.length + lost.length });
    if (won.length + lost.length < 10) warnings.push(`${t.sheet}: only ${won.length + lost.length} closed deals, so the win rate is directional.`);
  }
  const cycles = won.filter((d) => d.created && d.closed).map((d) => days(d.created!, d.closed!)).filter((x) => x >= 0);
  const mc = median(cycles);
  if (mc !== null) metrics.push({ metric: "sales_cycle_days", value: Math.round(mc), period, method: `Median days from created to close for ${cycles.length} won deals.`, source, sampleSize: cycles.length });

  // Founder share: owners named "founder"/"CEO" are the only safe signal; we don't guess names.
  const founderish = (o: string) => /founder|ceo|co-?founder/i.test(o);
  if (oi >= 0 && won.length && won.some((d) => founderish(d.owner))) {
    const share = (won.filter((d) => founderish(d.owner)).length / won.length) * 100;
    metrics.push({ metric: "founder_closed_share", value: round(share), period, method: `Share of won deals whose owner is labelled founder or CEO (${won.length} won deals).`, source: { ...source, columns: [...source.columns, t.header[oi]!] }, sampleSize: won.length });
  } else if (oi >= 0) warnings.push(`${t.sheet}: deal owners aren't labelled as founder or CEO, so founder involvement can't be measured from this file.`);

  const segment = (key: (d: Deal) => string): SegmentRow[] => {
    const groups = new Map<string, Deal[]>();
    for (const d of deals) groups.set(key(d), [...(groups.get(key(d)) ?? []), d]);
    return [...groups.entries()]
      .map(([name, ds]) => {
        const w = ds.filter((d) => inWindow(d) && d.outcome === "won");
        const l = ds.filter((d) => inWindow(d) && d.outcome === "lost");
        const amounts = w.map((d) => d.amount).filter((a): a is number => a !== null);
        const cyc = w.filter((d) => d.created && d.closed).map((d) => days(d.created!, d.closed!));
        return {
          name,
          won: w.length,
          lost: l.length,
          open: ds.filter((d) => d.outcome === "open").length,
          winRate: w.length + l.length ? round((w.length / (w.length + l.length)) * 100) : null,
          avgWonAmount: amounts.length ? round(amounts.reduce((a, b) => a + b, 0) / amounts.length, 2) : null,
          medianCycleDays: median(cyc) !== null ? Math.round(median(cyc)!) : null,
          smallSample: w.length + l.length < SMALL,
        };
      })
      .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));
  };
  const segments = dims.map(([name]) => ({ dimension: name, rows: segment((d) => d.dims[name]!) }));
  if (oi >= 0) segments.push({ dimension: "Owner", rows: segment((d) => d.owner || "Unassigned") });

  const open = deals.filter((d) => d.outcome === "open");
  return {
    metrics,
    segments: segments.filter((s) => s.rows.length > 1),
    pipeline: { openCount: open.length, openAmount: round(open.reduce((a, d) => a + (d.amount ?? 0), 0), 2), wonCount: won.length, lostCount: lost.length, asOf: asOf ?? "unknown" },
    warnings,
  };
}
