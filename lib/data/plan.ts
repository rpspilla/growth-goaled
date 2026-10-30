import "server-only";
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { parseBrief } from "@/lib/deliverables/assessment";
import { track } from "@/lib/events";
import { formatMetric, isMetricKey, METRICS, type MetricKey } from "@/lib/metrics";
import type { UseCaseId } from "@/lib/use-cases";
import { getCompanyUseCase, setUseCaseStatus } from "./use-cases";

/**
 * The founder's committed plan: actions from a Decision Brief saved with the baseline value of
 * each tracked metric, then followed on Progress (status, latest figure vs baseline, when to
 * reassess). Every query is scoped to the founder's company.
 */

type PlanStatus = (typeof schema.planActionStatus.enumValues)[number];
export const PLAN_STATUSES = schema.planActionStatus.enumValues;

export type PlanResult = { ok: true } | { ok: false; error: string };

/** Saves the brief's plan as tracked actions and opens Progress. Committing the same brief twice is a no-op. */
export async function commitPlan(user: User, company: Company, deliverableId: string): Promise<PlanResult> {
  const [d] = await db
    .select()
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.id, deliverableId), eq(schema.deliverables.companyId, company.id), eq(schema.deliverables.type, "baseline")))
    .limit(1);
  if (!d || !d.useCase || !d.codeChecksPassed || !["in_review", "approved", "published"].includes(d.status)) return { ok: false, error: "That brief isn't available." };
  const brief = parseBrief(d.content);
  const row = await getCompanyUseCase(company.id, d.useCase as UseCaseId);
  if (!brief || !row?.activatedAt) return { ok: false, error: "That brief isn't available." };
  if (!brief.plan.length) return { ok: false, error: "This brief has no plan to commit to." };
  const base = new Map(brief.baseline.map((b) => [b.metric, b]));
  await db
    .insert(schema.planActions)
    .values(
      brief.plan.map((a) => {
        const b = a.metricKey ? base.get(a.metricKey) : undefined;
        return {
          companyId: company.id,
          companyUseCaseId: row.id,
          deliverableId: d.id,
          priority: a.priority,
          action: a.action,
          rationale: a.rationale,
          timing: a.timing,
          role: a.role,
          successMetric: a.successMetric,
          metric: a.metricKey,
          baselineValue: b?.value ?? null,
          baselinePeriod: b?.period ?? null,
          expectedSignal: a.expectedSignal,
          risks: a.dependenciesRisks,
          updatedBy: user.id,
        };
      }),
    )
    .onConflictDoNothing();
  await setUseCaseStatus(company.id, d.useCase as UseCaseId, "tracking");
  await track("plan_committed", { userId: user.id, companyId: company.id, props: { use_case: d.useCase, version: d.version, actions: brief.plan.length } });
  return { ok: true };
}

/** Status and note on one of the company's plan actions. */
/**
 * Seeing results commits their plan the first time (first-session simplification): the founder
 * doesn't have to press anything for the Action plan to start. Only when no plan has been
 * committed for this question yet, so a re-run never silently replaces a plan being tracked.
 * Returns when the plan was committed, or null when it wasn't (already tracking, or no plan).
 */
export async function autoCommitFirstPlan(user: User, company: Company, useCase: UseCaseId, deliverableId: string): Promise<string | null> {
  const row = await getCompanyUseCase(company.id, useCase);
  if (!row) return null;
  const [existing] = await db
    .select({ id: schema.planActions.id })
    .from(schema.planActions)
    .where(and(eq(schema.planActions.companyId, company.id), eq(schema.planActions.companyUseCaseId, row.id)))
    .limit(1);
  if (existing) return null;
  const result = await commitPlan(user, company, deliverableId);
  if (!result.ok) return null;
  await track("plan_auto_committed", { userId: user.id, companyId: company.id, props: { use_case: useCase } });
  return new Date().toISOString();
}

export async function updatePlanAction(user: User, company: Company, actionId: string, status: PlanStatus, note: string | null): Promise<PlanResult> {
  if (!PLAN_STATUSES.includes(status)) return { ok: false, error: "Unknown status." };
  const updated = await db
    .update(schema.planActions)
    .set({ status, note: note?.trim().slice(0, 1000) || null, updatedBy: user.id, updatedAt: new Date() })
    .where(and(eq(schema.planActions.id, actionId), eq(schema.planActions.companyId, company.id)))
    .returning({ id: schema.planActions.id });
  if (!updated.length) return { ok: false, error: "That action wasn't found." };
  await track("plan_action_updated", { userId: user.id, companyId: company.id, props: { status } });
  return { ok: true };
}

export type MetricProgress = {
  metric: MetricKey;
  label: string;
  baseline: string | null;
  baselinePeriod: string | null;
  latest: string | null;
  latestPeriod: string | null;
  latestAt: string | null;
  direction: "better" | "worse" | "same" | null;
  /** Baseline, then each figure recorded since the brief, oldest first (for a sparkline). */
  series: number[];
  lowerIsBetter: boolean;
};

export type ProgressView = {
  deliverableId: string;
  version: number;
  committedAt: string;
  revisitBy: string;
  revisitDue: boolean;
  revisitTrigger: string;
  decision: string;
  actions: { id: string; priority: number; action: string; rationale: string | null; timing: string | null; role: string | null; successMetric: string | null; expectedSignal: string | null; status: PlanStatus; note: string | null; metric: MetricProgress | null }[];
  metrics: MetricProgress[];
  /** Figures recorded since the brief was built: a reason to reassess. */
  newSince: { label: string; value: string; at: string }[];
  /** A newer brief exists than the committed one. */
  newerBrief: number | null;
};

/** The latest committed plan for a use case, with each tracked metric's latest value against its baseline. */
export async function progressView(company: Pick<Company, "id">, useCase: UseCaseId): Promise<ProgressView | null> {
  const row = await getCompanyUseCase(company.id, useCase);
  if (!row) return null;
  const [latestCommitted] = await db
    .select({ deliverableId: schema.planActions.deliverableId, at: schema.planActions.createdAt })
    .from(schema.planActions)
    .where(and(eq(schema.planActions.companyId, company.id), eq(schema.planActions.companyUseCaseId, row.id)))
    .orderBy(desc(schema.planActions.createdAt))
    .limit(1);
  if (!latestCommitted) return null;
  const [[d], actions] = await Promise.all([
    db.select().from(schema.deliverables).where(and(eq(schema.deliverables.id, latestCommitted.deliverableId), eq(schema.deliverables.companyId, company.id))).limit(1),
    db
      .select()
      .from(schema.planActions)
      .where(and(eq(schema.planActions.companyId, company.id), eq(schema.planActions.deliverableId, latestCommitted.deliverableId)))
      .orderBy(schema.planActions.priority),
  ]);
  const brief = d ? parseBrief(d.content) : null;
  if (!d || !brief) return null;

  const tracked = [...new Set([...actions.map((a) => a.metric), ...brief.followUp.metrics.map((m) => m.metricKey)].filter((m): m is MetricKey => Boolean(m && isMetricKey(m))))];
  const [points, newer] = await Promise.all([
    db
      .select()
      .from(schema.dataPoints)
      .where(and(eq(schema.dataPoints.companyId, company.id), ne(schema.dataPoints.status, "rejected"), gt(schema.dataPoints.updatedAt, d.createdAt)))
      .orderBy(desc(schema.dataPoints.updatedAt)),
    db
      .select({ version: schema.deliverables.version })
      .from(schema.deliverables)
      .where(
        and(
          eq(schema.deliverables.companyId, company.id),
          eq(schema.deliverables.useCase, useCase),
          gt(schema.deliverables.version, d.version),
          eq(schema.deliverables.codeChecksPassed, true),
          inArray(schema.deliverables.status, ["in_review", "approved", "published"]),
        ),
      )
      .orderBy(desc(schema.deliverables.version))
      .limit(1),
  ]);
  // Latest value per metric since the brief: confirmed figures first, then calculated ones.
  const latest = new Map<MetricKey, (typeof points)[number]>();
  for (const p of [...points].sort((a, b) => Number(b.status === "accepted") - Number(a.status === "accepted"))) {
    if (isMetricKey(p.metric) && !latest.has(p.metric) && (p.status === "accepted" || p.origin === "calculated")) latest.set(p.metric, p);
  }
  const base = new Map(brief.baseline.map((b) => [b.metric, b]));
  const progress = (metric: MetricKey, baseline: number | null, baselinePeriod: string | null): MetricProgress => {
    const p = latest.get(metric);
    const lower = METRICS[metric].lowerIsBetter;
    return {
      metric,
      label: METRICS[metric].label,
      baseline: baseline === null ? null : formatMetric(metric, baseline),
      baselinePeriod,
      latest: p ? formatMetric(metric, p.value) : null,
      latestPeriod: p?.period ?? null,
      latestAt: p ? p.updatedAt.toISOString() : null,
      direction: p && baseline !== null ? (p.value === baseline ? "same" : p.value < baseline === lower ? "better" : "worse") : null,
      series: [
        ...(baseline === null ? [] : [baseline]),
        ...points
          .filter((x) => x.metric === metric && (x.status === "accepted" || x.origin === "calculated"))
          .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
          .map((x) => Number(x.value)),
      ],
      lowerIsBetter: Boolean(lower),
    };
  };
  const metrics = tracked.map((m) => {
    const fromAction = actions.find((a) => a.metric === m && a.baselineValue !== null);
    const b = base.get(m);
    return progress(m, fromAction?.baselineValue ?? b?.value ?? null, fromAction?.baselinePeriod ?? b?.period ?? null);
  });
  const committedAt = latestCommitted.at;
  const revisitBy = new Date(committedAt.getTime() + brief.followUp.revisitInDays * 86_400_000);
  return {
    deliverableId: d.id,
    version: d.version,
    committedAt: committedAt.toISOString(),
    revisitBy: revisitBy.toISOString(),
    revisitDue: Date.now() >= revisitBy.getTime(),
    revisitTrigger: brief.followUp.revisitTrigger,
    decision: brief.executiveDecision.decision,
    actions: actions.map((a) => ({
      id: a.id,
      priority: a.priority,
      action: a.action,
      rationale: a.rationale,
      timing: a.timing,
      role: a.role,
      successMetric: a.successMetric,
      expectedSignal: a.expectedSignal,
      status: a.status,
      note: a.note,
      metric: a.metric && isMetricKey(a.metric) ? (metrics.find((m) => m.metric === a.metric) ?? null) : null,
    })),
    metrics,
    newSince: [...latest.entries()].slice(0, 8).map(([m, p]) => ({ label: METRICS[m].label, value: formatMetric(m, p.value), at: p.updatedAt.toISOString() })),
    newerBrief: newer[0]?.version ?? null,
  };
}
