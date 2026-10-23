import { z } from "zod";
import { parseCsv } from "@/lib/file-profile";
import { isMetricKey, METRICS, type MetricKey } from "@/lib/metrics";

/**
 * Benchmark library rules shared by the advisor UI, CSV import and research.
 * Quartiles are stored direction-aware: `p25` is the weaker quartile boundary
 * and `p75` ("top quartile") the stronger one, so for lower-is-better metrics
 * (sales cycle, CAC payback, burn multiple) p75 is the smaller number.
 */

const money = z.coerce.number().finite().min(0);

export const cohortInputSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    stage: z.array(z.string().trim().min(1).max(40)).max(10),
    arr_min: money.optional(),
    arr_max: money.optional(),
    model: z.string().trim().max(80).optional(),
    gtm_motion: z.string().trim().max(80).optional(),
    companyCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((c) => c.arr_min === undefined || c.arr_max === undefined || c.arr_max >= c.arr_min, { message: "ARR max must be at least ARR min." });

export type CohortInput = z.infer<typeof cohortInputSchema>;

export const sourceInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  publisher: z.string().trim().max(200).optional(),
  url: z.url().max(1000).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  licenceNote: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Checks the three quartile values are in a sensible order for the metric's direction. */
export function quartileProblem(metric: MetricKey, q: { p25: number | null; median: number | null; p75: number | null }): string | null {
  if (q.p25 === null && q.median === null && q.p75 === null) return "No values given.";
  const lower = METRICS[metric].lowerIsBetter;
  const ordered = [q.p25, q.median, q.p75].filter((v): v is number => v !== null);
  for (let i = 1; i < ordered.length; i++) {
    const ok = lower ? ordered[i]! <= ordered[i - 1]! : ordered[i]! >= ordered[i - 1]!;
    if (!ok) {
      return lower
        ? `${METRICS[metric].label} is lower-is-better, so the top quartile should be the smallest value (p25 ≥ median ≥ top quartile).`
        : `Expected p25 ≤ median ≤ top quartile for ${METRICS[metric].label}.`;
    }
  }
  return null;
}

export const CSV_COLUMNS = ["metric", "p25", "median", "top_quartile", "sample_size", "period"] as const;

const UNIT_NOTE: Record<string, string> = {
  usd: "US dollars",
  percent: "percent (72 = 72%)",
  days: "days",
  months: "months",
  count: "count",
  ratio: "ratio (1.4 = 1.4x)",
};

/** Downloadable template: header, one example row, then the allowed metric keys as comments. */
export function csvTemplate(): string {
  const lines = [
    CSV_COLUMNS.join(","),
    "arr_growth,35,58,89,120,2026",
    "sales_cycle_days,110,78,61,120,2026",
    "",
    "# Delete these comment lines before importing. Leave a value blank if you don't have it.",
    "# top_quartile is the better-performing boundary: for lower-is-better metrics it is the SMALLER number.",
    "# Allowed metric keys:",
    ...Object.entries(METRICS).map(([k, m]) => `# ${k} - ${m.label}, ${UNIT_NOTE[m.unit]}${m.lowerIsBetter ? ", lower is better" : ""}`),
  ];
  return lines.join("\n") + "\n";
}

export type ParsedBenchmarkRow = {
  line: number;
  metric: MetricKey;
  p25: number | null;
  median: number | null;
  p75: number | null;
  sampleSize: number | null;
  period: string | null;
};

const num = (raw: string | undefined): number | null | "bad" => {
  const s = (raw ?? "").trim().replace(/[$,%\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : "bad";
};

/** Parses an advisory benchmark CSV. Bad rows are reported, never guessed at. */
export function parseBenchmarkCsv(text: string): { rows: ParsedBenchmarkRow[]; errors: { line: number; message: string }[] } {
  const all = parseCsv(text);
  const rows: ParsedBenchmarkRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const header = all[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const missing = CSV_COLUMNS.filter((c) => c !== "sample_size" && c !== "period" && !header.includes(c));
  if (missing.length) return { rows, errors: [{ line: 1, message: `Missing columns: ${missing.join(", ")}. Use the template.` }] };
  const col = (r: string[], name: string) => r[header.indexOf(name)];
  const seen = new Set<string>();

  all.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (r.every((c) => !c.trim()) || r[0]?.trim().startsWith("#")) return;
    const metric = (col(r, "metric") ?? "").trim();
    if (!isMetricKey(metric)) return errors.push({ line, message: `Unknown metric "${metric}".` });
    const p25 = num(col(r, "p25"));
    const median = num(col(r, "median"));
    const p75 = num(col(r, "top_quartile"));
    const size = header.includes("sample_size") ? num(col(r, "sample_size")) : null;
    if (p25 === "bad" || median === "bad" || p75 === "bad" || size === "bad") return errors.push({ line, message: "Values must be non-negative numbers." });
    if (size !== null && !Number.isInteger(size)) return errors.push({ line, message: "sample_size must be a whole number." });
    const problem = quartileProblem(metric, { p25, median, p75 });
    if (problem) return errors.push({ line, message: problem });
    const period = (header.includes("period") ? col(r, "period") : "")?.trim() || null;
    const key = `${metric}|${period ?? ""}`;
    if (seen.has(key)) return errors.push({ line, message: `Duplicate row for ${metric}${period ? ` (${period})` : ""}.` });
    seen.add(key);
    rows.push({ line, metric, p25, median, p75, sampleSize: size, period });
  });
  return { rows, errors };
}

/** Human-readable cohort criteria, e.g. for the Benchmark page. */
export function describeCriteria(c: { stage?: string[]; arr_min?: number; arr_max?: number; model?: string; gtm_motion?: string }): string {
  const usd = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`);
  const arr =
    c.arr_min !== undefined && c.arr_max !== undefined
      ? `ARR ${usd(c.arr_min)}–${usd(c.arr_max)}`
      : c.arr_min !== undefined
        ? `ARR ≥ ${usd(c.arr_min)}`
        : c.arr_max !== undefined
          ? `ARR ≤ ${usd(c.arr_max)}`
          : null;
  return [c.stage?.length ? c.stage.join(" / ") : null, arr, c.model, c.gtm_motion].filter(Boolean).join(" · ") || "No criteria set";
}
