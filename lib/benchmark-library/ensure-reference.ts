import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { dedupeKey, validateRecord } from "./records";
import { STANDARD_REFERENCE_DATASET, STANDARD_REFERENCE_RECORDS, STANDARD_REFERENCE_SOURCE } from "./standard-reference";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Loads the initial standard reference into the Benchmark Library as a published dataset, once:
 * if any source is already flagged as the standard reference, nothing changes, so admin edits
 * (and deliberate removals of the flag) are never overwritten. Returns whether it created it.
 */
export async function ensureStandardReference(db: Db): Promise<boolean> {
  const [existing] = await db.select({ id: schema.benchmarkSources.id }).from(schema.benchmarkSources).where(eq(schema.benchmarkSources.standardReference, true)).limit(1);
  if (existing) return false;
  const records = STANDARD_REFERENCE_RECORDS.map((raw) => {
    const { record, issues } = validateRecord(raw);
    if (!record) throw new Error(`Standard reference record is invalid: ${issues.map((i) => i.message).join("; ")}`);
    return record;
  });
  const now = new Date();
  return db.transaction(async (tx) => {
    const [source] = await tx.insert(schema.benchmarkSources).values({ ...STANDARD_REFERENCE_SOURCE, lastVerifiedAt: now }).returning({ id: schema.benchmarkSources.id });
    const [dataset] = await tx.insert(schema.benchmarkDatasets).values({ ...STANDARD_REFERENCE_DATASET, sourceId: source!.id, businessModels: ["B2B SaaS"] }).returning({ id: schema.benchmarkDatasets.id });
    const [version] = await tx
      .insert(schema.benchmarkDatasetVersions)
      .values({
        datasetId: dataset!.id,
        version: 1,
        status: "published",
        publishedAt: now,
        publishedOn: now.toISOString().slice(0, 10),
        changeNote: "Initial standard reference (owner decision).",
        history: [{ at: now.toISOString(), by: null, action: "published", note: "Initial standard reference (owner decision)." }],
      })
      .returning({ id: schema.benchmarkDatasetVersions.id });
    await tx.insert(schema.benchmarkRecords).values(records.map((r) => ({ ...r, versionId: version!.id, dedupeKey: dedupeKey(r) })));
    return true;
  });
}
