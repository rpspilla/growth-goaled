import { isMetricKey, METRICS, type MetricKey, type MetricUnit } from "@/lib/metrics";

/**
 * Benchmark records: the vocabulary, validation and duplicate rules shared by manual entry,
 * CSV import and publishing. Pure, so every rule is unit-tested. Validation never guesses:
 * a value that can't be read is an error with a reason, not a default.
 */

export const STATISTICS = ["median", "mean", "percentile", "min", "max", "range"] as const;
export const VALUE_TYPES = ["percentage", "currency", "ratio", "duration", "count", "other"] as const;
export const UNITS = ["percent", "usd", "ratio", "days", "months", "count", "other"] as const;
export const PERIOD_BASES = ["annual", "trailing_12_months", "quarterly", "monthly", "point_in_time", "other"] as const;
/** Stages a benchmark cohort can name. The company profile's "Series B+" matches Series B and Series C+. */
export const STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Series C+"] as const;

export type Statistic = (typeof STATISTICS)[number];
export type ValueType = (typeof VALUE_TYPES)[number];
export type Unit = (typeof UNITS)[number];
export type PeriodBasis = (typeof PERIOD_BASES)[number];

export const STATISTIC_LABEL: Record<Statistic, string> = { median: "Median", mean: "Mean", percentile: "Percentile", min: "Minimum", max: "Maximum", range: "Range" };
export const PERIOD_BASIS_LABEL: Record<PeriodBasis, string> = {
  annual: "Annual",
  trailing_12_months: "Trailing 12 months",
  quarterly: "Quarterly",
  monthly: "Monthly",
  point_in_time: "Point in time",
  other: "Other",
};
export const UNIT_LABEL: Record<Unit, string> = { percent: "Percent", usd: "US dollars", ratio: "Ratio (x)", days: "Days", months: "Months", count: "Count", other: "Other" };

/** The value type each unit implies. */
export const VALUE_TYPE_FOR_UNIT: Record<Unit, ValueType> = { percent: "percentage", usd: "currency", ratio: "ratio", days: "duration", months: "duration", count: "count", other: "other" };

/** Units of Growth Goaled's metric dictionary, in benchmark terms. */
const UNIT_FOR_METRIC_UNIT: Record<MetricUnit, Unit> = { percent: "percent", usd: "usd", ratio: "ratio", days: "days", months: "months", count: "count" };
export const expectedUnit = (metric: MetricKey): Unit => UNIT_FOR_METRIC_UNIT[METRICS[metric].unit];

/**
 * Which reporting bases describe the same quantity as Growth Goaled's figure. A monthly growth
 * rate is not comparable with an annual one, so a benchmark on another basis is never matched.
 */
export const COMPATIBLE_BASES: Partial<Record<MetricKey, PeriodBasis[]>> = {
  arr_growth: ["annual", "trailing_12_months"],
  nrr: ["annual", "trailing_12_months"],
  grr: ["annual", "trailing_12_months"],
  mom_growth: ["monthly"],
  win_rate: ["annual", "trailing_12_months", "quarterly"],
  sales_cycle_days: ["annual", "trailing_12_months", "quarterly"],
  cac_payback_months: ["annual", "trailing_12_months", "quarterly"],
  magic_number: ["annual", "trailing_12_months", "quarterly"],
  burn_multiple: ["annual", "trailing_12_months", "quarterly"],
  ae_productivity: ["annual", "trailing_12_months"],
  quota_attainment: ["annual", "trailing_12_months", "quarterly"],
  gross_margin: ["annual", "trailing_12_months", "quarterly"],
  new_arr: ["annual", "trailing_12_months"],
  expansion_arr: ["annual", "trailing_12_months"],
  churned_arr: ["annual", "trailing_12_months"],
};
/** Levels measured at a moment (ARR, ACV, runway…) accept a point-in-time or annual basis. */
export const compatibleBases = (metric: MetricKey): PeriodBasis[] => COMPATIBLE_BASES[metric] ?? ["point_in_time", "annual", "trailing_12_months"];

export type RecordInput = {
  metric: string;
  displayName: string;
  definition: string;
  definitionMatches: boolean;
  unit: Unit;
  valueType: ValueType;
  statistic: Statistic;
  percentile: number | null;
  value: number | null;
  valueLow: number | null;
  valueHigh: number | null;
  stages: string[];
  arrMin: number | null;
  arrMax: number | null;
  industry: string | null;
  businessModel: string | null;
  pricingModel: string | null;
  customerSegment: string | null;
  acvMin: number | null;
  acvMax: number | null;
  geography: string | null;
  /** Founding years the cohort covers, inclusive. */
  foundedFrom: number | null;
  foundedTo: number | null;
  period: string;
  periodBasis: PeriodBasis;
  cohortDefinition: string | null;
  sampleSize: number | null;
  methodology: string | null;
  limitations: string | null;
};

export type Issue = { field?: string; message: string; severity: "error" | "warning" };

/** Raw text fields as typed into the form or read from a CSV row. */
export type RawRecord = Partial<Record<keyof RecordInput, string>>;

const text = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

/** "$1.2M", "35%", "1,200", "2.5k" → number; "" → null; anything else → NaN (reported, never guessed). */
export function readNumber(raw: string | undefined): number | null {
  const s = (raw ?? "").trim().replace(/[$,\s%]/g, "").replace(/x$/i, "");
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)([kKmMbB]?)$/);
  if (!m) return Number.NaN;
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[m[2]!.toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Number(m[1]) * scale;
}

function readBool(raw: string | undefined): boolean | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return false;
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
}

export function normaliseStage(raw: string): (typeof STAGES)[number] | null {
  const k = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  const map: Record<string, (typeof STAGES)[number]> = {
    "pre seed": "Pre-seed",
    preseed: "Pre-seed",
    seed: "Seed",
    "series a": "Series A",
    a: "Series A",
    "series b": "Series B",
    b: "Series B",
    "series c": "Series C+",
    "series c+": "Series C+",
    "series c plus": "Series C+",
  };
  return map[k] ?? null;
}

const pick = <T extends string>(raw: string | undefined, allowed: readonly T[]): T | null | undefined => {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return undefined;
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
};

/**
 * Reads and validates one record. Errors block saving; warnings are shown and kept with it.
 * Returns the parsed record only when there are no errors.
 */
export function validateRecord(raw: RawRecord): { record: RecordInput | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message, severity: "error" });
  const warn = (field: string, message: string) => issues.push({ field, message, severity: "warning" });

  // Template rows are marked PLACEHOLDER and must never be imported as data.
  if (Object.values(raw).some((v) => /placeholder/i.test(v ?? ""))) err("definition", "This row still contains PLACEHOLDER text from the template. Replace it with the source's values or delete the row.");

  const metric = (raw.metric ?? "").trim();
  if (!metric) err("metric", "Metric is required.");
  else if (!/^[a-z0-9_]+$/.test(metric)) err("metric", `Metric "${metric}" must be a lower-case identifier like nrr or arr_growth.`);
  const known = isMetricKey(metric) ? metric : null;
  if (metric && !known) warn("metric", `"${metric}" isn't one of Growth Goaled's metrics, so it will be stored but never matched to a company figure.`);

  const displayName = text(raw.displayName) ?? (known ? METRICS[known].label : null);
  if (!displayName) err("displayName", "Display name is required for metrics outside Growth Goaled's dictionary.");

  const definition = text(raw.definition);
  if (!definition) err("definition", "Definition is required: say exactly how the source calculates it.");
  const definitionMatches = readBool(raw.definitionMatches);
  if (definitionMatches === null) err("definitionMatches", "definition_matches must be yes or no.");

  const unitPick = pick(raw.unit, UNITS);
  if (unitPick === undefined) err("unit", "Unit is required (percent, usd, ratio, days, months, count or other).");
  else if (unitPick === null) err("unit", `Unknown unit "${raw.unit}". Use percent, usd, ratio, days, months, count or other.`);
  const unit = unitPick ?? null;
  if (unit && known && unit !== expectedUnit(known)) err("unit", `${METRICS[known].label} is measured in ${UNIT_LABEL[expectedUnit(known)].toLowerCase()}; this row says ${UNIT_LABEL[unit].toLowerCase()}.`);

  const vtPick = pick(raw.valueType, VALUE_TYPES);
  if (vtPick === null) err("valueType", `Unknown value type "${raw.valueType}".`);
  const valueType = vtPick ?? (unit ? VALUE_TYPE_FOR_UNIT[unit] : null);
  if (unit && valueType && valueType !== VALUE_TYPE_FOR_UNIT[unit]) err("valueType", `Value type ${valueType} doesn't fit unit ${unit} (expected ${VALUE_TYPE_FOR_UNIT[unit]}).`);

  const statPick = pick(raw.statistic, STATISTICS);
  if (statPick === undefined) err("statistic", "Statistic is required (median, mean, percentile, min, max or range).");
  else if (statPick === null) err("statistic", `Unknown statistic "${raw.statistic}".`);
  const statistic = statPick ?? null;

  const percentile = readNumber(raw.percentile);
  if (statistic === "percentile") {
    if (percentile === null) err("percentile", "Percentile statistics need the percentile (e.g. 25 or 75).");
    else if (!Number.isInteger(percentile) || percentile < 1 || percentile > 99) err("percentile", "Percentile must be a whole number from 1 to 99.");
  } else if (percentile !== null) err("percentile", "Only percentile statistics take a percentile. Use statistic = percentile, or leave it blank.");

  const value = readNumber(raw.value);
  const valueLow = readNumber(raw.valueLow);
  const valueHigh = readNumber(raw.valueHigh);
  for (const [f, v] of [["value", value], ["valueLow", valueLow], ["valueHigh", valueHigh]] as const) if (Number.isNaN(v)) err(f, `${f === "value" ? "Value" : f === "valueLow" ? "Low value" : "High value"} isn't a number.`);
  if (statistic === "range") {
    if (valueLow === null || valueHigh === null) err("valueLow", "A range needs both value_low and value_high.");
    else if (!Number.isNaN(valueLow) && !Number.isNaN(valueHigh) && valueLow > valueHigh) err("valueLow", "value_low is above value_high.");
    if (value !== null) err("value", "A range uses value_low and value_high, not value.");
  } else if (statistic) {
    if (value === null) err("value", "Value is required.");
    // A median or percentile may also keep the band the source published it as (e.g. 20–25%); the value is where it's plotted.
    if (statistic !== "median" && statistic !== "percentile" && (valueLow !== null || valueHigh !== null)) err("valueLow", "Only range, median and percentile statistics take value_low and value_high.");
    else if (value !== null && !Number.isNaN(value) && ((valueLow !== null && !Number.isNaN(valueLow) && valueLow > value) || (valueHigh !== null && !Number.isNaN(valueHigh) && valueHigh < value)))
      err("valueLow", "A published band must contain the value (value_low ≤ value ≤ value_high).");
  }
  const values = [value, valueLow, valueHigh].filter((v): v is number => v !== null && !Number.isNaN(v));
  if (unit === "percent") {
    if (values.some((v) => v < -100 || v > 1000)) err("value", "Percentages must be between -100 and 1000 (enter 95 for 95%).");
    else if (values.some((v) => v !== 0 && Math.abs(v) <= 1.5 && !Number.isInteger(v))) warn("value", "This looks like a fraction. Percentages are entered as 95 for 95%, not 0.95.");
  }
  if (unit && unit !== "percent" && unit !== "other" && values.some((v) => v < 0)) err("value", `${UNIT_LABEL[unit]} can't be negative.`);

  const stagesRaw = (raw.stages ?? "").split(/[;|,]/).map((s) => s.trim()).filter(Boolean);
  const stages: string[] = [];
  for (const s of stagesRaw) {
    const n = normaliseStage(s);
    if (n) stages.push(n);
    else err("stages", `Unknown stage "${s}". Use ${STAGES.join(", ")}.`);
  }

  const range = (lo: string, hi: string, label: string) => {
    const a = readNumber(raw[lo as keyof RawRecord]);
    const b = readNumber(raw[hi as keyof RawRecord]);
    if (Number.isNaN(a) || Number.isNaN(b)) err(lo, `${label} bounds must be numbers (e.g. 1M or 1000000).`);
    else if ((a ?? 0) < 0 || (b ?? 0) < 0) err(lo, `${label} bounds can't be negative.`);
    else if (a !== null && b !== null && a > b) err(lo, `${label} minimum is above the maximum.`);
    return [Number.isNaN(a) ? null : a, Number.isNaN(b) ? null : b] as const;
  };
  const [arrMin, arrMax] = range("arrMin", "arrMax", "ARR");
  const [acvMin, acvMax] = range("acvMin", "acvMax", "ACV");
  const year = (f: "foundedFrom" | "foundedTo") => {
    const v = readNumber(raw[f]);
    if (v === null) return null;
    if (Number.isNaN(v) || !Number.isInteger(v) || v < 1900 || v > 2100) {
      err(f, "Founding years must be four-digit years, e.g. 2018.");
      return null;
    }
    return v;
  };
  const foundedFrom = year("foundedFrom");
  const foundedTo = year("foundedTo");
  if (foundedFrom !== null && foundedTo !== null && foundedFrom > foundedTo) err("foundedFrom", "The first founding year is after the last.");

  const period = text(raw.period);
  if (!period) err("period", "Measurement period is required (e.g. FY2025 or 2025-01 to 2025-12).");
  const basisPick = pick(raw.periodBasis, PERIOD_BASES);
  if (basisPick === undefined) err("periodBasis", "Period basis is required (annual, trailing_12_months, quarterly, monthly, point_in_time or other).");
  else if (basisPick === null) err("periodBasis", `Unknown period basis "${raw.periodBasis}".`);
  const periodBasis = basisPick ?? null;
  if (known && periodBasis && !compatibleBases(known).includes(periodBasis))
    warn("periodBasis", `${METRICS[known].label} on a ${PERIOD_BASIS_LABEL[periodBasis].toLowerCase()} basis can't be compared with Growth Goaled's figure (${compatibleBases(known).map((b) => PERIOD_BASIS_LABEL[b].toLowerCase()).join(" or ")}), so it won't be matched.`);

  const sampleSize = readNumber(raw.sampleSize);
  if (Number.isNaN(sampleSize) || (sampleSize !== null && (!Number.isInteger(sampleSize) || sampleSize < 1))) err("sampleSize", "Sample size must be a whole number of at least 1.");
  if (sampleSize === null) warn("sampleSize", "No sample size: comparisons will say the sample isn't published.");
  if (!stages.length && arrMin === null && arrMax === null) warn("stages", "No stage or ARR range: this is a broad cohort and will only give directional comparisons.");
  if (!definitionMatches && !issues.some((i) => i.field === "definitionMatches")) warn("definitionMatches", "Not confirmed as matching Growth Goaled's definition, so comparisons will be labelled directional.");

  if (issues.some((i) => i.severity === "error")) return { record: null, issues };
  return {
    record: {
      metric,
      displayName: displayName!,
      definition: definition!,
      definitionMatches: definitionMatches!,
      unit: unit!,
      valueType: valueType!,
      statistic: statistic!,
      percentile: statistic === "percentile" ? percentile : null,
      value: statistic === "range" ? null : value,
      valueLow: statistic === "range" || statistic === "median" || statistic === "percentile" ? valueLow : null,
      valueHigh: statistic === "range" || statistic === "median" || statistic === "percentile" ? valueHigh : null,
      stages,
      arrMin,
      arrMax,
      industry: text(raw.industry),
      businessModel: text(raw.businessModel),
      pricingModel: text(raw.pricingModel),
      customerSegment: text(raw.customerSegment),
      acvMin,
      acvMax,
      geography: text(raw.geography),
      foundedFrom,
      foundedTo,
      period: period!,
      periodBasis: periodBasis!,
      cohortDefinition: text(raw.cohortDefinition),
      sampleSize: sampleSize as number | null,
      methodology: text(raw.methodology),
      limitations: text(raw.limitations),
    },
    issues,
  };
}

const lc = (s: string | null) => (s ?? "").trim().toLowerCase();

/** The cohort a record describes (everything but the metric and statistic). */
type CohortFields = Pick<RecordInput, "stages" | "arrMin" | "arrMax" | "industry" | "businessModel" | "pricingModel" | "customerSegment" | "acvMin" | "acvMax" | "geography"> &
  Partial<Pick<RecordInput, "foundedFrom" | "foundedTo">>;

export function cohortKey(r: CohortFields): string {
  const base = [[...r.stages].sort().join("+"), r.arrMin ?? "", r.arrMax ?? "", lc(r.industry), lc(r.businessModel), lc(r.pricingModel), lc(r.customerSegment), r.acvMin ?? "", r.acvMax ?? "", lc(r.geography)];
  // Founding years extend the key only when set, so keys of existing records don't change.
  if (r.foundedFrom != null || r.foundedTo != null) base.push(`founded:${r.foundedFrom ?? ""}-${r.foundedTo ?? ""}`);
  return base.join("|");
}

/** Two records with the same key in one version are duplicates. */
export function dedupeKey(r: RecordInput): string {
  return [r.metric, r.statistic, r.percentile ?? "", lc(r.period), r.periodBasis, cohortKey(r)].join("|");
}

/**
 * Checks across records of one version: duplicates, and cohort definitions that contradict each
 * other (the same cohort described two ways, or one description used for two different cohorts).
 */
export function crossRecordIssues(records: (RecordInput & { ref: string })[]): { ref: string; message: string }[] {
  const out: { ref: string; message: string }[] = [];
  const seen = new Map<string, string>();
  for (const r of records) {
    const k = dedupeKey(r);
    if (seen.has(k)) out.push({ ref: r.ref, message: `Duplicate of ${seen.get(k)}: same metric, statistic, cohort and period.` });
    else seen.set(k, r.ref);
  }
  const defByCohort = new Map<string, { def: string; ref: string }>();
  const cohortByDef = new Map<string, { key: string; ref: string }>();
  for (const r of records) {
    const key = cohortKey(r);
    const def = lc(r.cohortDefinition);
    if (!def) continue;
    const a = defByCohort.get(key);
    if (a && a.def !== def) out.push({ ref: r.ref, message: `Cohort described differently from ${a.ref} although the stage, ARR and other filters are the same.` });
    else if (!a) defByCohort.set(key, { def, ref: r.ref });
    const b = cohortByDef.get(def);
    if (b && b.key !== key) out.push({ ref: r.ref, message: `Same cohort description as ${b.ref} but different stage, ARR or other filters.` });
    else if (!b) cohortByDef.set(def, { key, ref: r.ref });
  }
  // Percentiles of one cohort must rise with the percentile.
  const byGroup = new Map<string, (RecordInput & { ref: string })[]>();
  for (const r of records) {
    if (r.statistic !== "percentile" && r.statistic !== "median") continue;
    const g = [r.metric, lc(r.period), r.periodBasis, cohortKey(r)].join("|");
    byGroup.set(g, [...(byGroup.get(g) ?? []), r]);
  }
  for (const rows of byGroup.values()) {
    const sorted = rows.map((r) => ({ r, p: r.statistic === "median" ? 50 : r.percentile! })).sort((a, b) => a.p - b.p);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.r.value! < sorted[i - 1]!.r.value!) {
        out.push({ ref: sorted[i]!.r.ref, message: `The ${sorted[i]!.p}th percentile (${sorted[i]!.r.value}) is below the ${sorted[i - 1]!.p}th (${sorted[i - 1]!.r.value}); percentiles must not decrease.` });
        break;
      }
    }
  }
  return out;
}

/** "p75", "median", "range". */
export function statisticLabel(r: { statistic: Statistic; percentile: number | null }): string {
  if (r.statistic === "percentile") return r.percentile === 50 ? "median" : `${r.percentile}th percentile`;
  return STATISTIC_LABEL[r.statistic].toLowerCase();
}

const usd = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);

/** "Series A · ARR $2M–$10M · B2B SaaS · North America". */
/** "founded 2018–2021", "founded 2018 or later", or null. */
export function foundedLabel(from: number | null | undefined, to: number | null | undefined): string | null {
  if (from != null && to != null) return from === to ? `founded ${from}` : `founded ${from}–${to}`;
  if (from != null) return `founded ${from} or later`;
  if (to != null) return `founded ${to} or earlier`;
  return null;
}

export function describeCohort(r: CohortFields): string {
  const band = (lo: number | null, hi: number | null, label: string) =>
    lo !== null && hi !== null ? `${label} ${usd(lo)}–${usd(hi)}` : lo !== null ? `${label} ≥ ${usd(lo)}` : hi !== null ? `${label} ≤ ${usd(hi)}` : null;
  return (
    [r.stages.length ? r.stages.join(" / ") : null, band(r.arrMin, r.arrMax, "ARR"), r.businessModel, r.pricingModel, r.industry, foundedLabel(r.foundedFrom, r.foundedTo), r.customerSegment, band(r.acvMin, r.acvMax, "ACV"), r.geography].filter(Boolean).join(" · ") ||
    "All companies in the source (no cohort filters)"
  );
}
