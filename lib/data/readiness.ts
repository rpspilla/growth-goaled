import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { ALL_ITEM_KEYS, CATEGORIES, getItem } from "@/lib/readiness";
import { assessReadiness, missingFieldsFor, type Assessment, type ItemState } from "@/lib/readiness-assessment";

export type DataItemRow = typeof schema.dataItems.$inferSelect;

/** Creates the company's requirement records (status "not reviewed") for any items it doesn't have yet. */
export async function ensureDataItems(company: Company): Promise<void> {
  await db
    .insert(schema.dataItems)
    .values(CATEGORIES.flatMap((c) => c.items.map((i) => ({ companyId: company.id, category: c.id, itemKey: i.key }))))
    .onConflictDoNothing();
}

async function loadItems(company: Company): Promise<DataItemRow[]> {
  return db.select().from(schema.dataItems).where(eq(schema.dataItems.companyId, company.id));
}

/**
 * After a file is attached to items: record the collection method and, for
 * items the founder hadn't reviewed yet, mark them available. Quality stays
 * as it was (a new upload is unverified until someone checks it).
 */
export async function markItemsSupplied(user: User, company: Company, itemKeys: string[]): Promise<void> {
  if (!itemKeys.length) return;
  await ensureDataItems(company);
  const rows = await db
    .select()
    .from(schema.dataItems)
    .where(and(eq(schema.dataItems.companyId, company.id), inArray(schema.dataItems.itemKey, itemKeys)));
  for (const row of rows) {
    await db
      .update(schema.dataItems)
      .set({
        status: row.status === "not_reviewed" ? "available" : row.status,
        collectionMethod: row.collectionMethod ?? "file_upload",
        quality: row.quality === "validated" ? "unverified" : row.quality,
        lastReviewedAt: new Date(),
        reviewedBy: user.id,
      })
      .where(eq(schema.dataItems.id, row.id));
  }
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

const month = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, "Use YYYY-MM.")
  .transform((v) => `${v.slice(0, 7)}-01`);
const text = (max: number) => z.string().trim().max(max).transform((v) => v || null);

export const itemPatchSchema = z
  .object({
    status: z.enum(schema.dataItemStatus.enumValues),
    collectionMethod: z.enum(schema.collectionMethod.enumValues).nullable(),
    sourceSystem: text(120).nullable(),
    integrationRef: text(300).nullable(),
    coverageStart: month.nullable(),
    coverageEnd: month.nullable(),
    quality: z.enum(schema.dataQuality.enumValues),
    limitations: text(2000).nullable(),
    notes: text(2000).nullable(),
    followUp: text(2000).nullable(),
  })
  .partial();

export type ItemPatch = z.input<typeof itemPatchSchema>;

export type UpdateResult = { ok: true; item: DataItemRow } | { ok: false; error: string };

/** Fields a founder's edit can change that make an earlier validation stale. */
const SUBSTANTIVE: (keyof ItemPatch)[] = ["status", "sourceSystem", "coverageStart", "coverageEnd", "limitations"];

/**
 * Updates one requirement record for the given company. Founders can mark
 * data unverified or estimated; only advisors/admins can mark it validated or
 * set follow-up requests. A founder changing a validated item resets it to
 * unverified.
 */
export async function updateDataItem(actor: User, company: Company, itemKey: string, patch: ItemPatch): Promise<UpdateResult> {
  if (!getItem(itemKey)) return { ok: false, error: "Unknown data item." };
  const parsed = itemPatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the values." };
  const changes = parsed.data;

  const isStaff = actor.role === "advisor" || actor.role === "admin";
  if (!isStaff && changes.quality === "validated") return { ok: false, error: "Only your advisor can mark data as validated." };
  if (!isStaff && "followUp" in changes) return { ok: false, error: "Follow-up requests come from your advisor." };

  await ensureDataItems(company);
  const [current] = await db
    .select()
    .from(schema.dataItems)
    .where(and(eq(schema.dataItems.companyId, company.id), eq(schema.dataItems.itemKey, itemKey)))
    .limit(1);
  if (!current) return { ok: false, error: "Unknown data item." };

  const start = changes.coverageStart !== undefined ? changes.coverageStart : current.coverageStart;
  const end = changes.coverageEnd !== undefined ? changes.coverageEnd : current.coverageEnd;
  if (start && end && end < start) return { ok: false, error: "Coverage end must be after the start." };

  const touchesSubstance = SUBSTANTIVE.some((k) => k in changes);
  const quality =
    changes.quality ?? (!isStaff && current.quality === "validated" && touchesSubstance ? "unverified" : current.quality);

  const [item] = await db
    .update(schema.dataItems)
    .set({ ...changes, quality, lastReviewedAt: new Date(), reviewedBy: actor.id })
    .where(and(eq(schema.dataItems.companyId, company.id), eq(schema.dataItems.itemKey, itemKey)))
    .returning();
  return item ? { ok: true, item } : { ok: false, error: "Unknown data item." };
}

// ---------------------------------------------------------------------------
// Reading and assessment
// ---------------------------------------------------------------------------

export type ReadinessFile = {
  id: string;
  filename: string;
  status: (typeof schema.docStatus.enumValues)[number];
  error: string | null;
  itemKeys: string[];
  category: (typeof schema.dataCategory.enumValues)[number] | null;
  createdAt: string;
  columns: string[];
  dateRange: { start: string; end: string } | null;
  dataPointsFound: number;
};

export type Readiness = {
  items: DataItemRow[];
  files: ReadinessFile[];
  assessment: Assessment;
  /** Expected columns missing from the files attached to each item. */
  missingFields: Record<string, string[]>;
  openConflicts: { title: string; description: string | null }[];
};

/** Everything the readiness pages show for one company the caller may see. */
export async function getReadiness(company: Company, now = new Date()): Promise<Readiness> {
  await ensureDataItems(company);
  const [items, docs, conflicts] = await Promise.all([
    loadItems(company),
    db.select().from(schema.documents).where(eq(schema.documents.companyId, company.id)).orderBy(desc(schema.documents.createdAt)),
    db
      .select({ title: schema.registerItems.title, description: schema.registerItems.description })
      .from(schema.registerItems)
      .where(
        and(
          eq(schema.registerItems.companyId, company.id),
          eq(schema.registerItems.type, "conflict"),
          eq(schema.registerItems.status, "open"),
        ),
      ),
  ]);

  const files: ReadinessFile[] = docs.map((d) => ({
    id: d.id,
    filename: d.filename,
    status: d.status,
    error: d.error,
    itemKeys: d.dataItemKeys,
    category: d.dataCategory,
    createdAt: d.createdAt.toISOString(),
    columns: [...new Set(d.profile?.sheets.flatMap((s) => s.columns) ?? [])],
    dateRange: d.profile?.dateRange ?? null,
    dataPointsFound: d.dataPointsFound,
  }));

  const missingFields: Record<string, string[]> = {};
  const states: ItemState[] = items
    .filter((i) => ALL_ITEM_KEYS.includes(i.itemKey))
    .map((i) => {
      const linked = files.filter((f) => f.itemKeys.includes(i.itemKey));
      const columns = linked.flatMap((f) => f.columns);
      const missing = columns.length ? missingFieldsFor(i.itemKey, columns) : [];
      if (missing.length) missingFields[i.itemKey] = missing;
      return {
        key: i.itemKey,
        status: i.status,
        quality: i.quality,
        coverageStart: i.coverageStart,
        coverageEnd: i.coverageEnd,
        limitations: i.limitations,
        followUp: i.followUp,
        fileCount: linked.length,
        missingFields: missing,
      };
    });

  return { items, files, assessment: assessReadiness(states, conflicts, now), missingFields, openConflicts: conflicts };
}

/** Hands off to the benchmark: moves the company out of intake/upload once the critical inputs exist. */
export async function markReadyForBenchmark(company: Company): Promise<{ ok: true } | { ok: false; error: string }> {
  const { assessment } = await getReadiness(company);
  if (!assessment.readyForBenchmark) return { ok: false, error: assessment.benchmarkBlockers.join("; ") };
  if (company.phase === "intake" || company.phase === "upload") {
    await db.update(schema.companies).set({ phase: "benchmark" }).where(eq(schema.companies.id, company.id));
  }
  return { ok: true };
}

export async function latestAssessment(company: Company) {
  const [row] = await db
    .select()
    .from(schema.readinessAssessments)
    .where(eq(schema.readinessAssessments.companyId, company.id))
    .orderBy(desc(schema.readinessAssessments.createdAt))
    .limit(1);
  return row ?? null;
}
