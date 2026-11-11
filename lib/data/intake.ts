import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
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
import type { CompanyBasics } from "@/lib/onboarding";

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
export async function saveIntakeAnswer(user: User, company: Company, sectionId: string, fieldId: string, raw: string, opts: { source?: "manual" | "extracted"; note?: string } = {}): Promise<SaveResult> {
  const source = opts.source ?? "manual";
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
          rawText: opts.note ?? `Intake: ${field.label}`,
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
      .values({ companyId: company.id, section: section.id, field: field.id, value, source, dataPointId })
      .onConflictDoUpdate({
        target: [schema.intakeResponses.companyId, schema.intakeResponses.section, schema.intakeResponses.field],
        set: { value, source, dataPointId },
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

/**
 * Saves the sign-up basics (lib/onboarding.ts) through the intake, so the profile, the company row
 * and the figures stay the single source: founding year, vertical, funding stage and the go-to-market
 * team. Name and revenue band are on the company row already.
 */
export async function saveCompanyBasics(user: User, companyId: string, basics: CompanyBasics): Promise<void> {
  const answers: [string, string, string | number | null][] = [
    ["company", "founded_year", basics.foundedYear],
    ["company", "industry", basics.vertical],
    ["company", "industry_other", basics.vertical === "Other" ? basics.verticalOther : null],
    ["company", "stage", basics.stage],
    ["gtm", "sales_reps", basics.aes],
    ["gtm", "sdrs", basics.bdrs],
    ["gtm", "cs", basics.cs],
  ];
  for (const [section, field, value] of answers) {
    if (value === null) continue;
    // Re-read the row each time: saveIntakeAnswer mirrors answers into its columns.
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
    if (!company) throw new Error("Company not found.");
    const result = await saveIntakeAnswer(user, company, section, field, String(value));
    if (!result.ok) throw new Error(`Couldn't save ${section}.${field}: ${result.error}`);
  }
}

/**
 * Fills empty profile answers from figures read out of the founder's uploaded documents (newest
 * file first, checked figures before unchecked ones). Each is saved as "extracted" with the file it
 * came from, so the profile says where it came from and the founder can change it.
 */
export async function fillProfileFromDocuments(user: User, company: Company): Promise<number> {
  const answers = await getIntakeAnswers(company);
  const wanted = INTAKE_SECTIONS.flatMap((section) =>
    section.fields
      .filter((f) => f.metric && !f.askAsRange && !f.asChurn && !f.rangeOf && (answers[answerKey(section.id, f.id)] ?? "") === "")
      .map((field) => ({ section, field })),
  );
  if (!wanted.length) return 0;
  const points = await db
    .select({ metric: schema.dataPoints.metric, value: schema.dataPoints.value, status: schema.dataPoints.status, createdAt: schema.dataPoints.createdAt, filename: schema.documents.filename })
    .from(schema.dataPoints)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.dataPoints.documentId))
    .where(and(eq(schema.dataPoints.companyId, company.id), ne(schema.dataPoints.status, "rejected"), inArray(schema.dataPoints.metric, wanted.map((w) => w.field.metric!))))
    .orderBy(desc(schema.dataPoints.createdAt));
  const best = (metric: string) => points.find((p) => p.metric === metric && p.status === "accepted") ?? points.find((p) => p.metric === metric);
  let filled = 0;
  for (const { section, field } of wanted) {
    const p = best(field.metric!);
    if (!p) continue;
    const value = field.kind === "integer" ? Math.round(p.value) : p.value;
    const r = await saveIntakeAnswer(user, company, section.id, field.id, String(value), { source: "extracted", note: `From ${p.filename}` });
    if (r.ok) filled++;
  }
  return filled;
}

/** Profile answers filled from documents, with the file each came from (answer key → filename). */
export async function documentFilledAnswers(company: Pick<Company, "id">): Promise<Record<string, string>> {
  const rows = await db
    .select({ section: schema.intakeResponses.section, field: schema.intakeResponses.field, note: schema.dataPoints.rawText })
    .from(schema.intakeResponses)
    .leftJoin(schema.dataPoints, eq(schema.dataPoints.id, schema.intakeResponses.dataPointId))
    .where(and(eq(schema.intakeResponses.companyId, company.id), eq(schema.intakeResponses.source, "extracted")));
  return Object.fromEntries(rows.map((r) => [answerKey(r.section, r.field), r.note?.replace(/^From /, "") ?? "your documents"]));
}
