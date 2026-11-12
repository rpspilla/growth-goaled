import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company } from "@/lib/db/schema";
import { computeHiringPlan, hiringValues, prefillFromFigures, type HiringResult } from "@/lib/hiring-plan";
import type { DataRequest } from "@/lib/plan-requests";

const FIGURES = ["arr", "pipeline_coverage", "acv", "ramp_months", "grr"] as const;
type Figure = (typeof FIGURES)[number];

/**
 * The newest confirmed value of each figure the hiring plan uses (one value per figure: confirmed
 * before calculated, then newest), as the rest of the app ranks them.
 */
export async function hiringFigures(company: Pick<Company, "id">): Promise<Partial<Record<Figure, number>>> {
  const rows = await db
    .select({ metric: schema.dataPoints.metric, value: schema.dataPoints.value, status: schema.dataPoints.status, origin: schema.dataPoints.origin })
    .from(schema.dataPoints)
    .where(and(eq(schema.dataPoints.companyId, company.id), inArray(schema.dataPoints.metric, [...FIGURES]), ne(schema.dataPoints.status, "rejected")))
    .orderBy(desc(schema.dataPoints.updatedAt));
  const out: Partial<Record<Figure, number>> = {};
  const ranks = [(r: (typeof rows)[number]) => r.status === "accepted", (r: (typeof rows)[number]) => r.origin === "calculated"];
  for (const rank of ranks) for (const r of rows) if (rank(r) && out[r.metric as Figure] === undefined) out[r.metric as Figure] = r.value;
  return out;
}

/** The hiring math for a plan's answers, and what to pre-fill the inputs with. */
export async function hiringPlanView(company: Pick<Company, "id">, items: { request: DataRequest | null }[], today = new Date().toISOString().slice(0, 10)): Promise<{ result: HiringResult; prefill: Record<string, string> }> {
  const figures = await hiringFigures(company);
  return {
    result: computeHiringPlan(hiringValues(items), { currentArr: figures.arr ?? null, storedCoverage: figures.pipeline_coverage ?? null, today }),
    prefill: prefillFromFigures(figures),
  };
}
