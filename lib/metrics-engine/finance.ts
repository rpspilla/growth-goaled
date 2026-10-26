import { addMonths, findColumn, monthColumns, monthLabel, monthOf, parseNumber, round, type Table } from "./tables";
import type { CalculatedMetric, FileAnalysis } from "./types";

/**
 * Cash, burn and margin from a finance sheet: either a P&L-style layout (line items down the
 * first column, months across) or a long one (month | cash | burn | revenue | COGS …).
 */

const LINES: Record<string, RegExp> = {
  cash: /^(ending |closing )?cash( balance)?( at end of month)?$|^bank balance$/i,
  burn: /^(net )?burn( rate)?$|^net cash (outflow|burn)$/i,
  revenue: /^(total )?revenue$|^sales$/i,
  cogs: /^(total )?(cogs|cost of (goods sold|revenue|sales))$/i,
  expenses: /^total (operating )?expenses$|^total opex$/i,
};

function series(t: Table): Record<string, Map<string, number>> {
  const out: Record<string, Map<string, number>> = {};
  const months = monthColumns(t.header);
  if (months.length >= 2) {
    for (const r of t.rows) {
      const label = (r[0] ?? "").trim();
      const key = Object.keys(LINES).find((k) => LINES[k]!.test(label));
      if (!key || out[key]) continue;
      const s = new Map<string, number>();
      for (const [i, m] of months) {
        const v = parseNumber(r[i]);
        if (v !== null) s.set(m, v);
      }
      if (s.size) out[key] = s;
    }
    return out;
  }
  const mi = findColumn(t.header, [/^(month|period|date)$/i, /month|period/i]);
  if (mi < 0) return out;
  for (const key of Object.keys(LINES)) {
    const ci = t.header.findIndex((h) => LINES[key]!.test(h.trim()));
    if (ci < 0) continue;
    const s = new Map<string, number>();
    for (const r of t.rows) {
      const m = monthOf(r[mi]);
      const v = parseNumber(r[ci]);
      if (m && v !== null) s.set(m, v);
    }
    if (s.size) out[key] = s;
  }
  return out;
}

export function analyzeFinance(t: Table): FileAnalysis | null {
  const s = series(t);
  const metrics: CalculatedMetric[] = [];
  const warnings: string[] = [];
  const source = (cols: string[]) => ({ sheet: t.sheet, rows: t.rows.length, columns: cols });

  // Net burn: given directly, or expenses − revenue.
  let burn = s.burn ? new Map([...s.burn].map(([m, v]) => [m, Math.abs(v)])) : null;
  let burnMethod = "net burn as reported";
  if (!burn && s.expenses && s.revenue) {
    burn = new Map([...s.expenses].filter(([m]) => s.revenue!.has(m)).map(([m, v]) => [m, Math.abs(v) - s.revenue!.get(m)!]));
    burnMethod = "total expenses − revenue";
  }
  if (s.cash && burn) {
    const last = [...s.cash.keys()].sort().at(-1)!;
    const recent = [0, 1, 2].map((n) => burn!.get(addMonths(last, -n))).filter((v): v is number => v !== undefined);
    const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
    if (avg !== null && avg > 0) {
      metrics.push({
        metric: "runway_months",
        value: round(s.cash.get(last)! / avg),
        period: monthLabel(last),
        method: `${monthLabel(last)} cash ÷ average monthly net burn over the last ${recent.length} ${recent.length === 1 ? "month" : "months"} (${burnMethod}).`,
        source: source(["Cash", "Burn"]),
      });
    } else if (avg !== null) warnings.push(`${t.sheet}: net burn is zero or negative (cash-flow positive), so runway isn't limited by burn.`);
  }
  if (s.revenue && s.cogs) {
    const last = [...s.revenue.keys()].filter((m) => s.cogs!.has(m)).sort().slice(-3);
    const rev = last.reduce((a, m) => a + s.revenue!.get(m)!, 0);
    const cogs = last.reduce((a, m) => a + Math.abs(s.cogs!.get(m)!), 0);
    if (rev > 0) {
      metrics.push({
        metric: "gross_margin",
        value: round(((rev - cogs) / rev) * 100),
        period: `${monthLabel(last[0]!)} – ${monthLabel(last.at(-1)!)}`,
        method: `(Revenue − cost of revenue) ÷ revenue over the last ${last.length} months.`,
        source: source(["Revenue", "COGS"]),
      });
    }
  }
  return metrics.length || warnings.length ? { metrics, warnings } : null;
}
