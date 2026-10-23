import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { METRICS } from "@/lib/metrics";
import {
  answerKey,
  getField,
  getSection,
  INTAKE_SECTIONS,
  parseFieldValue,
  percentComplete,
  sectionComplete,
  type IntakeAnswers,
  type IntakeSectionId,
  type IntakeValue,
} from "@/lib/intake";

/** Saved answers, falling back to the company row (e.g. name and website from onboarding). */
export async function getIntakeAnswers(company: Company): Promise<IntakeAnswers> {
  const rows = await db.select().from(schema.intakeResponses).where(eq(schema.intakeResponses.companyId, company.id));
  const answers: IntakeAnswers = {};
  for (const section of INTAKE_SECTIONS) {
    for (const field of section.fields) {
      if (!field.column) continue;
      const v = company[field.column];
      if (v !== null && v !== undefined && v !== "") answers[answerKey(section.id, field.id)] = v as IntakeValue;
    }
  }
  for (const r of rows) answers[answerKey(r.section, r.field)] = r.value as IntakeValue | null;
  return answers;
}

export type SaveResult =
  | { ok: true; percent: number; completeSections: IntakeSectionId[]; phaseAdvanced: boolean }
  | { ok: false; error: string };

const completeSections = (answers: IntakeAnswers) => INTAKE_SECTIONS.filter((s) => sectionComplete(s, answers)).map((s) => s.id);

/**
 * Saves one intake answer for the founder's own company. Numeric answers tied
 * to a metric are mirrored into an accepted, company-provided data point so
 * every figure later shown traces back to this answer.
 */
export async function saveIntakeAnswer(user: User, company: Company, sectionId: string, fieldId: string, raw: string): Promise<SaveResult> {
  const section = getSection(sectionId);
  const field = getField(sectionId, fieldId);
  if (!section || !field) return { ok: false, error: "Unknown field." };

  const parsed = parseFieldValue(field, raw);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (field.column === "name" && value === null) return { ok: false, error: "Your company needs a name." };

  const before = await getIntakeAnswers(company);
  const [existing] = await db
    .select()
    .from(schema.intakeResponses)
    .where(
      and(
        eq(schema.intakeResponses.companyId, company.id),
        eq(schema.intakeResponses.section, section.id),
        eq(schema.intakeResponses.field, field.id),
      ),
    )
    .limit(1);

  // Keep the linked data point in step with the answer.
  let dataPointId = existing?.dataPointId ?? null;
  if (field.metric) {
    if (value === null || typeof value !== "number") {
      if (dataPointId) await db.delete(schema.dataPoints).where(eq(schema.dataPoints.id, dataPointId));
      dataPointId = null;
    } else if (dataPointId) {
      // A new answer is the founder's current figure again, even if a conflict had set it aside.
      await db.update(schema.dataPoints).set({ value, status: "accepted", acceptedBy: user.id }).where(eq(schema.dataPoints.id, dataPointId));
    } else {
      const [dp] = await db
        .insert(schema.dataPoints)
        .values({
          companyId: company.id,
          metric: field.metric,
          value,
          unit: METRICS[field.metric].unit,
          rawText: `Intake: ${field.label}`,
          period: "Current",
          confidence: "high",
          status: "accepted",
          acceptedBy: user.id,
        })
        .returning({ id: schema.dataPoints.id });
      dataPointId = dp?.id ?? null;
    }
  }

  if (value === null) {
    if (existing) await db.delete(schema.intakeResponses).where(eq(schema.intakeResponses.id, existing.id));
  } else {
    await db
      .insert(schema.intakeResponses)
      .values({ companyId: company.id, section: section.id, field: field.id, value, source: "manual", dataPointId })
      .onConflictDoUpdate({
        target: [schema.intakeResponses.companyId, schema.intakeResponses.section, schema.intakeResponses.field],
        set: { value, source: "manual", dataPointId },
      });
  }

  const after: IntakeAnswers = { ...before, [answerKey(section.id, field.id)]: value };
  const companyUpdate: Partial<typeof schema.companies.$inferInsert> = {};
  if (field.column) Object.assign(companyUpdate, { [field.column]: value });
  if (field.column === "salesModel") companyUpdate.founderLed = value === null ? null : value === "Founder-led";

  const wasComplete = new Set(completeSections(before));
  const nowComplete = completeSections(after);
  const percent = percentComplete(after);
  const phaseAdvanced = company.phase === "intake" && percent === 100;
  if (phaseAdvanced) companyUpdate.phase = "upload";
  if (Object.keys(companyUpdate).length > 0) {
    await db.update(schema.companies).set(companyUpdate).where(eq(schema.companies.id, company.id));
  }

  for (const s of nowComplete) {
    if (!wasComplete.has(s)) await track("intake_section_completed", { userId: user.id, companyId: company.id, props: { section: s } });
  }

  return { ok: true, percent, completeSections: nowComplete, phaseAdvanced };
}
