import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { figureChoice, sameValue, type FigureCandidate, type FigureChoice } from "@/lib/figures";
import { track } from "@/lib/events";
import { INTAKE_SECTIONS } from "@/lib/intake";
import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import { saveIntakeAnswer } from "./intake";

/**
 * Lets the founder settle which figure an assessment uses: pick between the value in their
 * company profile and what their files say, or enter one that's missing. The choice becomes
 * the accepted figure everywhere (profile included), and open conflict questions about it close.
 */

const intakeFieldFor = (metric: MetricKey) => {
  for (const section of INTAKE_SECTIONS) for (const field of section.fields) if (field.metric === metric) return { section: section.id, field };
  return null;
};

/** Every non-rejected value for each metric, with where it came from. */
export async function figureChoices(company: Pick<Company, "id">, metrics: readonly MetricKey[]): Promise<FigureChoice[]> {
  if (!metrics.length) return [];
  const [points, intakeLinks] = await Promise.all([
    db
      .select({ point: schema.dataPoints, filename: schema.documents.filename })
      .from(schema.dataPoints)
      .leftJoin(schema.documents, eq(schema.documents.id, schema.dataPoints.documentId))
      .where(and(eq(schema.dataPoints.companyId, company.id), inArray(schema.dataPoints.metric, [...metrics]), ne(schema.dataPoints.status, "rejected"))),
    db.select({ dataPointId: schema.intakeResponses.dataPointId }).from(schema.intakeResponses).where(eq(schema.intakeResponses.companyId, company.id)),
  ]);
  const fromProfile = new Set(intakeLinks.map((l) => l.dataPointId).filter(Boolean));
  return metrics.map((metric) =>
    figureChoice(
      metric,
      points
        .filter((p) => p.point.metric === metric)
        .map(({ point, filename }): FigureCandidate => ({
          id: point.id,
          value: point.value,
          status: point.status === "accepted" ? "accepted" : "proposed",
          source: filename ?? (fromProfile.has(point.id) ? "Your company profile" : "Entered by you"),
          period: point.period,
          rawText: point.rawText,
          updatedAt: point.updatedAt,
        })),
    ),
  );
}

/** Rejects other values for the metric that differ from the chosen one, and closes conflict questions about it. */
async function settle(user: User, company: Pick<Company, "id">, metric: MetricKey, value: number, keepId: string) {
  const others = await db
    .select()
    .from(schema.dataPoints)
    .where(and(eq(schema.dataPoints.companyId, company.id), eq(schema.dataPoints.metric, metric), ne(schema.dataPoints.status, "rejected"), ne(schema.dataPoints.id, keepId)));
  const differing = others.filter((p) => !sameValue(p.value, value));
  const agreeing = others.filter((p) => sameValue(p.value, value));
  if (differing.length) await db.update(schema.dataPoints).set({ status: "rejected", acceptedBy: null }).where(inArray(schema.dataPoints.id, differing.map((p) => p.id)));
  if (agreeing.length) await db.update(schema.dataPoints).set({ status: "accepted", acceptedBy: user.id }).where(inArray(schema.dataPoints.id, agreeing.map((p) => p.id)));

  const ids = new Set([keepId, ...others.map((p) => p.id)]);
  const open = await db
    .select()
    .from(schema.registerItems)
    .where(and(eq(schema.registerItems.companyId, company.id), eq(schema.registerItems.status, "open"), inArray(schema.registerItems.type, ["conflict", "assumption"])));
  const label = formatMetric(metric, value);
  for (const item of open.filter((i) => i.dataPointIds.some((id) => ids.has(id)))) {
    await db
      .update(schema.registerItems)
      .set({
        status: "resolved",
        resolution: { kind: "choose", dataPointId: keepId, label, by: user.id, byRole: user.role, at: new Date().toISOString(), via: "assessment" },
      })
      .where(eq(schema.registerItems.id, item.id));
  }
}

/** Keeps the company profile answer in step with the figure the founder chose. */
async function syncProfile(user: User, company: Company, metric: MetricKey, value: number): Promise<string | null> {
  const target = intakeFieldFor(metric);
  if (!target) return null;
  const raw = target.field.kind === "integer" ? String(Math.round(value)) : String(value);
  const result = await saveIntakeAnswer(user, company, target.section, target.field.id, raw);
  if (!result.ok) return null;
  const [link] = await db
    .select({ id: schema.intakeResponses.dataPointId })
    .from(schema.intakeResponses)
    .where(and(eq(schema.intakeResponses.companyId, company.id), eq(schema.intakeResponses.section, target.section), eq(schema.intakeResponses.field, target.field.id)))
    .limit(1);
  return link?.id ?? null;
}

export type FigureResult = { ok: true } | { ok: false; error: string };

/** "Use this one": the chosen value is accepted, the profile follows it, and differing values are set aside. */
export async function chooseFigure(user: User, company: Company, metric: MetricKey, dataPointId: string): Promise<FigureResult> {
  const [point] = await db
    .select()
    .from(schema.dataPoints)
    .where(and(eq(schema.dataPoints.id, dataPointId), eq(schema.dataPoints.companyId, company.id), eq(schema.dataPoints.metric, metric)))
    .limit(1);
  if (!point) return { ok: false, error: "That figure wasn't found." };
  await db.update(schema.dataPoints).set({ status: "accepted", acceptedBy: user.id }).where(eq(schema.dataPoints.id, point.id));
  await syncProfile(user, company, metric, point.value);
  await settle(user, company, metric, point.value, point.id);
  await track("register_item_resolved", { userId: user.id, companyId: company.id, props: { type: "figure", kind: "choose", metric } });
  return { ok: true };
}

/** "Enter a figure": a value the founder types in, saved to the profile where there's a field for it. */
export async function enterFigure(user: User, company: Company, metric: MetricKey, value: number, period: string | null = null): Promise<FigureResult> {
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a number." };
  if (METRICS[metric].unit === "percent" && (value < -100 || value > 1000)) return { ok: false, error: "That percentage looks off. Check it and try again." };
  if (value < 0 && METRICS[metric].unit !== "percent") return { ok: false, error: "That can't be negative." };
  let id = await syncProfile(user, company, metric, value);
  if (!id) {
    const [created] = await db
      .insert(schema.dataPoints)
      .values({
        companyId: company.id,
        metric,
        value,
        unit: METRICS[metric].unit,
        rawText: "Entered during the assessment",
        period: period ?? "Current",
        confidence: "high",
        status: "accepted",
        acceptedBy: user.id,
      })
      .returning({ id: schema.dataPoints.id });
    id = created!.id;
  }
  await settle(user, company, metric, value, id);
  await track("register_item_resolved", { userId: user.id, companyId: company.id, props: { type: "figure", kind: "value", metric } });
  return { ok: true };
}
