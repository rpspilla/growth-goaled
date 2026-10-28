import type { MetricKey } from "@/lib/metrics";
import { RANGES, rangeFieldId } from "@/lib/ranges";

/**
 * Intake form definition: the single source for sections, fields, which are
 * required (drives % complete), and how answers map onto the company row and
 * the metrics dictionary.
 */

export type IntakeSectionId = "company" | "customers" | "gtm" | "icp" | "hiring";
export type FieldKind = "text" | "textarea" | "select" | "currency" | "percent" | "integer";

/** Company columns an intake answer is mirrored into (for portfolio views). */
export type CompanyColumn =
  | "name"
  | "website"
  | "industry"
  | "stage"
  | "arr"
  | "growthPct"
  | "funding"
  | "employees"
  | "customers"
  | "acv"
  | "nrr"
  | "grr"
  | "salesCycleDays"
  | "primarySegment"
  | "salesModel";

export type IntakeField = {
  id: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options?: readonly string[];
  placeholder?: string;
  /** Numeric answers are also stored as an accepted, company-provided data point for this metric. */
  metric?: MetricKey;
  column?: CompanyColumn;
  /** Set on range fields: the exact field this range stands in for. Never a figure. */
  rangeOf?: string;
};

export type IntakeSection = { id: IntakeSectionId; label: string; fields: IntakeField[] };

const BASE_SECTIONS: IntakeSection[] = [
  {
    id: "company",
    label: "Company",
    fields: [
      { id: "name", label: "Company name", kind: "text", required: true, column: "name" },
      { id: "website", label: "Website", kind: "text", required: false, placeholder: "acme.com", column: "website" },
      {
        id: "industry",
        label: "Industry",
        kind: "select",
        required: true,
        options: ["AI / Automation", "B2B SaaS", "Fintech", "HealthTech", "Other"],
        column: "industry",
      },
      { id: "stage", label: "Stage", kind: "select", required: true, options: ["Pre-seed", "Seed", "Series A", "Series B+"], column: "stage" },
      { id: "arr", label: "ARR ($)", kind: "currency", required: true, placeholder: "4,200,000", metric: "arr", column: "arr" },
      { id: "growth", label: "YoY Growth (%)", kind: "percent", required: true, placeholder: "72", metric: "arr_growth", column: "growthPct" },
      { id: "funding", label: "Total Funding ($)", kind: "currency", required: false, placeholder: "8,500,000", column: "funding" },
      { id: "employees", label: "Employees", kind: "integer", required: true, placeholder: "38", metric: "employees", column: "employees" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    fields: [
      { id: "count", label: "Customer count", kind: "integer", required: true, placeholder: "87", metric: "customers", column: "customers" },
      { id: "acv", label: "ACV ($)", kind: "currency", required: true, placeholder: "42,000", metric: "acv", column: "acv" },
      { id: "nrr", label: "NRR (%)", kind: "percent", required: true, placeholder: "108", metric: "nrr", column: "nrr" },
      { id: "gross_retention", label: "Gross retention (%)", kind: "percent", required: false, placeholder: "91", metric: "grr", column: "grr" },
      {
        id: "sales_cycle",
        label: "Avg. sales cycle (days)",
        kind: "integer",
        required: true,
        placeholder: "94",
        metric: "sales_cycle_days",
        column: "salesCycleDays",
      },
      { id: "segment", label: "Primary segment", kind: "select", required: true, options: ["SMB", "Mid-market", "Enterprise", "Mixed"], column: "primarySegment" },
    ],
  },
  {
    id: "gtm",
    label: "GTM",
    fields: [
      { id: "sales_reps", label: "Sales reps (AE)", kind: "integer", required: true, placeholder: "5", metric: "sales_reps" },
      { id: "sdrs", label: "SDRs / BDRs", kind: "integer", required: false, placeholder: "2", metric: "sdrs" },
      { id: "marketing", label: "Marketing team", kind: "integer", required: false, placeholder: "1" },
      { id: "partnerships", label: "Partnership team", kind: "integer", required: false, placeholder: "0" },
      { id: "channels", label: "Primary channels", kind: "text", required: true, placeholder: "Outbound, content, events" },
      { id: "model", label: "Sales model", kind: "select", required: true, options: ["Founder-led", "Product-led", "Sales-led", "Hybrid"], column: "salesModel" },
    ],
  },
  {
    id: "icp",
    label: "ICP",
    fields: [
      { id: "industries", label: "Target industries", kind: "text", required: true, placeholder: "B2B SaaS, AI/tech companies" },
      { id: "size", label: "Company size", kind: "text", required: true, placeholder: "100–2,000 employees" },
      { id: "buyer", label: "Primary buyer", kind: "text", required: true, placeholder: "VP Sales, CRO, CEO" },
      { id: "geo", label: "Geography", kind: "select", required: true, options: ["North America", "North America + EU", "Global", "Europe"] },
      { id: "usecase", label: "Primary use case", kind: "text", required: false, placeholder: "GTM automation and intelligence" },
    ],
  },
  {
    id: "hiring",
    label: "Hiring",
    fields: [
      { id: "current_team", label: "Current team", kind: "textarea", required: false, placeholder: "5 AEs, 2 SDRs, 1 marketing, 1 CS" },
      { id: "planned_hires", label: "Planned hires", kind: "textarea", required: true, placeholder: "Enterprise AE, CS manager" },
      { id: "timeline", label: "Hiring timeline", kind: "select", required: true, options: ["Next quarter", "Next 6 months", "Next 12 months", "No hires planned"] },
      { id: "key_gaps", label: "Key gaps", kind: "textarea", required: true, placeholder: "No partnerships owner; CS stretched across 87 accounts" },
    ],
  },
];

/**
 * Each section plus a range field for every exact figure that has ranges (lib/ranges.ts): optional
 * selects the questionnaire asks instead of the exact number, and the profile form doesn't show.
 */
export const INTAKE_SECTIONS: IntakeSection[] = BASE_SECTIONS.map((s) => ({
  ...s,
  fields: [
    ...s.fields,
    ...s.fields.flatMap((f): IntakeField[] => {
      const range = RANGES[`${s.id}.${f.id}`];
      return range ? [{ id: rangeFieldId(f.id), label: range.label, kind: "select", required: false, options: range.options.map((o) => o.label), rangeOf: f.id }] : [];
    }),
  ],
}));

export const INTAKE_SECTION_IDS = INTAKE_SECTIONS.map((s) => s.id);

export function getSection(id: string): IntakeSection | undefined {
  return INTAKE_SECTIONS.find((s) => s.id === id);
}

export function getField(sectionId: string, fieldId: string): IntakeField | undefined {
  return getSection(sectionId)?.fields.find((f) => f.id === fieldId);
}

export type IntakeValue = string | number;
/** Answers keyed by `${section}.${field}`. */
export type IntakeAnswers = Record<string, IntakeValue | null | undefined>;
export const answerKey = (section: string, field: string) => `${section}.${field}`;

const answered = (v: IntakeValue | null | undefined) => v !== null && v !== undefined && v !== "";

export function sectionComplete(section: IntakeSection, answers: IntakeAnswers): boolean {
  return section.fields.every((f) => !f.required || answered(answers[answerKey(section.id, f.id)]));
}

/** % of required fields answered across all sections, rounded down. */
export function percentComplete(answers: IntakeAnswers): number {
  const required = INTAKE_SECTIONS.flatMap((s) => s.fields.filter((f) => f.required).map((f) => answerKey(s.id, f.id)));
  const done = required.filter((k) => answered(answers[k])).length;
  return Math.floor((done / required.length) * 100);
}

export function firstIncompleteSection(answers: IntakeAnswers): IntakeSectionId | null {
  return INTAKE_SECTIONS.find((s) => !sectionComplete(s, answers))?.id ?? null;
}

/**
 * Parses what a founder typed. Accepts "4,200,000", "$4.2M", "42k", "72%".
 * Empty input means "clear the answer".
 */
export function parseFieldValue(
  field: IntakeField,
  raw: string,
): { ok: true; value: IntakeValue | null } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };

  if (field.kind === "text" || field.kind === "textarea") {
    if (text.length > 2000) return { ok: false, error: "Keep this under 2,000 characters." };
    return { ok: true, value: text };
  }
  if (field.kind === "select") {
    return field.options?.includes(text) ? { ok: true, value: text } : { ok: false, error: "Choose one of the options." };
  }

  const m = text
    .replace(/[$,%\s]/g, "")
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)(k|m|b)?$/);
  if (!m) return { ok: false, error: "Enter a number, e.g. 4,200,000 or 4.2M." };
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[m[2] as "k" | "m" | "b"] ?? 1;
  const value = Number(m[1]) * scale;

  if (field.kind === "percent") {
    if (m[2]) return { ok: false, error: "Enter a percentage, e.g. 72." };
    if (value > 1000) return { ok: false, error: "That percentage looks too high." };
    return { ok: true, value };
  }
  if (field.kind === "integer") {
    if (!Number.isInteger(value)) return { ok: false, error: "Enter a whole number." };
    return { ok: true, value };
  }
  return { ok: true, value: Math.round(value) };
}

/** How a stored answer is shown back in its input. */
export function displayValue(field: IntakeField, value: IntakeValue | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && field.kind === "currency") return value.toLocaleString("en-US");
  return String(value);
}
