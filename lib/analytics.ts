import { percentComplete, type IntakeAnswers } from "@/lib/intake";

/**
 * Derived product metrics (HANDOFF §10), computed from events and records.
 * Pure so every definition is unit-tested.
 */

export type AnalyticsInput = {
  companies: { id: string; createdAt: Date }[];
  intake: { companyId: string; key: string; value: unknown }[];
  documents: { companyId: string }[];
  events: { name: string; companyId: string | null; createdAt: Date; props: unknown }[];
  reviews: { deliverableId: string; companyId: string; version: number; decision: string | null; qaAt: Date | null; decidedAt: Date | null }[];
  published: { id: string; companyId: string; version: number }[];
};

export type Metric = { value: number | null; count: number; note: string };

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

export function computeAnalytics(input: AnalyticsInput) {
  const answers = new Map<string, IntakeAnswers>();
  for (const r of input.intake) {
    const a = answers.get(r.companyId) ?? {};
    a[r.key] = r.value as IntakeAnswers[string];
    answers.set(r.companyId, a);
  }
  const withDocs = new Set(input.documents.map((d) => d.companyId));
  const activated = input.companies.filter((c) => percentComplete(answers.get(c.id) ?? {}) >= 80 && withDocs.has(c.id));

  const firstPublished = new Map<string, Date>();
  for (const e of input.events) {
    if (e.name !== "deliverable_published" || !e.companyId) continue;
    if ((e.props as { type?: string } | null)?.type !== "benchmark") continue;
    const prev = firstPublished.get(e.companyId);
    if (!prev || e.createdAt < prev) firstPublished.set(e.companyId, e.createdAt);
  }
  const toBenchmark = input.companies.flatMap((c) => (firstPublished.has(c.id) ? [hours(c.createdAt, firstPublished.get(c.id)!)] : []));

  const viewed = new Set(input.events.filter((e) => e.name === "deliverable_viewed" && e.companyId).map((e) => e.companyId!));
  const opened = new Set(input.events.filter((e) => e.name === "source_trail_opened" && e.companyId).map((e) => e.companyId!));
  const openedOfViewed = [...viewed].filter((id) => opened.has(id)).length;

  const turnaround = input.reviews.flatMap((r) => (r.decision && r.qaAt && r.decidedAt ? [hours(r.qaAt, r.decidedAt)] : []));

  // A published version counts as "approved without changes" when no version since the
  // company's previous publish was edited or sent back.
  const byCompany = new Map<string, AnalyticsInput["published"]>();
  for (const p of input.published) byCompany.set(p.companyId, [...(byCompany.get(p.companyId) ?? []), p]);
  let clean = 0;
  for (const [companyId, list] of byCompany) {
    const sorted = [...list].sort((a, b) => a.version - b.version);
    sorted.forEach((p, i) => {
      const from = i === 0 ? 0 : sorted[i - 1]!.version;
      const changed = input.reviews.some(
        (r) => r.companyId === companyId && r.version > from && r.version <= p.version && (r.decision === "request_changes" || r.decision === "send_back"),
      );
      if (!changed) clean++;
    });
  }

  const since = Date.now() - 30 * 86_400_000;
  const counts: Record<string, number> = {};
  for (const e of input.events) if (e.createdAt.getTime() >= since) counts[e.name] = (counts[e.name] ?? 0) + 1;

  const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    activation: { value: pct(activated.length, input.companies.length), count: activated.length, note: `of ${input.companies.length} companies have intake ≥80% and at least one document` } satisfies Metric,
    hoursToFirstBenchmark: { value: round(median(toBenchmark)), count: toBenchmark.length, note: "median hours from sign-up to first published Benchmark" } satisfies Metric,
    sourceTrailRate: { value: pct(openedOfViewed, viewed.size), count: openedOfViewed, note: `of ${viewed.size} companies that viewed a Benchmark opened a source trail` } satisfies Metric,
    reviewTurnaround: { value: round(median(turnaround)), count: turnaround.length, note: "median hours from QA complete to advisor decision" } satisfies Metric,
    approvedWithoutChanges: { value: pct(clean, input.published.length), count: clean, note: `of ${input.published.length} published Benchmarks needed no edits or send-backs` } satisfies Metric,
    eventCounts30d: counts,
  };
}
