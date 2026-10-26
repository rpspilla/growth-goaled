import { z } from "zod";
import { METRICS, type MetricKey } from "@/lib/metrics";
import { USE_CASE_IDS } from "@/lib/use-cases/types";

const metricKey = z.enum(Object.keys(METRICS) as [MetricKey, ...MetricKey[]]);
const claimKey = z.string().min(1);

const reference = z
  .object({
    cohortId: z.uuid(),
    name: z.string(),
    companyCount: z.number().nullable(),
    rows: z.array(z.object({ metric: metricKey, benchmarkMetricId: z.uuid() })),
    /** How well the cohort fits: the criteria it matched on and those it didn't. */
    matched: z.array(z.string()).default([]),
    unmatched: z.array(z.string()).default([]),
  })
  .nullable();

const shared = {
  useCase: z.enum(USE_CASE_IDS),
  figures: z.array(z.object({ metric: metricKey, dataPointId: z.uuid() })),
  reference,
  assumptions: z.array(z.string()),
  dataGaps: z.array(z.string()),
  methodology: z.string(),
  /** Gaps found in code (missing required data, unreadable files, unconfirmed figures); always shown. */
  systemGaps: z.array(z.string()).default([]),
  completeness: z.enum(["complete", "partial", "minimal"]).default("partial"),
  /** True when the model couldn't produce a brief and a plain one was built from the inputs. */
  degraded: z.boolean().default(false),
};

/**
 * Content JSON of a Decision Brief (deliverable type "baseline"), saved in structure so later
 * assessments and Progress can use it. The baseline is a snapshot of the figures the brief rested
 * on (value, period, origin, method), so the next version can show what changed.
 */
export const briefContentSchema = z.object({
  format: z.literal("brief"),
  ...shared,
  baseline: z.array(
    z.object({
      metric: metricKey,
      dataPointId: z.uuid(),
      value: z.number(),
      period: z.string().nullable(),
      origin: z.enum(["manual", "extracted", "calculated"]),
      method: z.string().nullable(),
      confirmed: z.boolean(),
      sampleSize: z.number().nullable(),
      recordedAt: z.string(),
    }),
  ),
  /** Set by rule in code, not by the model. Null on briefs converted from the first format. */
  certainty: z.enum(["established", "leading", "unresolved"]).nullable(),
  executiveDecision: z.object({ decision: z.string().min(1), conclusion: z.string(), claimKey }),
  diagnosis: z.object({
    primary: z.object({ title: z.string().min(1), explanation: z.string(), claimKey }),
    alternatives: z.array(z.object({ title: z.string(), assessment: z.string(), claimKey })),
    howToDistinguish: z.string().nullable(),
    unknowns: z.array(z.string()),
  }),
  evidence: z.array(z.object({ text: z.string(), status: z.enum(["verified", "calculated", "inference", "hypothesis"]), bearing: z.enum(["supports", "contradicts", "context"]), claimKey })),
  /** Tables computed in code from the founder's files (ARR bridge, segments, pipeline). */
  analyses: z.array(z.object({ title: z.string(), rows: z.array(z.string()) })),
  alternatives: z.array(z.object({ option: z.string(), upside: z.string(), downside: z.string(), implications: z.string(), claimKey })),
  recommendation: z.object({ option: z.string().min(1), why: z.string(), claimKey }),
  plan: z.array(
    z.object({
      priority: z.number().int(),
      action: z.string().min(1),
      rationale: z.string(),
      timing: z.enum(["next_30_days", "days_31_60", "days_61_90"]),
      role: z.string().nullable(),
      successMetric: z.string(),
      metricKey: metricKey.nullable(),
      expectedSignal: z.string(),
      dependenciesRisks: z.string(),
      claimKey,
    }),
  ),
  changeTriggers: z.array(z.object({ ifThis: z.string(), thenThis: z.string() })),
  followUp: z.object({ metrics: z.array(z.object({ metricKey: metricKey.nullable(), label: z.string(), why: z.string() })), revisitInDays: z.number().int(), revisitTrigger: z.string() }),
});

export type BriefContent = z.infer<typeof briefContentSchema>;
export type AssessmentContent = BriefContent;

const text = z.object({ text: z.string().min(1), claimKey });

/** The first assessment format (summary, findings, decision, actions), still readable. */
const legacyContentSchema = z.object({
  ...shared,
  summary: z.object({ headline: z.string().min(1), body: z.string(), claimKey }),
  findings: z.array(text.extend({ kind: z.enum(["concern", "strength"]) })),
  diagnosis: text,
  decision: text,
  actions: z.array(z.object({ action: z.string().min(1), why: z.string(), horizon: z.enum(["next_30_days", "next_90_days", "later"]), kpi: z.string().nullable(), claimKey })),
  nextSteps: z.array(z.string()),
});

/** Reads stored content in either format as a Decision Brief. */
export function parseBrief(content: unknown): BriefContent | null {
  const brief = briefContentSchema.safeParse(content);
  if (brief.success) return brief.data;
  const old = legacyContentSchema.safeParse(content);
  if (!old.success) return null;
  const c = old.data;
  return {
    format: "brief",
    useCase: c.useCase,
    figures: c.figures,
    reference: c.reference,
    assumptions: c.assumptions,
    dataGaps: [...c.dataGaps, ...c.nextSteps.map((s) => `Next step: ${s}`)],
    methodology: c.methodology,
    systemGaps: c.systemGaps,
    completeness: c.completeness,
    degraded: c.degraded,
    baseline: [],
    certainty: null,
    executiveDecision: { decision: c.summary.headline, conclusion: c.summary.body, claimKey: c.summary.claimKey },
    diagnosis: { primary: { title: "Diagnosis", explanation: c.diagnosis.text, claimKey: c.diagnosis.claimKey }, alternatives: [], howToDistinguish: null, unknowns: [] },
    evidence: c.findings.map((f) => ({ text: f.text, status: "inference" as const, bearing: f.kind === "concern" ? ("supports" as const) : ("context" as const), claimKey: f.claimKey })),
    analyses: [],
    alternatives: [],
    recommendation: { option: c.decision.text, why: "", claimKey: c.decision.claimKey },
    plan: c.actions.map((a, i) => ({
      priority: i + 1,
      action: a.action,
      rationale: a.why,
      timing: a.horizon === "next_30_days" ? ("next_30_days" as const) : ("days_61_90" as const),
      role: null,
      successMetric: a.kpi ?? "",
      metricKey: null,
      expectedSignal: "",
      dependenciesRisks: "",
      claimKey: a.claimKey,
    })),
    changeTriggers: [],
    followUp: { metrics: [], revisitInDays: 90, revisitTrigger: "" },
  };
}
