import { METRICS, type MetricKey } from "@/lib/metrics";
import type { ActionPlanContent, PlanStep, PlanTarget } from "@/lib/db/schema";

/**
 * Execute & Monitor tracking rules (no database here): milestone deadlines, metric targets, and the
 * live CRO time included each month.
 */
export const LIVE_MINUTES_PER_MONTH = 120;
export const MAX_TARGETS = 6;
export const PERIOD_DAYS = { days30: 30, days60: 60, days90: 90 } as const;
const PERIODS = ["days30", "days60", "days90"] as const;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Milestones without a deadline get the end of their period, counted from `start`. */
export function withDefaultDues(content: ActionPlanContent, start: Date): ActionPlanContent {
  const due = (days: number) => isoDay(new Date(start.getTime() + days * 86_400_000));
  const fill = (steps: PlanStep[], days: number) => steps.map((s) => (s.due ? s : { ...s, due: due(days) }));
  return { ...content, days30: fill(content.days30, 30), days60: fill(content.days60, 60), days90: fill(content.days90, 90) };
}

/**
 * Deadlines, board position and who does it carry over when a plan is rewritten, matched by the
 * milestone's action; so does the plan's start.
 */
export function carryDues(next: ActionPlanContent, current: ActionPlanContent | null): ActionPlanContent {
  if (!current) return next;
  const before = new Map(PERIODS.flatMap((p) => current[p]).map((s) => [s.action.trim().toLowerCase(), s]));
  const carry = (steps: PlanStep[]) => steps.map((s) => {
    const old = before.get(s.action.trim().toLowerCase());
    if (!old) return s;
    return { ...s, ...(old.due && !s.due ? { due: old.due } : {}), ...(old.status && !s.status ? { status: old.status, done: old.status === "done" } : {}), ...(old.assignee && !s.assignee ? { assignee: old.assignee } : {}) };
  });
  return { ...next, days30: carry(next.days30), days60: carry(next.days60), days90: carry(next.days90), targets: next.targets ?? current.targets, ...(current.startedAt ? { startedAt: current.startedAt } : {}) };
}

export const isOverdue = (step: Pick<PlanStep, "due" | "done">, today: string) => Boolean(step.due && !step.done && step.due < today);

export const isMetricKey = (v: string): v is MetricKey => Object.prototype.hasOwnProperty.call(METRICS, v);

/** Whether the current figure has reached the target (direction-aware: lower is better for e.g. sales cycle). */
export function targetMet(metric: MetricKey, current: number | null, target: number): boolean | null {
  if (current === null) return null;
  return METRICS[metric].lowerIsBetter ? current <= target : current >= target;
}

/** Checks a list of targets from the browser: known metrics, real numbers, valid dates, at most six. */
export function cleanTargets(raw: unknown): PlanTarget[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_TARGETS) return null;
  const out: PlanTarget[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") return null;
    const { metric, target, by } = t as Record<string, unknown>;
    if (typeof metric !== "string" || !isMetricKey(metric) || typeof target !== "number" || !Number.isFinite(target)) return null;
    if (by !== undefined && by !== null && by !== "" && !isDay(by)) return null;
    if (out.some((o) => o.metric === metric)) return null;
    out.push({ metric, target, by: isDay(by) ? by : null });
  }
  return out;
}

/** Minutes of live support used in the calendar month (UTC) of `now`; reviews don't count against the two hours. */
export function supportMinutesThisMonth(sessions: { kind: string; minutes: number; heldOn: string }[], now: Date): number {
  const month = isoDay(now).slice(0, 7);
  return sessions.filter((s) => s.kind === "support" && s.heldOn.slice(0, 7) === month).reduce((n, s) => n + s.minutes, 0);
}

export const formatMinutes = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`);
