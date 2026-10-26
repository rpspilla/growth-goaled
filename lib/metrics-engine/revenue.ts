import { addMonths, findColumn, monthColumns, monthLabel, monthOf, monthsBetween, parseNumber, round, type Table } from "./tables";
import type { CalculatedMetric, FileAnalysis, RevenueBridge } from "./types";

/**
 * Recurring revenue from a founder's table, in code. Recognised shapes:
 *  - long:  month | [customer] | MRR (or revenue / ARR)
 *  - wide:  customer (or a "Total" row) | Jan 2026 | Feb 2026 | …
 * Amounts are treated as monthly recurring revenue unless the column or row says ARR/annual,
 * in which case they're divided by 12. ARR is always 12 × the latest month's MRR.
 */

const CUSTOMER = [/^(customer|account|client|company)( name)?$/i, /customer|account|client/i];
const AMOUNT = [/^mrr$/i, /\bmrr\b/i, /^arr$/i, /\barr\b/i, /recurring revenue/i, /^revenue$/i, /revenue|amount|billed|invoiced/i];
const MONTH = [/^(month|period|date)$/i, /month|period|date/i];
const TOTAL_ROW = /^(total|totals|grand total|total mrr|mrr|total revenue|revenue|recurring revenue|arr|total arr)$/i;
const NOT_CUSTOMER = /total|subtotal|cogs|cost|expense|margin|cash|burn|salar|payroll|opex|ebitda|profit|tax|headcount/i;

type Series = Map<string, Map<string, number>>; // customer → month → MRR

const annual = (label: string) => /\barr\b|annual/i.test(label);

function fromLong(t: Table): { perCustomer: Series | null; totals: Map<string, number>; columns: string[]; annualised: boolean } | null {
  const mi = findColumn(t.header, MONTH);
  const ai = findColumn(t.header, AMOUNT);
  if (mi < 0 || ai < 0 || mi === ai) return null;
  const ci = findColumn(t.header, CUSTOMER);
  const scale = annual(t.header[ai]!) ? 1 / 12 : 1;
  const totals = new Map<string, number>();
  const per: Series = new Map();
  let used = 0;
  for (const r of t.rows) {
    const m = monthOf(r[mi]);
    const v = parseNumber(r[ai]);
    if (!m || v === null) continue;
    used++;
    totals.set(m, (totals.get(m) ?? 0) + v * scale);
    if (ci >= 0) {
      const name = (r[ci] ?? "").trim();
      if (!name || NOT_CUSTOMER.test(name)) continue;
      const s = per.get(name) ?? new Map<string, number>();
      s.set(m, (s.get(m) ?? 0) + v * scale);
      per.set(name, s);
    }
  }
  if (used < 2) return null;
  return { perCustomer: ci >= 0 && per.size >= 2 ? per : null, totals, columns: [t.header[mi]!, ...(ci >= 0 ? [t.header[ci]!] : []), t.header[ai]!], annualised: scale !== 1 };
}

function fromWide(t: Table): { perCustomer: Series | null; totals: Map<string, number>; columns: string[]; annualised: boolean } | null {
  const months = monthColumns(t.header);
  if (months.length < 2) return null;
  const labelCol = t.header.findIndex((_, i) => !months.some(([mi]) => mi === i));
  if (labelCol < 0) return null;
  const sheetAnnual = annual(t.sheet) || annual(t.header[labelCol] ?? "");
  const per: Series = new Map();
  let totalRow: Map<string, number> | null = null;
  let totalLabel = "";
  let totalAnnual = false;
  let financeLike = 0;
  for (const r of t.rows) {
    const label = (r[labelCol] ?? "").trim();
    if (!label) continue;
    const values = new Map<string, number>();
    for (const [i, m] of months) {
      const v = parseNumber(r[i]);
      if (v !== null) values.set(m, v);
    }
    if (!values.size) continue;
    if (TOTAL_ROW.test(label)) {
      if (!totalRow) {
        totalRow = values;
        totalLabel = label;
        totalAnnual = annual(label);
      }
      continue;
    }
    if (NOT_CUSTOMER.test(label)) {
      financeLike++;
      continue;
    }
    per.set(label, values);
  }
  // A P&L-style sheet (revenue, COGS, cash…) is finance, not a customer table: its "Revenue"
  // line isn't necessarily recurring, so only an explicit MRR/ARR row counts there.
  if (financeLike >= 2 && per.size < 3 && !/mrr|arr|recurring/i.test(totalLabel)) return null;
  const scale = sheetAnnual || totalAnnual ? 1 / 12 : 1;
  const scaled = (s: Map<string, number>) => new Map([...s].map(([m, v]) => [m, v * scale]));
  const perCustomer: Series | null = per.size >= 2 ? new Map([...per].map(([k, v]) => [k, scaled(v)])) : null;
  let totals: Map<string, number>;
  if (totalRow) totals = scaled(totalRow);
  else if (perCustomer) {
    totals = new Map();
    for (const s of perCustomer.values()) for (const [m, v] of s) totals.set(m, (totals.get(m) ?? 0) + v);
  } else return null;
  return { perCustomer, totals, columns: [t.header[labelCol]!, ...months.map(([, m]) => monthLabel(m))].slice(0, 6), annualised: scale !== 1 };
}

const at = (s: Map<string, number>, m: string) => s.get(m) ?? 0;

/** ARR bridge over [from, to]: customers' MRR at the start vs. the end, annualised. */
export function bridge(per: Series, from: string, to: string): RevenueBridge {
  let start = 0, end = 0, nw = 0, exp = 0, con = 0, churn = 0, cs = 0, ce = 0, cn = 0, cc = 0;
  for (const s of per.values()) {
    const a = at(s, from);
    const b = at(s, to);
    start += a;
    end += b;
    if (a > 0) cs++;
    if (b > 0) ce++;
    if (a <= 0 && b > 0) {
      nw += b;
      cn++;
    } else if (a > 0 && b <= 0) {
      churn += a;
      cc++;
    } else if (b > a) exp += b - a;
    else if (b < a) con += a - b;
  }
  const y = (v: number) => round(v * 12, 2);
  return { from, to, startArr: y(start), newArr: y(nw), expansionArr: y(exp), contractionArr: y(con), churnedArr: y(churn), endArr: y(end), customersStart: cs, customersEnd: ce, customersNew: cn, customersChurned: cc };
}

export function analyzeRevenue(t: Table): FileAnalysis | null {
  const parsed = fromLong(t) ?? fromWide(t);
  if (!parsed) return null;
  const months = [...parsed.totals.keys()].sort();
  if (months.length < 2) return null;
  const warnings: string[] = [];
  // Gaps in the monthly series make growth figures unreliable.
  const gaps = months.slice(1).filter((m, i) => monthsBetween(months[i]!, m) !== 1).length;
  if (gaps) warnings.push(`${t.sheet}: the monthly series has ${gaps} missing ${gaps === 1 ? "month" : "months"}; growth figures use the months present.`);
  const last = months.at(-1)!;
  const mrr = parsed.totals.get(last)!;
  const source = { sheet: t.sheet, rows: t.rows.length, columns: parsed.columns };
  const basis = parsed.annualised ? "annual amounts ÷ 12" : "monthly recurring revenue";
  const metrics: CalculatedMetric[] = [
    { metric: "arr", value: round(mrr * 12, 2), period: monthLabel(last), method: `12 × ${monthLabel(last)} MRR (${basis}).`, source },
  ];

  const back = (n: number) => (parsed.totals.has(addMonths(last, -n)) ? parsed.totals.get(addMonths(last, -n))! : null);
  const m3 = back(3);
  if (m3 && m3 > 0) {
    metrics.push({ metric: "mom_growth", value: round((Math.pow(mrr / m3, 1 / 3) - 1) * 100), period: `${monthLabel(addMonths(last, -3))} – ${monthLabel(last)}`, method: "Compound average monthly growth in MRR over the last 3 months.", source });
  } else {
    const prev = back(1);
    if (prev && prev > 0) metrics.push({ metric: "mom_growth", value: round((mrr / prev - 1) * 100), period: `${monthLabel(addMonths(last, -1))} – ${monthLabel(last)}`, method: "Change in MRR over the last month (fewer than 4 months of data).", source });
  }
  const y1 = back(12);
  if (y1 && y1 > 0) metrics.push({ metric: "arr_growth", value: round((mrr / y1 - 1) * 100), period: `${monthLabel(addMonths(last, -12))} – ${monthLabel(last)}`, method: "Year-over-year change in MRR.", source });

  const out: FileAnalysis = { metrics, monthly: months.map((m) => ({ month: m, mrr: round(parsed.totals.get(m)!, 2) })), warnings };

  const per = parsed.perCustomer;
  if (per) {
    const from = parsed.totals.has(addMonths(last, -12)) ? addMonths(last, -12) : months[0]!;
    const b = bridge(per, from, last);
    out.bridge = b;
    const window = `${monthLabel(from)} – ${monthLabel(last)}`;
    const span = monthsBetween(from, last);
    const note = span < 12 ? ` Covers ${span} months, not a full year.` : "";
    const src = { ...source, rows: per.size };
    metrics.push(
      { metric: "new_arr", value: b.newArr, period: window, method: `ARR from customers with no revenue in ${monthLabel(from)} and revenue in ${monthLabel(last)}.${note}`, source: src, sampleSize: b.customersNew },
      { metric: "expansion_arr", value: b.expansionArr, period: window, method: `ARR increase from customers paying in both months.${note}`, source: src },
      { metric: "churned_arr", value: b.churnedArr, period: window, method: `ARR from customers paying in ${monthLabel(from)} and not in ${monthLabel(last)}.${note}`, source: src, sampleSize: b.customersChurned },
      { metric: "customers", value: b.customersEnd, period: monthLabel(last), method: `Customers with revenue in ${monthLabel(last)}.`, source: src },
    );
    if (b.startArr > 0) {
      const nrr = ((b.startArr + b.expansionArr - b.contractionArr - b.churnedArr) / b.startArr) * 100;
      const grr = ((b.startArr - b.contractionArr - b.churnedArr) / b.startArr) * 100;
      metrics.push(
        { metric: "nrr", value: round(nrr), period: window, method: `(Starting ARR + expansion − contraction − churn) ÷ starting ARR, for the ${b.customersStart} customers paying in ${monthLabel(from)}.${note}`, source: src, sampleSize: b.customersStart },
        { metric: "grr", value: round(grr), period: window, method: `(Starting ARR − contraction − churn) ÷ starting ARR, for the ${b.customersStart} customers paying in ${monthLabel(from)}.${note}`, source: src, sampleSize: b.customersStart },
      );
    }
    if (b.customersEnd > 0 && b.endArr > 0) {
      const ranked = [...per.entries()].map(([name, s]) => ({ name, arr: at(s, last) * 12 })).filter((c) => c.arr > 0).sort((x, y) => y.arr - x.arr);
      out.topCustomers = ranked.slice(0, 10).map((c) => ({ name: c.name, arr: round(c.arr, 2), share: round((c.arr / b.endArr) * 100) }));
      metrics.push(
        { metric: "top_customer_concentration", value: round((ranked[0]!.arr / b.endArr) * 100), period: monthLabel(last), method: "Largest customer's share of ARR.", source: src, sampleSize: b.customersEnd },
        { metric: "acv", value: round(b.endArr / b.customersEnd, 2), period: monthLabel(last), method: "ARR ÷ paying customers (average annual revenue per customer).", source: src, sampleSize: b.customersEnd },
      );
    }
    if (span < 12) warnings.push(`${t.sheet}: retention covers ${span} months, not a full year, so NRR and GRR aren't annual figures.`);
  }
  return out;
}
