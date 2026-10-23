import { ANALYTIC_METRICS, CATEGORIES, getItem, type CategoryId, type ItemQuality, type ItemStatus } from "@/lib/readiness";

/**
 * Rule-based data gap assessment. It only reads recorded statuses, file
 * metadata and open conflicts; it never estimates or fills in values.
 * Three separate measures:
 *  - collection completeness: how much of what we asked for has been supplied
 *  - data quality: how complete, current, consistent and verified it is
 *  - analytical readiness: whether key growth metrics can be calculated
 */

export type ItemState = {
  key: string;
  status: ItemStatus;
  quality: ItemQuality;
  coverageStart: string | null; // YYYY-MM-DD
  coverageEnd: string | null;
  limitations: string | null;
  followUp: string | null;
  fileCount: number;
  /** Expected columns not found in any attached spreadsheet. */
  missingFields: string[];
};

export type Conflict = { title: string };

export type MetricReadiness = {
  key: string;
  label: string;
  state: "ready" | "limited" | "blocked";
  benchmarkCritical: boolean;
  blockedBy: string[];
  limitedBy: string[];
  message: string | null;
};

export type QualityIssue = { key: string; kind: "limitations" | "missing_fields" | "short_history" | "outdated" | "no_coverage" | "estimated"; detail: string };

export type Assessment = {
  collection: {
    requiredTotal: number;
    requiredSupplied: number; // available = 1, partial = 0.5
    requiredPercent: number;
    reviewed: number;
    total: number;
    byCategory: { id: CategoryId; name: string; letter: string; requiredPercent: number; reviewed: number; total: number; missingRequired: number }[];
  };
  quality: {
    supplied: number;
    validated: number;
    unverified: number;
    estimated: number;
    issues: QualityIssue[];
    openConflicts: number;
  };
  analytical: MetricReadiness[];
  gaps: {
    complete: string[];
    incomplete: string[];
    missing: string[];
    notReviewed: string[];
    conflicting: string[];
    outdated: string[];
  };
  nextRequest: { key: string; request: string; unblocks: string[] } | null;
  readyForBenchmark: boolean;
  benchmarkBlockers: string[];
};

const OUTDATED_DAYS = 90;

/** Whole months covered by a start/end date pair (inclusive), or null when either is unknown. */
export function coverageMonths(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return null;
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}

const supplied = (s: ItemStatus) => s === "available" || s === "partial";

function qualityIssues(item: ItemState, now: Date): QualityIssue[] {
  if (!supplied(item.status)) return [];
  const def = getItem(item.key);
  const issues: QualityIssue[] = [];
  if (item.limitations?.trim()) issues.push({ key: item.key, kind: "limitations", detail: item.limitations.trim() });
  if (item.missingFields.length) {
    issues.push({ key: item.key, kind: "missing_fields", detail: `Uploaded file doesn't appear to include: ${item.missingFields.join(", ")}` });
  }
  if (item.quality === "estimated") issues.push({ key: item.key, kind: "estimated", detail: "Marked as an estimate" });
  if (def?.monthsNeeded) {
    const months = coverageMonths(item.coverageStart, item.coverageEnd);
    if (months === null) issues.push({ key: item.key, kind: "no_coverage", detail: "Coverage dates not recorded" });
    else if (months < def.monthsNeeded) {
      issues.push({ key: item.key, kind: "short_history", detail: `Covers ${months} of the ${def.monthsNeeded} months needed` });
    }
  }
  if (item.coverageEnd) {
    const ageDays = (now.getTime() - new Date(`${item.coverageEnd}T00:00:00Z`).getTime()) / 86_400_000;
    if (ageDays > OUTDATED_DAYS) issues.push({ key: item.key, kind: "outdated", detail: `Data ends ${item.coverageEnd}, over ${OUTDATED_DAYS} days ago` });
  }
  return issues;
}

export function assessReadiness(items: ItemState[], conflicts: Conflict[], now = new Date()): Assessment {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const state = (key: string): ItemState =>
    byKey.get(key) ?? {
      key,
      status: "not_reviewed",
      quality: "unverified",
      coverageStart: null,
      coverageEnd: null,
      limitations: null,
      followUp: null,
      fileCount: 0,
      missingFields: [],
    };

  const allDefs = CATEGORIES.flatMap((c) => c.items.map((i) => ({ ...i, category: c.id })));
  const issues = allDefs.flatMap((d) => qualityIssues(state(d.key), now));
  const issueKeys = new Set(issues.filter((i) => i.kind !== "no_coverage").map((i) => i.key));

  // Collection completeness
  const weight = (s: ItemStatus) => (s === "available" ? 1 : s === "partial" ? 0.5 : 0);
  const completeness = (defs: typeof allDefs) => {
    const required = defs.filter((d) => d.required && state(d.key).status !== "not_applicable");
    const got = required.reduce((sum, d) => sum + weight(state(d.key).status), 0);
    return {
      requiredTotal: required.length,
      requiredSupplied: got,
      requiredPercent: required.length ? Math.floor((got / required.length) * 100) : 100,
      reviewed: defs.filter((d) => state(d.key).status !== "not_reviewed").length,
      total: defs.length,
      missingRequired: required.filter((d) => !supplied(state(d.key).status)).length,
    };
  };
  const overall = completeness(allDefs);

  // Analytical readiness
  const analytical: MetricReadiness[] = ANALYTIC_METRICS.map((m) => {
    const blockedBy = m.needs.filter((k) => !supplied(state(k).status));
    const limitedBy = [
      ...m.needs.filter((k) => state(k).status === "partial" || issueKeys.has(k)),
      ...(m.improves ?? []).filter((k) => !supplied(state(k).status)),
    ].filter((k, i, arr) => !blockedBy.includes(k) && arr.indexOf(k) === i);
    const st: MetricReadiness["state"] = blockedBy.length ? "blocked" : limitedBy.length ? "limited" : "ready";
    return {
      key: m.key,
      label: m.label,
      state: st,
      benchmarkCritical: m.benchmarkCritical,
      blockedBy,
      limitedBy,
      message: st === "blocked" ? m.blockedMessage : null,
    };
  });

  // Gap lists
  const gaps: Assessment["gaps"] = { complete: [], incomplete: [], missing: [], notReviewed: [], conflicting: [], outdated: [] };
  for (const d of allDefs) {
    const s = state(d.key);
    if (s.status === "not_reviewed") gaps.notReviewed.push(d.key);
    else if (s.status === "missing") gaps.missing.push(d.key);
    else if (s.status === "partial" || (s.status === "available" && issueKeys.has(d.key))) gaps.incomplete.push(d.key);
    else if (s.status === "available") gaps.complete.push(d.key);
  }
  gaps.outdated = [...new Set(issues.filter((i) => i.kind === "outdated" || i.kind === "short_history").map((i) => i.key))];
  gaps.conflicting = conflicts.map((c) => c.title);

  // Next most useful request: the unsupplied item that unblocks the most (benchmark-critical first).
  const scores = new Map<string, { score: number; unblocks: string[] }>();
  for (const m of analytical) {
    if (m.state === "ready") continue;
    for (const k of m.blockedBy) {
      const entry = scores.get(k) ?? { score: 0, unblocks: [] };
      entry.score += m.benchmarkCritical ? 3 : 1;
      entry.unblocks.push(m.label);
      scores.set(k, entry);
    }
  }
  for (const d of allDefs) {
    if (d.required && !supplied(state(d.key).status) && state(d.key).status !== "not_applicable") {
      const entry = scores.get(d.key) ?? { score: 0, unblocks: [] };
      entry.score += 0.5;
      scores.set(d.key, entry);
    }
  }
  const order = new Map(allDefs.map((d, i) => [d.key, i]));
  const best = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || order.get(a[0])! - order.get(b[0])!)[0];
  const nextRequest = best
    ? { key: best[0], request: state(best[0]).followUp?.trim() || getItem(best[0])!.followUp, unblocks: best[1].unblocks }
    : null;

  const benchmarkBlockers = [
    ...allDefs.filter((d) => d.required && state(d.key).status === "not_reviewed").length
      ? [`${allDefs.filter((d) => d.required && state(d.key).status === "not_reviewed").length} required items not reviewed yet`]
      : [],
    ...analytical.filter((m) => m.benchmarkCritical && m.state === "blocked").map((m) => `${m.label} can't be calculated yet`),
  ];

  return {
    collection: {
      requiredTotal: overall.requiredTotal,
      requiredSupplied: overall.requiredSupplied,
      requiredPercent: overall.requiredPercent,
      reviewed: overall.reviewed,
      total: overall.total,
      byCategory: CATEGORIES.map((c) => {
        const r = completeness(allDefs.filter((d) => d.category === c.id));
        return { id: c.id, name: c.name, letter: c.letter, requiredPercent: r.requiredPercent, reviewed: r.reviewed, total: r.total, missingRequired: r.missingRequired };
      }),
    },
    quality: {
      supplied: allDefs.filter((d) => supplied(state(d.key).status)).length,
      validated: allDefs.filter((d) => supplied(state(d.key).status) && state(d.key).quality === "validated").length,
      unverified: allDefs.filter((d) => supplied(state(d.key).status) && state(d.key).quality === "unverified").length,
      estimated: allDefs.filter((d) => supplied(state(d.key).status) && state(d.key).quality === "estimated").length,
      issues,
      openConflicts: conflicts.length,
    },
    analytical,
    gaps,
    nextRequest,
    readyForBenchmark: benchmarkBlockers.length === 0,
    benchmarkBlockers,
  };
}

// ---------------------------------------------------------------------------
// Spreadsheet column checks
// ---------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Expected fields for an item that none of the given column headers seem to cover. */
export function missingFieldsFor(itemKey: string, columns: string[]): string[] {
  const fields = getItem(itemKey)?.fields;
  if (!fields || columns.length === 0) return [];
  const headers = columns.map(norm);
  return fields.filter((f) => !f.match.some((m) => headers.some((h) => h.includes(norm(m))))).map((f) => f.label);
}
