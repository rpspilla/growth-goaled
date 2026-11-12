import "server-only";
import { and, desc, eq, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";

/** The three numbers every company page leads with, and the stored metrics behind each. */
export const BUSINESS_METRICS = {
  revenue: { label: "Revenue", metrics: ["arr"] },
  growth: { label: "Month-over-month growth", metrics: ["mom_growth"] },
  retention: { label: "Retention", metrics: ["nrr", "grr"] },
} as const;
export type BusinessKey = keyof typeof BUSINESS_METRICS;
const KEYS = Object.keys(BUSINESS_METRICS) as BusinessKey[];
const ALL = KEYS.flatMap((k) => [...BUSINESS_METRICS[k].metrics]);
const keyFor = (metric: string) => KEYS.find((k) => (BUSINESS_METRICS[k].metrics as readonly string[]).includes(metric))!;

export type Reading = { metric: string; value: number; period: string | null; at: Date; source: string; confirmed: boolean };
export type BusinessUpdate = { key: string; at: Date; source: string; values: Partial<Record<BusinessKey, Reading>> };
export type BusinessMetrics = {
  latest: Record<BusinessKey, (Reading & { previous: Reading | null }) | null>;
  /** Each time new figures arrived (a file, or an update typed in), newest first. */
  updates: BusinessUpdate[];
};

type Row = { metric: string; value: number; period: string | null; createdAt: Date; origin: string; status: string; documentId: string | null; filename: string | null };

const sourceOf = (r: Row) => (r.filename ? (r.origin === "calculated" ? `Calculated from ${r.filename}` : `Read from ${r.filename}`) : r.origin === "calculated" ? "Calculated from your updates" : "Entered by hand");

/** Pure: newest reading per number (with the one before it), and the readings grouped into updates. */
export function summarize(rows: Row[]): BusinessMetrics {
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const reading = (r: Row): Reading => ({ metric: r.metric, value: r.value, period: r.period, at: r.createdAt, source: sourceOf(r), confirmed: r.status === "accepted" || r.origin !== "extracted" });
  const latest = Object.fromEntries(KEYS.map((k) => [k, null])) as BusinessMetrics["latest"];
  for (const k of KEYS) {
    // The preferred stored metric for this number that has any reading (NRR before gross retention).
    const metric = BUSINESS_METRICS[k].metrics.find((m) => sorted.some((r) => r.metric === m));
    const of = sorted.filter((r) => r.metric === metric);
    if (!of[0]) continue;
    const prev = of.find((r) => r.value !== of[0]!.value && r.createdAt < of[0]!.createdAt);
    latest[k] = { ...reading(of[0]), previous: prev ? reading(prev) : null };
  }
  const groups = new Map<string, BusinessUpdate>();
  for (const r of sorted) {
    // One update per file; typed-in figures group by the save they came from (one insert, one timestamp).
    const key = r.documentId ?? `manual-${r.createdAt.getTime()}`;
    const g = groups.get(key) ?? { key, at: r.createdAt, source: sourceOf(r), values: {} };
    const k = keyFor(r.metric);
    if (!g.values[k]) g.values[k] = reading(r);
    groups.set(key, g);
  }
  return { latest, updates: [...groups.values()].slice(0, 12) };
}

export async function businessMetrics(company: Pick<Company, "id">): Promise<BusinessMetrics> {
  const rows = await db
    .select({ metric: schema.dataPoints.metric, value: schema.dataPoints.value, period: schema.dataPoints.period, createdAt: schema.dataPoints.createdAt, origin: schema.dataPoints.origin, status: schema.dataPoints.status, documentId: schema.dataPoints.documentId, filename: schema.documents.filename })
    .from(schema.dataPoints)
    .leftJoin(schema.documents, eq(schema.documents.id, schema.dataPoints.documentId))
    .where(and(eq(schema.dataPoints.companyId, company.id), inArray(schema.dataPoints.metric, ALL), ne(schema.dataPoints.status, "rejected")))
    .orderBy(desc(schema.dataPoints.createdAt))
    .limit(500);
  return summarize(rows);
}

const previousMonth = (period: string) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/**
 * A founder types in this month's numbers: monthly revenue (stored as ARR) and retention. Growth
 * is worked out from the month before, when that month's revenue is on file.
 */
export async function addBusinessUpdate(user: Pick<User, "id">, company: Pick<Company, "id">, input: { period: string; mrr: number | null; retention: number | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) return { ok: false, error: "Pick the month these figures are for." };
  if (input.mrr === null && input.retention === null) return { ok: false, error: "Enter monthly revenue, retention or both." };
  if (input.mrr !== null && (!Number.isFinite(input.mrr) || input.mrr < 0 || input.mrr > 1e10)) return { ok: false, error: "Monthly revenue doesn't look right." };
  if (input.retention !== null && (!Number.isFinite(input.retention) || input.retention < 0 || input.retention > 300)) return { ok: false, error: "Retention is a percent, usually between 50 and 150." };
  const base = { companyId: company.id, period: input.period, confidence: "high" as const, status: "accepted" as const, acceptedBy: user.id };
  const values: (typeof schema.dataPoints.$inferInsert)[] = [];
  if (input.mrr !== null) {
    values.push({ ...base, metric: "arr", value: Math.round(input.mrr * 12), unit: "usd", origin: "manual", rawText: `Monthly revenue $${input.mrr.toLocaleString("en-US")} for ${input.period}, entered by hand` });
    const [prev] = await db
      .select({ value: schema.dataPoints.value })
      .from(schema.dataPoints)
      .where(and(eq(schema.dataPoints.companyId, company.id), eq(schema.dataPoints.metric, "arr"), eq(schema.dataPoints.period, previousMonth(input.period)), ne(schema.dataPoints.status, "rejected")))
      .orderBy(desc(schema.dataPoints.createdAt))
      .limit(1);
    if (prev && prev.value > 0) {
      const growth = Math.round(((input.mrr * 12 - prev.value) / prev.value) * 1000) / 10;
      values.push({ ...base, metric: "mom_growth", value: growth, unit: "percent", origin: "calculated", method: `Revenue for ${input.period} against ${previousMonth(input.period)}`, rawText: `Calculated from the revenue entered for ${previousMonth(input.period)} and ${input.period}` });
    }
  }
  if (input.retention !== null) values.push({ ...base, metric: "nrr", value: input.retention, unit: "percent", origin: "manual", rawText: `Net revenue retention ${input.retention}% for ${input.period}, entered by hand` });
  await db.insert(schema.dataPoints).values(values);
  await track("business_update_added", { userId: user.id, companyId: company.id, props: { revenue: input.mrr !== null, retention: input.retention !== null } });
  return { ok: true };
}

/**
 * An advisor clears an update from the founder's Performance page: its revenue, growth and
 * retention readings are set aside (kept for the record, no longer shown). `key` is an update's key
 * from `summarize` (a file's id, or "manual-<save time>"), or "all".
 */
/** The readings that make up one update (a file's id, "manual-<save time>", or "all"); null for a bad key. */
function updateScope(company: Pick<Company, "id">, key: string) {
  const scope = [eq(schema.dataPoints.companyId, company.id), inArray(schema.dataPoints.metric, ALL), ne(schema.dataPoints.status, "rejected")];
  if (key.startsWith("manual-")) {
    const ms = Number(key.slice(7));
    if (!Number.isFinite(ms)) return null;
    // Stored times carry microseconds; the key has milliseconds.
    scope.push(isNull(schema.dataPoints.documentId), gte(schema.dataPoints.createdAt, new Date(ms)), lt(schema.dataPoints.createdAt, new Date(ms + 1)));
  } else if (key !== "all") {
    if (!/^[0-9a-f-]{36}$/.test(key)) return null;
    scope.push(eq(schema.dataPoints.documentId, key));
  }
  return and(...scope);
}

export async function clearBusinessUpdate(actor: Pick<User, "id">, company: Pick<Company, "id">, key: string): Promise<number> {
  const scope = updateScope(company, key);
  if (!scope) return 0;
  const cleared = await db.update(schema.dataPoints).set({ status: "rejected", acceptedBy: actor.id, updatedAt: new Date() }).where(scope).returning({ id: schema.dataPoints.id });
  return cleared.length;
}

/**
 * An admin corrects the date an update was entered (e.g. figures shared late, or typed in for an
 * earlier month). Its readings move to that day, so the history and "was … on …" follow.
 */
export async function setBusinessUpdateDate(company: Pick<Company, "id">, key: string, day: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (key === "all") return { ok: false, error: "Pick one update." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T12:00:00Z`))) return { ok: false, error: "Pick a valid date." };
  if (day > new Date().toISOString().slice(0, 10)) return { ok: false, error: "The date can't be in the future." };
  const scope = updateScope(company, key);
  if (!scope) return { ok: false, error: "That update wasn't found." };
  const moved = await db.update(schema.dataPoints).set({ createdAt: new Date(`${day}T12:00:00Z`), updatedAt: new Date() }).where(scope).returning({ id: schema.dataPoints.id });
  return moved.length ? { ok: true } : { ok: false, error: "That update wasn't found." };
}
