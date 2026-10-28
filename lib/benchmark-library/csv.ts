import { parseCsv } from "@/lib/file-profile";
import { crossRecordIssues, dedupeKey, type Issue, type RawRecord, type RecordInput, validateRecord } from "./records";

/**
 * CSV import for benchmark records: the template, column mapping and a row-by-row preview.
 * Nothing here writes; the import action saves accepted rows to a draft version after the
 * administrator has seen this preview.
 */

export type CsvField = keyof RawRecord;

/** Template columns in order, the field each fills, whether it's required, and names we also recognise. */
export const CSV_FIELDS: { column: string; field: CsvField; required: boolean; aliases: string[]; help: string }[] = [
  { column: "metric", field: "metric", required: true, aliases: ["metric_id", "metric_key"], help: "Growth Goaled metric key (e.g. nrr) or the source's own identifier" },
  { column: "display_name", field: "displayName", required: false, aliases: ["name", "metric_name"], help: "Shown to customers; defaults to Growth Goaled's name for known metrics" },
  { column: "definition", field: "definition", required: true, aliases: ["metric_definition"], help: "How the source defines and calculates it" },
  { column: "definition_matches", field: "definitionMatches", required: false, aliases: ["definition_compatible"], help: "yes if the definition matches Growth Goaled's; otherwise comparisons are directional" },
  { column: "unit", field: "unit", required: true, aliases: [], help: "percent, usd, ratio, days, months, count or other" },
  { column: "value_type", field: "valueType", required: false, aliases: [], help: "percentage, currency, ratio, duration, count or other (inferred from unit if blank)" },
  { column: "statistic", field: "statistic", required: true, aliases: ["stat", "statistic_type"], help: "median, mean, percentile, min, max or range" },
  { column: "percentile", field: "percentile", required: false, aliases: ["pct"], help: "1–99, only when statistic = percentile" },
  { column: "value", field: "value", required: false, aliases: [], help: "The value (percent as 95 for 95%)" },
  { column: "value_low", field: "valueLow", required: false, aliases: ["low"], help: "Range only" },
  { column: "value_high", field: "valueHigh", required: false, aliases: ["high"], help: "Range only" },
  { column: "stages", field: "stages", required: false, aliases: ["stage", "company_stage"], help: "Semicolon-separated: Pre-seed; Seed; Series A; Series B; Series C+" },
  { column: "arr_min", field: "arrMin", required: false, aliases: [], help: "US dollars, e.g. 1000000 or 1M" },
  { column: "arr_max", field: "arrMax", required: false, aliases: [], help: "US dollars" },
  { column: "industry", field: "industry", required: false, aliases: ["vertical"], help: "" },
  { column: "business_model", field: "businessModel", required: false, aliases: ["model"], help: "e.g. B2B SaaS" },
  { column: "pricing_model", field: "pricingModel", required: false, aliases: [], help: "e.g. seat-based, usage-based" },
  { column: "customer_segment", field: "customerSegment", required: false, aliases: ["segment"], help: "e.g. SMB, Mid-market, Enterprise" },
  { column: "acv_min", field: "acvMin", required: false, aliases: [], help: "US dollars" },
  { column: "acv_max", field: "acvMax", required: false, aliases: [], help: "US dollars" },
  { column: "geography", field: "geography", required: false, aliases: ["region"], help: "" },
  { column: "period", field: "period", required: true, aliases: ["measurement_period"], help: "e.g. FY2025 or 2025-01 to 2025-12" },
  { column: "period_basis", field: "periodBasis", required: true, aliases: ["basis"], help: "annual, trailing_12_months, quarterly, monthly, point_in_time or other" },
  { column: "cohort_definition", field: "cohortDefinition", required: false, aliases: ["cohort"], help: "How the source defined the cohort" },
  { column: "sample_size", field: "sampleSize", required: false, aliases: ["n", "sample"], help: "Companies in the cohort, if published" },
  { column: "methodology", field: "methodology", required: false, aliases: ["methodology_notes"], help: "" },
  { column: "limitations", field: "limitations", required: false, aliases: [], help: "" },
];

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Guesses which column feeds which field. The administrator can change it before previewing. */
export function autoMap(header: string[]): Partial<Record<CsvField, number>> {
  const map: Partial<Record<CsvField, number>> = {};
  const h = header.map(norm);
  for (const f of CSV_FIELDS) {
    const i = h.findIndex((x) => x === f.column || f.aliases.includes(x));
    if (i >= 0) map[f.field] = i;
  }
  return map;
}

/**
 * Downloadable template. The example rows are placeholders, marked as such in every text field
 * and in their values (they must be replaced, and "PLACEHOLDER" fails nothing on its own, so the
 * comment lines tell the admin to delete them).
 */
export function csvTemplate(): string {
  const header = CSV_FIELDS.map((f) => f.column);
  const row = (o: Partial<Record<string, string>>) => header.map((c) => (o[c] ?? "").includes(",") ? `"${o[c]}"` : (o[c] ?? "")).join(",");
  return [
    "# Growth Goaled benchmark import template. Lines starting with # are ignored.",
    "# The two data rows below are PLACEHOLDERS with made-up numbers: replace them with values from your source, or delete them.",
    "# Required columns: metric, definition, unit, statistic, period, period_basis, and value (or value_low and value_high for a range).",
    ...CSV_FIELDS.map((f) => `# ${f.column}${f.required ? " (required)" : ""}${f.help ? `: ${f.help}` : ""}`),
    header.join(","),
    row({
      metric: "nrr",
      definition: "PLACEHOLDER: replace with the source's definition, e.g. ARR from customers 12 months ago today ÷ their ARR then",
      definition_matches: "no",
      unit: "percent",
      statistic: "median",
      value: "100",
      stages: "Series A",
      arr_min: "1000000",
      arr_max: "10000000",
      business_model: "B2B SaaS",
      period: "PLACEHOLDER FY",
      period_basis: "annual",
      cohort_definition: "PLACEHOLDER: replace with the source's cohort description",
      sample_size: "",
    }),
    row({
      metric: "nrr",
      definition: "PLACEHOLDER: replace with the source's definition, e.g. ARR from customers 12 months ago today ÷ their ARR then",
      definition_matches: "no",
      unit: "percent",
      statistic: "percentile",
      percentile: "75",
      value: "110",
      stages: "Series A",
      arr_min: "1000000",
      arr_max: "10000000",
      business_model: "B2B SaaS",
      period: "PLACEHOLDER FY",
      period_basis: "annual",
      cohort_definition: "PLACEHOLDER: replace with the source's cohort description",
    }),
  ].join("\n") + "\n";
}

export type PreviewRow = { line: number; raw: RawRecord; record: RecordInput | null; issues: Issue[]; status: "accepted" | "rejected" | "skipped" };

export type CsvPreview = {
  header: string[];
  map: Partial<Record<CsvField, number>>;
  /** Problems with the file as a whole (missing columns, no rows). */
  fileErrors: string[];
  rows: PreviewRow[];
  counts: { total: number; accepted: number; rejected: number; skipped: number };
};

/**
 * Reads the file with a column map and validates every row, including duplicates within the
 * file and against `existingKeys` (records already in the target version, which are skipped
 * rather than overwritten).
 */
export function previewCsv(text: string, map?: Partial<Record<CsvField, number>>, existingKeys: Set<string> = new Set()): CsvPreview {
  const lines = parseCsv(text.replace(/^﻿/, ""));
  // Comment lines (#…) and blank lines are ignored; keep their line numbers for messages.
  const numbered = lines.map((cells, i) => ({ cells, line: i + 1 })).filter(({ cells }) => !(cells[0] ?? "").trim().startsWith("#") && cells.some((c) => c.trim()));
  const headerRow = numbered[0];
  const header = headerRow?.cells.map((c) => c.trim()) ?? [];
  const m = map ?? autoMap(header);
  const fileErrors: string[] = [];
  if (!headerRow) fileErrors.push("The file is empty.");
  const missing = CSV_FIELDS.filter((f) => f.required && m[f.field] === undefined).map((f) => f.column);
  if (headerRow && missing.length) fileErrors.push(`No column mapped for: ${missing.join(", ")}. Map them below or use the template.`);
  const body = numbered.slice(1);
  if (headerRow && !body.length) fileErrors.push("The file has a header but no data rows.");
  if (fileErrors.length) return { header, map: m, fileErrors, rows: [], counts: { total: body.length, accepted: 0, rejected: 0, skipped: 0 } };

  const rows: PreviewRow[] = body.map(({ cells, line }) => {
    const raw: RawRecord = {};
    for (const f of CSV_FIELDS) {
      const i = m[f.field];
      if (i !== undefined) raw[f.field] = cells[i] ?? "";
    }
    const { record, issues } = validateRecord(raw);
    return { line, raw, record, issues, status: record ? "accepted" : "rejected" };
  });
  // Already in the version: skipped, never overwritten.
  for (const r of rows) {
    if (r.record && existingKeys.has(dedupeKey(r.record))) {
      r.status = "skipped";
      r.issues.push({ message: "Already in this version (same metric, statistic, cohort and period); skipped.", severity: "warning" });
    }
  }
  const valid = rows.filter((r) => r.status === "accepted").map((r) => ({ ...r.record!, ref: `line ${r.line}` }));
  for (const c of crossRecordIssues(valid)) {
    const row = rows.find((r) => `line ${r.line}` === c.ref)!;
    row.status = "rejected";
    row.issues.push({ message: c.message, severity: "error" });
  }
  const count = (s: PreviewRow["status"]) => rows.filter((r) => r.status === s).length;
  return { header, map: m, fileErrors, rows, counts: { total: rows.length, accepted: count("accepted"), rejected: count("rejected"), skipped: count("skipped") } };
}
