import { z } from "zod";
import { METRICS, type MetricKey } from "@/lib/metrics";
import { USE_CASE_IDS } from "@/lib/use-cases/types";

const metricKey = z.enum(Object.keys(METRICS) as [MetricKey, ...MetricKey[]]);
const text = z.object({ text: z.string().min(1), claimKey: z.string().min(1) });

/**
 * Content JSON of an assessment (deliverable type "baseline"). Figures and reference rows are
 * stored as ids and read at render time, so every number shown comes from its source row.
 */
export const assessmentContentSchema = z.object({
  useCase: z.enum(USE_CASE_IDS),
  figures: z.array(z.object({ metric: metricKey, dataPointId: z.uuid() })),
  reference: z
    .object({ cohortId: z.uuid(), name: z.string(), companyCount: z.number().nullable(), rows: z.array(z.object({ metric: metricKey, benchmarkMetricId: z.uuid() })) })
    .nullable(),
  summary: z.object({ headline: z.string().min(1), body: z.string(), claimKey: z.string().min(1) }),
  findings: z.array(text.extend({ kind: z.enum(["concern", "strength"]) })),
  diagnosis: text,
  decision: text,
  actions: z.array(
    z.object({ action: z.string().min(1), why: z.string(), horizon: z.enum(["next_30_days", "next_90_days", "later"]), kpi: z.string().nullable(), claimKey: z.string().min(1) }),
  ),
  assumptions: z.array(z.string()),
  dataGaps: z.array(z.string()),
  nextSteps: z.array(z.string()),
  methodology: z.string(),
});

export type AssessmentContent = z.infer<typeof assessmentContentSchema>;
