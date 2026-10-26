"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { chooseFigure, enterFigure, type FigureResult } from "@/lib/data/figures";
import { founderContext } from "@/lib/data/founder-context";
import { track } from "@/lib/events";
import { parseFigure } from "@/lib/figures";
import { isMetricKey, type MetricKey } from "@/lib/metrics";
import { assessmentMetrics } from "@/lib/use-cases";

/** The founder's company and a metric the active assessment uses (nothing else can be changed here). */
async function founderMetric(metric: string) {
  const { user, company, active } = await founderContext();
  if (!company || !active) throw new Error("Buy an assessment first.");
  if (!isMetricKey(metric) || !assessmentMetrics(active.def, active.objective).includes(metric)) return null;
  return { user, company, metric: metric as MetricKey };
}

/** Analytics only: a founder opened the Source Trail for a statement. */
export async function sourceTrailOpened(claimKey: string): Promise<void> {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  if (company) await track("source_trail_opened", { userId: user.id, companyId: company.id, props: { claimKey: claimKey.slice(0, 80), type: "assessment" } });
}

/** "Use this one" for a figure with several values. */
export async function chooseFigureAction(metric: string, dataPointId: string): Promise<FigureResult> {
  const ctx = await founderMetric(metric);
  const id = z.uuid().safeParse(dataPointId);
  if (!ctx || !id.success) return { ok: false, error: "That figure isn't part of this assessment." };
  const result = await chooseFigure(ctx.user, ctx.company, ctx.metric, id.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** A figure typed in during the assessment (missing, or a correction). */
export async function enterFigureAction(metric: string, raw: string): Promise<FigureResult> {
  const ctx = await founderMetric(metric);
  if (!ctx) return { ok: false, error: "That figure isn't part of this assessment." };
  const value = typeof raw === "string" ? parseFigure(raw) : null;
  if (value === null) return { ok: false, error: "Enter a number, e.g. 4,200,000 or 94." };
  const result = await enterFigure(ctx.user, ctx.company, ctx.metric, value);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
