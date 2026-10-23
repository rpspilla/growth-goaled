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

/** Shape of tabular data: columns from the first non-empty row, row counts, and the span of dates found. */
export function profileSheets(sheets: { name: string; rows: string[][] }[]): FileProfile {
  let start: string | null = null;
  let end: string | null = null;
  const out: FileProfile["sheets"] = [];
  for (const sheet of sheets) {
    const rows = sheet.rows.filter((r) => r.some((c) => c.trim() !== ""));
    if (!rows.length) continue;
    const [header, ...body] = rows;
    out.push({ name: sheet.name, rows: body.length, columns: header!.map((c) => c.trim()).filter(Boolean).slice(0, 80) });
    // Dates can be cells or header labels (monthly columns)
    for (const cell of [...header!, ...body.flat()]) {
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
