import { z } from "zod";
import { METRICS, type MetricKey } from "@/lib/metrics";

const metricKey = z.enum(Object.keys(METRICS) as [MetricKey, ...MetricKey[]]);
const claimText = z.object({ text: z.string().min(1), claimKey: z.string().min(1) });

/**
 * Content JSON of a Benchmark deliverable. Rows reference the data point and
 * approved benchmark metric they compare, so every figure shown is read from
 * those rows at render time rather than copied into the content.
 */
export const benchmarkContentSchema = z.object({
  cohortId: z.uuid(),
  rows: z
    .array(
      z.object({
        metric: metricKey,
        dataPointId: z.uuid(),
        benchmarkMetricId: z.uuid(),
        claimKey: z.string().min(1),
      }),
    )
    .min(1),
  insight: z.object({ headline: z.string().min(1), body: z.string().min(1), claimKey: z.string().min(1) }),
  summary: z.object({
    strengths: z.array(claimText),
    watchAreas: z.array(claimText),
    priority: claimText,
  }),
  methodology: z.string().min(1),
});

export type BenchmarkContent = z.infer<typeof benchmarkContentSchema>;
