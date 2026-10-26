import { headerRowIndex, parseDateCell } from "@/lib/file-profile";

/** A worksheet reduced to a header row and body rows (title rows and blank rows removed). */
export type Table = { sheet: string; header: string[]; rows: string[][] };

export function toTable(sheet: { name: string; rows: string[][] }): Table | null {
  const rows = sheet.rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) return null;
  const h = headerRowIndex(rows);
  return { sheet: sheet.name, header: rows[h]!.map((c) => c.trim()), rows: rows.slice(h + 1) };
}

/**
 * Parses a spreadsheet number: "$1,234.50", "(1,200)" (negative), "12%", "1.2k", "-" (zero).
 * Returns null for blanks and text.
 */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.trim();
  if (!s) return null;
  if (s === "-" || s === "–" || s === "—") return 0;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  const m = /^-?\s*[$€£]?\s*-?[\d,]*\.?\d+\s*(k|m)?\s*%?$/i.exec(s);
  if (!m) return null;
  let v = Number(s.replace(/[$€£,%\s]/g, "").replace(/k$/i, "").replace(/m$/i, ""));
  if (!Number.isFinite(v)) return null;
  if (m[1]?.toLowerCase() === "k") v *= 1_000;
  if (m[1]?.toLowerCase() === "m") v *= 1_000_000;
  return negative ? -Math.abs(v) : v;
}

/** First column whose header matches one of the patterns (in priority order). */
export function findColumn(header: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

/** "YYYY-MM" for a date-like cell, else null. */
export const monthOf = (raw: string | undefined) => (raw ? (parseDateCell(raw)?.slice(0, 7) ?? null) : null);

/** Column indexes whose headers are months (a "wide" monthly table). */
export const monthColumns = (header: string[]) => header.map((h, i) => [i, monthOf(h)] as const).filter((x): x is readonly [number, string] => x[1] !== null);

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m! - 1]} ${y}`;
};

/** Months between two "YYYY-MM" values (b − a). */
export const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb! - ya!) * 12 + (mb! - ma!);
};

export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y! * 12 + (m! - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

export const round = (v: number, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;
