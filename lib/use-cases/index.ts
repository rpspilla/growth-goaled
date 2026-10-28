import { z } from "zod";
import { formatMetric, isMetricKey, METRICS, type MetricKey } from "@/lib/metrics";
import { growthLeak } from "./growth-leak";
import { seriesAReady, seriesBReady } from "./fundraise";
import { hireOrFix } from "./hire-or-fix";
import { winningIcp } from "./winning-icp";
import { founderHandoff } from "./founder-handoff";
import { isUseCaseId, USE_CASE_IDS, type ObjectiveField, type ProfileQuestion, type UseCaseDef, type UseCaseId } from "./types";

export { isUseCaseId, USE_CASE_IDS, type ObjectiveField, type ProfileQuestion, type UseCaseDef, type UseCaseId };

/** The library, in display order. */
export const USE_CASES: readonly UseCaseDef[] = [growthLeak, seriesAReady, seriesBReady, hireOrFix, winningIcp, founderHandoff];

const BY_ID = new Map(USE_CASES.map((u) => [u.id, u]));

export const getUseCase = (id: string): UseCaseDef | undefined => (isUseCaseId(id) ? BY_ID.get(id) : undefined);

/** Library recommendation (HANDOFF §13.3): early companies see fundraise readiness first. */
export function recommendedUseCases(company: { stage: string | null; revenueBand: string | null }): UseCaseId[] {
  const early = company.stage === "Pre-seed" || company.stage === "Seed" || company.revenueBand === "lt_1m" || company.revenueBand === "1m_3m";
  return early ? ["series_a_ready", "growth_leak"] : ["growth_leak"];
}

/**
 * Questions earlier questionnaires asked and no longer do (the challenge in free text, the goal and
 * context). Never asked or saved now, but answers already given are still read: they reach the
 * assessment and the advisor's view.
 */
function retiredFields(useCase: UseCaseDef): ObjectiveField[] {
  return [
    { id: "goal", label: "What's the challenge you're trying to solve?", kind: "textarea", group: "challenge" },
    { id: "main_metric", label: "Which metric would tell you it's solved?", kind: "select", group: "goal", options: useCase.figures.map((m) => ({ value: m, label: METRICS[m].label })) },
    { id: "target_value", label: "Your target value", kind: "number", group: "goal" },
    { id: "target_date", label: "By when?", kind: "date", group: "goal" },
    { id: "why_now", label: "Why now?", kind: "textarea", group: "context" },
    { id: "already_tried", label: "What have you already tried?", kind: "textarea", group: "context" },
    { id: "constraints", label: "Constraints we should know about", kind: "textarea", group: "context" },
    ...(useCase.id === "growth_leak" ? [{ id: "suspected_leak", label: "Where do you think the leak is?", kind: "textarea" as const, group: "challenge" as const }] : []),
  ];
}

/** The use case's own questions: what the questionnaire asks (company figures are asked separately, as ranges). */
export const objectiveFields = (useCase: UseCaseDef): ObjectiveField[] => useCase.objectiveQuestions.map((q) => ({ ...q, group: q.group ?? ("challenge" as const) }));

/** Every question an answer may exist for, including retired ones: for reading answers, never for asking. */
export const answeredObjectiveFields = (useCase: UseCaseDef): ObjectiveField[] => [...retiredFields(useCase), ...objectiveFields(useCase)];

/** Stage and sales model decide whether the assessment fits, so they're required (asked only if the profile lacks them). */
export const REQUIRED_PROFILE: readonly ProfileQuestion[] = [
  { section: "company", field: "stage" },
  { section: "gtm", field: "model" },
];

export const profileFieldId = (q: ProfileQuestion) => `profile.${q.section}.${q.field}`;
export function parseProfileFieldId(id: string): ProfileQuestion | null {
  const m = /^profile\.([a-z_]+)\.([a-z_]+)$/.exec(id);
  return m ? { section: m[1]!, field: m[2]! } : null;
}

/** Asked on every questionnaire, as a range. */
const EMPLOYEES: ProfileQuestion = { section: "company", field: "employees" };

/** Every profile question the use case's questionnaire may ask (figures are asked as ranges). */
export const profileQuestions = (useCase: UseCaseDef): ProfileQuestion[] => [
  ...REQUIRED_PROFILE,
  ...useCase.snapshotProfile,
  ...(useCase.snapshotProfile.some((q) => q.section === EMPLOYEES.section && q.field === EMPLOYEES.field) ? [] : [EMPLOYEES]),
];

export type Objective = Record<string, string>;

const MAX_TEXT = 4000;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Validates one field's value; empty strings clear optional fields. */
export function fieldSchema(field: ObjectiveField): z.ZodType<string> {
  const base = z.string().trim().max(MAX_TEXT);
  switch (field.kind) {
    case "number":
    case "currency":
      return base.refine((v) => v === "" || Number.isFinite(Number(v.replace(/[,$%\s]/g, ""))), "Enter a number.");
    case "date":
      return base.refine((v) => v === "" || (isoDate.test(v) && !Number.isNaN(Date.parse(v))), "Enter a date.");
    case "select":
      return base.refine((v) => v === "" || (field.options ?? []).some((o) => o.value === v), "Pick one of the options.");
    default:
      return base;
  }
}

/** Normalises a single answer (numbers stored without separators). Throws a ZodError when invalid. */
export function parseAnswer(field: ObjectiveField, raw: string): string {
  const value = fieldSchema(field).parse(raw);
  return field.kind === "number" || field.kind === "currency" ? value.replace(/[,$%\s]/g, "") : value;
}

/** Required questionnaire answers still empty: required use-case questions, plus stage and sales model when the profile lacks them. */
export function missingRequired(
  useCase: UseCaseDef,
  objective: Objective | null | undefined,
  profile: Readonly<Record<string, unknown>> = {},
): string[] {
  const missing = objectiveFields(useCase).filter((f) => f.required && !objective?.[f.id]?.trim()).map((f) => f.id);
  for (const q of REQUIRED_PROFILE) {
    const v = profile[`${q.section}.${q.field}`];
    if (v === null || v === undefined || v === "") missing.push(profileFieldId(q));
  }
  return missing;
}

/** "ARR $5M by 2027-06-30": the founder's target, labelled as theirs wherever it's shown. */
export function targetSummary(objective: Objective | null | undefined): string | null {
  const metric = objective?.main_metric;
  const value = Number(objective?.target_value);
  if (!metric || !isMetricKey(metric) || !objective?.target_value || !Number.isFinite(value)) return null;
  const date = objective.target_date ? ` by ${objective.target_date}` : "";
  return `${METRICS[metric].label} ${formatMetric(metric, value)}${date}`;
}

/** The figures an assessment relies on: the use case's figures plus the founder's chosen main metric. */
export function assessmentMetrics(useCase: UseCaseDef, objective: Objective | null | undefined): MetricKey[] {
  const metrics = new Set<MetricKey>(useCase.figures);
  const main = objective?.main_metric;
  if (main && isMetricKey(main)) metrics.add(main);
  return [...metrics];
}
