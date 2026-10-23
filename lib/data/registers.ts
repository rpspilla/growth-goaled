import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { formatMetric, METRICS, type MetricKey } from "@/lib/metrics";
import { resolveActionSchema, type RegisterType, type ResolveAction } from "@/lib/registers";

type Item = typeof schema.registerItems.$inferSelect;

export type RegisterPoint = {
  id: string;
  metric: string;
  label: string;
  display: string;
  period: string | null;
  source: string;
  status: "proposed" | "accepted" | "rejected";
};

export type RegisterView = {
  id: string;
  companyId: string;
  type: RegisterType;
  title: string;
  description: string | null;
  status: Item["status"];
  owner: Item["owner"];
  resolution: unknown;
  createdAt: string;
  updatedAt: string;
  points: RegisterPoint[];
};

const isStaff = (u: User) => u.role === "advisor" || u.role === "admin";
const fmt = (metric: string, value: number) => (METRICS[metric as MetricKey] ? formatMetric(metric as MetricKey, value) : String(value));
const metricLabel = (metric: string) => METRICS[metric as MetricKey]?.label ?? metric;

/** Register items for the given companies (callers pass only companies the user may see). */
export async function listRegisterItems(
  companyIds: string[],
  opts: { owner?: Item["owner"]; status?: Item["status"]; type?: RegisterType } = {},
): Promise<RegisterView[]> {
  if (!companyIds.length) return [];
  const items = await db
    .select()
    .from(schema.registerItems)
    .where(
      and(
        inArray(schema.registerItems.companyId, companyIds),
        opts.owner ? eq(schema.registerItems.owner, opts.owner) : undefined,
        opts.status ? eq(schema.registerItems.status, opts.status) : undefined,
        opts.type ? eq(schema.registerItems.type, opts.type) : undefined,
      ),
    )
    .orderBy(desc(schema.registerItems.createdAt));

  const pointIds = [...new Set(items.flatMap((i) => i.dataPointIds))];
  const points = pointIds.length
    ? await db
        .select({ point: schema.dataPoints, filename: schema.documents.filename })
        .from(schema.dataPoints)
        .leftJoin(schema.documents, eq(schema.documents.id, schema.dataPoints.documentId))
        .where(and(inArray(schema.dataPoints.id, pointIds), inArray(schema.dataPoints.companyId, companyIds)))
    : [];
  const byId = new Map(points.map((p) => [p.point.id, p]));

  return items.map((i) => ({
    id: i.id,
    companyId: i.companyId,
    type: i.type,
    title: i.title,
    description: i.description,
    status: i.status,
    owner: i.owner,
    resolution: i.resolution,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    points: i.dataPointIds.flatMap((id) => {
      const p = byId.get(id);
      if (!p || p.point.companyId !== i.companyId) return [];
      return [
        {
          id: p.point.id,
          metric: p.point.metric,
          label: metricLabel(p.point.metric),
          display: fmt(p.point.metric, p.point.value),
          period: p.point.period,
          source: p.filename ?? (p.point.rawText?.startsWith("Intake:") ? "Your company profile" : "Entered by you"),
          status: p.point.status,
        },
      ];
    }),
  }));
}

export type ResolveResult = { ok: true } | { ok: false; error: string };

/**
 * Closes one register item for the company. Founders can only act on items
 * they own; staff on any item of a company they manage (the caller checks
 * that). Value choices update the linked data points, so the chosen figure is
 * the accepted one everywhere else.
 */
export async function resolveRegisterItem(actor: User, company: Company, itemId: string, input: ResolveAction): Promise<ResolveResult> {
  const parsed = resolveActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your answer." };
  const action = parsed.data;

  const [item] = await db
    .select()
    .from(schema.registerItems)
    .where(and(eq(schema.registerItems.id, itemId), eq(schema.registerItems.companyId, company.id)))
    .limit(1);
  if (!item) return { ok: false, error: "That question wasn't found." };
  if (!isStaff(actor) && item.owner !== "founder") return { ok: false, error: "That question is for your advisor." };
  if (item.status !== "open") return { ok: false, error: "That question is already closed." };

  const points = item.dataPointIds.length
    ? await db
        .select()
        .from(schema.dataPoints)
        .where(and(inArray(schema.dataPoints.id, item.dataPointIds), eq(schema.dataPoints.companyId, company.id)))
    : [];

  let resolution: Record<string, unknown> = { kind: action.kind };
  let status: Item["status"] = "resolved";
  const rejectOthers = (keepId: string | null) =>
    Promise.all(
      points
        .filter((p) => p.id !== keepId)
        .map((p) => db.update(schema.dataPoints).set({ status: "rejected", acceptedBy: null }).where(eq(schema.dataPoints.id, p.id))),
    );

  switch (action.kind) {
    case "choose": {
      const chosen = points.find((p) => p.id === action.dataPointId);
      if (!chosen) return { ok: false, error: "That value isn't part of this question." };
      await db.update(schema.dataPoints).set({ status: "accepted", acceptedBy: actor.id }).where(eq(schema.dataPoints.id, chosen.id));
      await rejectOthers(chosen.id);
      resolution = { ...resolution, dataPointId: chosen.id, label: `${fmt(chosen.metric, chosen.value)}${chosen.period ? ` (${chosen.period})` : ""}` };
      break;
    }
    case "confirm": {
      if (!points.length) return { ok: false, error: "There's no value to confirm here." };
      await db
        .update(schema.dataPoints)
        .set({ status: "accepted", acceptedBy: actor.id })
        .where(inArray(schema.dataPoints.id, points.map((p) => p.id)));
      break;
    }
    case "value": {
      const metric = points[0]?.metric;
      if (!metric || !METRICS[metric as MetricKey]) return { ok: false, error: "This question doesn't have a figure to correct. Answer it in words instead." };
      const [created] = await db
        .insert(schema.dataPoints)
        .values({
          companyId: company.id,
          metric,
          value: action.value,
          unit: METRICS[metric as MetricKey].unit,
          rawText: `Entered while resolving: ${item.title}`.slice(0, 500),
          period: action.period || points[0]?.period || "Current",
          confidence: "high",
          status: "accepted",
          acceptedBy: actor.id,
        })
        .returning({ id: schema.dataPoints.id });
      await rejectOthers(null);
      resolution = { ...resolution, dataPointId: created?.id, label: fmt(metric, action.value) };
      // Keep the conflict's history pointing at every value involved.
      if (created) await db.update(schema.registerItems).set({ dataPointIds: [...item.dataPointIds, created.id] }).where(eq(schema.registerItems.id, item.id));
      break;
    }
    case "answer":
      resolution = { ...resolution, text: action.text };
      break;
    case "document": {
      const [doc] = await db
        .select({ id: schema.documents.id, filename: schema.documents.filename })
        .from(schema.documents)
        .where(and(eq(schema.documents.id, action.documentId), eq(schema.documents.companyId, company.id)))
        .limit(1);
      if (!doc) return { ok: false, error: "That file wasn't found." };
      resolution = { ...resolution, documentId: doc.id, filename: doc.filename };
      break;
    }
    case "unknown":
      status = "unknown";
      resolution = { ...resolution, note: action.note || undefined };
      break;
  }

  await db
    .update(schema.registerItems)
    .set({ status, resolution: { ...resolution, by: actor.id, byRole: actor.role, at: new Date().toISOString() } })
    .where(eq(schema.registerItems.id, item.id));
  await track("register_item_resolved", { userId: actor.id, companyId: company.id, props: { type: item.type, kind: action.kind, status } });
  return { ok: true };
}

/** Staff only: reopen a closed item. Data point changes made when it closed are kept. */
export async function reopenRegisterItem(actor: User, company: Company, itemId: string): Promise<boolean> {
  if (!isStaff(actor)) return false;
  const updated = await db
    .update(schema.registerItems)
    .set({ status: "open", resolution: null })
    .where(and(eq(schema.registerItems.id, itemId), eq(schema.registerItems.companyId, company.id)))
    .returning({ id: schema.registerItems.id });
  return updated.length > 0;
}

/** Staff only: close an item with a note (e.g. answered on a call). */
export async function closeWithNote(actor: User, company: Company, itemId: string, note: string): Promise<boolean> {
  if (!isStaff(actor)) return false;
  const updated = await db
    .update(schema.registerItems)
    .set({ status: "resolved", resolution: { kind: "note", note: note.trim().slice(0, 2000), by: actor.id, byRole: actor.role, at: new Date().toISOString() } })
    .where(and(eq(schema.registerItems.id, itemId), eq(schema.registerItems.companyId, company.id), eq(schema.registerItems.status, "open")))
    .returning({ id: schema.registerItems.id });
  if (updated.length) await track("register_item_resolved", { userId: actor.id, companyId: company.id, props: { kind: "note" } });
  return updated.length > 0;
}

export async function createRegisterItem(
  actor: User,
  company: Company,
  input: { type: RegisterType; title: string; description?: string; owner: Item["owner"] },
): Promise<Item | null> {
  if (!isStaff(actor)) return null;
  const [item] = await db
    .insert(schema.registerItems)
    .values({ companyId: company.id, type: input.type, title: input.title, description: input.description || null, owner: input.owner })
    .returning();
  return item ?? null;
}

/** Files a founder can point to when answering with "use uploaded data". */
export async function listCompanyFiles(company: Company) {
  return db
    .select({ id: schema.documents.id, filename: schema.documents.filename })
    .from(schema.documents)
    .where(eq(schema.documents.companyId, company.id))
    .orderBy(desc(schema.documents.createdAt));
}

/** The company a register item belongs to (no access check; callers check the company). */
export async function registerItemCompanyId(itemId: string): Promise<string | null> {
  const [row] = await db.select({ companyId: schema.registerItems.companyId }).from(schema.registerItems).where(eq(schema.registerItems.id, itemId)).limit(1);
  return row?.companyId ?? null;
}

/** Uploaded files for several companies, keyed by company id. */
export async function listFilesByCompany(companyIds: string[]): Promise<Record<string, { id: string; filename: string }[]>> {
  if (!companyIds.length) return {};
  const rows = await db
    .select({ id: schema.documents.id, filename: schema.documents.filename, companyId: schema.documents.companyId })
    .from(schema.documents)
    .where(inArray(schema.documents.companyId, companyIds))
    .orderBy(desc(schema.documents.createdAt));
  const out: Record<string, { id: string; filename: string }[]> = {};
  for (const r of rows) (out[r.companyId] ??= []).push({ id: r.id, filename: r.filename });
  return out;
}
