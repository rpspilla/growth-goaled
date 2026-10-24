import type { FileProfile } from "@/lib/db/schema";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Recognises common date cells and returns YYYY-MM-DD (day 01 when only a month is given). */
export function parseDateCell(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) return iso(+m[1]!, +m[2]!, m[3] ? +m[3] : 1);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // US month/day/year
  if (m) return iso(+m[3]!, +m[1]!, +m[2]!);
  m = s.toLowerCase().match(/^([a-z]{3})[a-z]*[\s\-']+(\d{2}|\d{4})$/); // "Jan 2026", "Jan-26"
  if (m && MONTHS.includes(m[1]!)) {
    const year = m[2]!.length === 2 ? 2000 + +m[2]! : +m[2]!;
    return iso(year, MONTHS.indexOf(m[1]!) + 1, 1);
  }
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const filled = (r: string[]) => r.filter((c) => c.trim() !== "").length;

/**
 * Index of the header row. Real spreadsheets often have a title, notes or a
 * blank band above the table, so the header is the first of the opening rows
 * that is about as wide as the table itself (at least two cells).
 */
export function headerRowIndex(rows: string[][]): number {
  const head = rows.slice(0, 15);
  const widest = Math.max(0, ...head.map(filled));
  if (widest < 2) return 0;
  const needed = Math.max(2, Math.ceil(widest * 0.6));
  const i = head.findIndex((r) => filled(r) >= needed);
  return i < 0 ? 0 : i;
}

const isLabel = (c: string) => {
  const t = c.trim();
  return t.length > 1 && t.length <= 80 && /[a-z]/i.test(t) && !parseDateCell(t) && !/^[$€£]?-?[\d,.]+%?$/.test(t);
};

/**
 * Shape of tabular data: the header row's columns, row labels down the first
 * column (P&Ls and key/value sheets put "Revenue", "ARR"… there), row counts,
 * and the span of dates found.
 */
export function profileSheets(sheets: { name: string; rows: string[][] }[]): FileProfile {
  let start: string | null = null;
  let end: string | null = null;
  const out: FileProfile["sheets"] = [];
  for (const sheet of sheets) {
    const rows = sheet.rows.filter((r) => r.some((c) => c.trim() !== ""));
    if (!rows.length) continue;
    const h = headerRowIndex(rows);
    const header = rows[h]!;
    const body = rows.slice(h + 1);
    const labels = [...new Set(body.map((r) => r.find((c) => c.trim() !== "") ?? "").filter(isLabel).map((c) => c.trim()))].slice(0, 100);
    out.push({ name: sheet.name, rows: body.length, columns: header.map((c) => c.trim()).filter(Boolean).slice(0, 80), labels });
    // Dates can be cells or header labels (monthly columns)
    for (const cell of [...header, ...body.flat()]) {
      const d = parseDateCell(cell);
      if (!d) continue;
      if (!start || d < start) start = d;
      if (!end || d > end) end = d;
    }
  }
  return { sheets: out, dateRange: start && end ? { start, end } : null };
}

/** Minimal CSV reader (quoted fields, commas, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
