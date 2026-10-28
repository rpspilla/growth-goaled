import { displayValue, getField, type IntakeAnswers } from "@/lib/intake";
import { REVENUE_BANDS } from "@/lib/onboarding";
import { RANGES, rangeFieldId } from "@/lib/ranges";
import { objectiveFields, profileFieldId, profileQuestions, REQUIRED_PROFILE, type ObjectiveField, type UseCaseDef } from "./index";

const answered = (v: unknown) => v !== null && v !== undefined && v !== "";

/**
 * The questionnaire for a use case: the use case's own questions, then only the company-profile
 * questions we don't have an answer for yet. Figures are asked as ranges (lib/ranges.ts), never
 * as exact numbers; an exact figure or a range already on file is listed instead of asked again.
 * Revenue isn't asked again when the founder gave their revenue band at onboarding.
 */
export function questionnaire(useCase: UseCaseDef, answers: IntakeAnswers, revenueBand: string | null = null): { fields: ObjectiveField[]; known: { label: string; value: string }[] } {
  const known: { label: string; value: string }[] = [];
  const profileFields: ObjectiveField[] = [];
  for (const q of profileQuestions(useCase)) {
    const field = getField(q.section, q.field);
    if (!field) continue;
    const exact = answers[`${q.section}.${q.field}`];
    if (answered(exact)) {
      known.push({ label: field.label, value: displayValue(field, exact) });
      continue;
    }
    const band = REVENUE_BANDS.find((b) => b.value === revenueBand);
    if (q.section === "company" && q.field === "arr" && band && !answered(answers[`company.${rangeFieldId("arr")}`])) {
      known.push({ label: "Annual revenue", value: band.label });
      continue;
    }
    const range = RANGES[`${q.section}.${q.field}`];
    if (range) {
      const id = rangeFieldId(q.field);
      const given = answers[`${q.section}.${id}`];
      if (answered(given)) {
        known.push({ label: range.label, value: String(given) });
        continue;
      }
      profileFields.push({
        id: profileFieldId({ section: q.section, field: id }),
        label: range.label,
        kind: "select",
        options: range.options.map((o) => ({ value: o.label, label: o.label })),
        group: "company",
      });
      continue;
    }
    profileFields.push({
      id: profileFieldId(q),
      label: field.label,
      kind: field.kind === "select" ? "select" : field.kind === "currency" ? "currency" : field.kind === "percent" || field.kind === "integer" ? "number" : "text",
      required: REQUIRED_PROFILE.some((r) => r.section === q.section && r.field === q.field),
      options: field.options?.map((o) => ({ value: o, label: o })),
      placeholder: field.placeholder,
      group: "company",
    });
  }
  const objective = objectiveFields(useCase);
  return { fields: [...objective.filter((f) => f.group === "challenge"), ...profileFields, ...objective.filter((f) => f.group !== "challenge")], known };
}
