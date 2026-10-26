import { displayValue, getField, type IntakeAnswers } from "@/lib/intake";
import { objectiveFields, profileFieldId, profileQuestions, REQUIRED_PROFILE, type ObjectiveField, type UseCaseDef } from "./index";

/**
 * The questionnaire for a use case: the challenge, then only the company-profile
 * questions we don't have an answer for yet, then the optional goal and context.
 * Profile answers already on file are listed instead of asked again.
 */
export function questionnaire(useCase: UseCaseDef, answers: IntakeAnswers): { fields: ObjectiveField[]; known: { label: string; value: string }[] } {
  const known: { label: string; value: string }[] = [];
  const profileFields: ObjectiveField[] = [];
  for (const q of profileQuestions(useCase)) {
    const field = getField(q.section, q.field);
    if (!field) continue;
    const value = answers[`${q.section}.${q.field}`];
    if (value !== null && value !== undefined && value !== "") {
      known.push({ label: field.label, value: displayValue(field, value) });
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
