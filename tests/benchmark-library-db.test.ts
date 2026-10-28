/** Benchmark Library against Postgres (PGlite). Values are test fixtures, not benchmarks. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import {
  addRecord,
  archiveDataset,
  benchmarkCompany,
  checkImportFile,
  commitImport,
  createDataset,
  deleteRecord,
  getDataset,
  libraryOverview,
  listDatasets,
  listRecords,
  markReviewed,
  openDraft,
  previewImport,
  publishVersion,
  recordUsage,
  reproduceComparison,
  saveSource,
  setOverride,
  updateRecord,
  validateVersion,
  versionIssues,
  type SourceInput,
} from "@/lib/data/benchmark-library";
import type { RawRecord } from "@/lib/benchmark-library/records";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let admin: User;
let advisor: User;
let co: Company;
let other: Company;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.benchmarkUsages, schema.benchmarkOverrides, schema.benchmarkImports, schema.benchmarkRecords, schema.benchmarkDatasetVersions, schema.benchmarkDatasets, schema.benchmarkSources, schema.deliverables, schema.companies, schema.users]) await db().delete(t);
  [admin, advisor] = (await db()
    .insert(schema.users)
    .values([
      { email: "admin@gg.test", authUserId: "a", role: "admin" },
      { email: "advisor@gg.test", authUserId: "b", role: "advisor" },
    ])
    .returning()) as [User, User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Test Co", stage: "Series A", arr: 4_000_000 }, { name: "Other Co", stage: "Seed", arr: 500_000 }]).returning()) as [Company, Company];
});

const SOURCE: SourceInput = {
  name: "Test Source",
  publisher: "Test Publisher",
  url: null,
  documentRef: null,
  publishedOn: "2026-01-15",
  collectionPeriod: "2025",
  kind: "published_report",
  attribution: "Test attribution",
  licenceNote: null,
  allowCustomerDisplay: true,
  allowDerived: true,
  reliability: "reliable",
  updateFrequency: "Annual",
  reviewIntervalDays: 365,
  consentReference: null,
  minAggregationSize: null,
  notes: null,
};
const REC: RawRecord = { metric: "nrr", definition: "Test definition", definitionMatches: "yes", unit: "percent", statistic: "median", value: "100", stages: "Series A", arrMin: "1M", arrMax: "10M", period: "FY2025", periodBasis: "annual", cohortDefinition: "Test cohort", sampleSize: "40" };

async function dataset(src: Partial<SourceInput> = {}) {
  const s = await saveSource(admin, { ...SOURCE, ...src });
  if (!s.ok) throw new Error(s.error);
  const d = await createDataset(admin, { name: `Test dataset ${Math.random()}`, description: null, sourceId: s.id, companyTypes: ["B2B SaaS"], businessModels: [] });
  if (!d.ok) throw new Error(d.error);
  return d;
}
const csv = (rows: string[]) => ["metric,definition,definition_matches,unit,statistic,percentile,value,stages,arr_min,arr_max,period,period_basis,cohort_definition,sample_size", ...rows].join("\n");
const ROW = (stat: string, pct: string, value: string, period = "FY2025") => `nrr,Test definition,yes,percent,${stat},${pct},${value},Series A,1M,10M,${period},annual,Test cohort,40`;

describe("access", () => {
  it("only administrators can change the library", async () => {
    expect(await saveSource(advisor, SOURCE)).toEqual({ ok: false, error: expect.stringMatching(/Only administrators/) });
    const d = await dataset();
    expect(await addRecord(advisor, d.versionId, REC)).toMatchObject({ ok: false, error: expect.stringMatching(/Only administrators/) });
    expect(await publishVersion(advisor, d.versionId, null)).toMatchObject({ ok: false });
    expect(await commitImport(advisor, d.id, { filename: "x.csv", text: csv([ROW("median", "", "100")]) }, undefined)).toMatchObject({ ok: false });
    expect(await archiveDataset(advisor, d.id)).toMatchObject({ ok: false });
  });
});

describe("dataset lifecycle", () => {
  it("creates, edits, validates, publishes, reviews and archives; published versions can't change", async () => {
    const d = await dataset();
    const r = await addRecord(admin, d.versionId, REC);
    expect(r.ok).toBe(true);
    expect(await addRecord(admin, d.versionId, REC)).toMatchObject({ ok: false, error: expect.stringMatching(/already has a record/) });
    expect(await addRecord(admin, d.versionId, { ...REC, unit: "usd" })).toMatchObject({ ok: false, issues: [expect.objectContaining({ field: "unit" })] });
    expect(await publishVersion(admin, d.versionId, null)).toMatchObject({ ok: false, error: /Validate/ });
    expect(await validateVersion(admin, d.versionId)).toMatchObject({ ok: true });
    // An edit sends it back to draft.
    if (!r.ok) throw new Error();
    await updateRecord(admin, r.id, { ...REC, value: "101" });
    expect((await getDataset(d.id))!.versions[0]!.status).toBe("draft");
    await validateVersion(admin, d.versionId);
    expect(await publishVersion(admin, d.versionId, "2026-02-01")).toEqual({ ok: true });
    const pub = (await getDataset(d.id))!.versions[0]!;
    expect(pub).toMatchObject({ status: "published", effectiveDate: "2026-02-01", publishedOn: "2026-01-15" });
    expect(pub.history.map((e) => e.action)).toEqual(["created", "record added (nrr)", "validated", "record edited (nrr)", "validated", "published"]);
    expect(await updateRecord(admin, r.id, { ...REC, value: "120" })).toMatchObject({ ok: false, error: /can't be changed/ });
    expect(await deleteRecord(admin, r.id)).toMatchObject({ ok: false });
    expect(await markReviewed(admin, d.versionId, "Checked against the source")).toEqual({ ok: true });
    expect(await archiveDataset(admin, d.id)).toEqual({ ok: true });
    expect((await getDataset(d.id))!.versions[0]!.status).toBe("archived");
    expect(await openDraft(admin, d.id)).toMatchObject({ ok: false, error: /archived/ });
  });

  it("refuses to validate conflicting or incomplete versions, and enforces aggregation safeguards", async () => {
    const d = await dataset();
    expect(await validateVersion(admin, d.versionId)).toMatchObject({ ok: false });
    expect((await versionIssues(d.versionId))[0]!.message).toMatch(/no records/);
    await addRecord(admin, d.versionId, REC);
    await addRecord(admin, d.versionId, { ...REC, statistic: "percentile", percentile: "75", value: "90" });
    expect(await validateVersion(admin, d.versionId)).toMatchObject({ ok: false, error: /1 problem/ });

    expect(await saveSource(admin, { ...SOURCE, name: "Agg", kind: "aggregated_customer" })).toMatchObject({ ok: false, error: /consent reference/ });
    const agg = await dataset({ name: "Agg", kind: "aggregated_customer", consentReference: "DPA-0", minAggregationSize: 10 });
    await addRecord(admin, agg.versionId, { ...REC, sampleSize: "6" });
    expect((await versionIssues(agg.versionId)).map((i) => i.message)).toContain("Aggregated customer data needs at least 10 companies per cohort (re-identification safeguard).");
  });
});

describe("CSV import", () => {
  it("previews, saves accepted rows as a draft, logs the import, and never duplicates", async () => {
    const d = await dataset();
    const file = csv([ROW("median", "", "100"), ROW("percentile", "75", "110"), ROW("percentile", "25", "abc")]);
    const p = await previewImport(admin, d.id, file);
    expect(p.ok && p.preview.counts).toEqual({ total: 3, accepted: 2, rejected: 1, skipped: 0 });
    const stored: string[] = [];
    const r = await commitImport(admin, d.id, { filename: "nrr.csv", text: file }, undefined, async (path) => (stored.push(path), `blob://${path}`));
    expect(r).toMatchObject({ ok: true, accepted: 2 });
    expect(stored[0]).toMatch(/^benchmarks\/imports\/.+\.csv$/);
    // Re-importing the same file adds nothing.
    const again = await commitImport(admin, d.id, { filename: "nrr.csv", text: file }, undefined);
    expect(again).toMatchObject({ ok: false, error: /No rows could be imported/ });
    expect(await listRecords(d.versionId)).toHaveLength(2);
    const imports = (await getDataset(d.id))!.imports;
    expect(imports.map((i) => [i.status, i.rowsAccepted, i.rowsRejected, i.rowsSkipped])).toEqual([["failed", 0, 1, 2], ["committed", 2, 1, 0]]);
    expect(imports[1]).toMatchObject({ filename: "nrr.csv", blobUrl: expect.stringMatching(/^blob:/), by: "admin@gg.test", errors: [expect.objectContaining({ line: 4, field: "value" })] });
  });

  it("logs a failed import and rejects files that aren't small text CSVs", async () => {
    const d = await dataset();
    expect(await commitImport(admin, d.id, { filename: "bad.csv", text: "metric,value\nnrr,1" }, undefined)).toMatchObject({ ok: false, error: /No column mapped/ });
    expect((await getDataset(d.id))!.imports[0]).toMatchObject({ status: "failed", rowsAccepted: 0 });
    expect(checkImportFile("x.xlsx", 10, "a")).toMatch(/\.csv/);
    expect(checkImportFile("x.csv", 2_000_000, "a")).toMatch(/1 MB/);
    expect(checkImportFile("x.csv", 3, "a\u0000b")).toMatch(/text CSV/);
  });

  it("imports into a new draft copied from the published version, leaving the published one intact", async () => {
    const d = await dataset();
    await commitImport(admin, d.id, { filename: "v1.csv", text: csv([ROW("median", "", "100")]) }, undefined);
    await validateVersion(admin, d.versionId);
    await publishVersion(admin, d.versionId, null);
    const r = await commitImport(admin, d.id, { filename: "v2.csv", text: csv([ROW("median", "", "100"), ROW("median", "", "104", "FY2026")]) }, undefined);
    expect(r).toMatchObject({ ok: true, accepted: 1 });
    if (!r.ok) throw new Error();
    expect(r.versionId).not.toBe(d.versionId);
    expect(await listRecords(d.versionId)).toHaveLength(1);
    expect((await listRecords(r.versionId)).map((x) => x.period).sort()).toEqual(["FY2025", "FY2026"]);
    const row = (await listDatasets()).find((x) => x.id === d.id)!;
    expect(row).toMatchObject({ status: "published", publishedVersion: 1, draftVersion: { version: 2, status: "draft" } });
  });
});

async function publishedNrr(values: [string, string, string][] = [["median", "", "100"], ["percentile", "75", "110"]], src: Partial<SourceInput> = {}) {
  const d = await dataset(src);
  await commitImport(admin, d.id, { filename: "nrr.csv", text: csv(values.map(([s, p, v]) => ROW(s, p, v))) }, undefined);
  expect(await validateVersion(admin, d.versionId)).toMatchObject({ ok: true });
  expect(await publishVersion(admin, d.versionId, null)).toEqual({ ok: true });
  return d;
}

describe("assessment retrieval", () => {
  it("compares a company with the published cohort that fits, and says when nothing does", async () => {
    await publishedNrr();
    const fig = [{ metric: "nrr" as const, value: 94, period: "FY2025", origin: "calculated" }, { metric: "win_rate" as const, value: 20, period: null, origin: "manual" }];
    const r = await benchmarkCompany(co, fig);
    expect(r.comparisons).toHaveLength(1);
    expect(r.comparisons[0]).toMatchObject({ metric: "nrr", quality: "strong", derived: { formatted: "6 pts below", better: false } });
    expect(r.missing).toEqual([{ metric: "win_rate", label: "Win Rate", reason: "No published benchmark exists for this metric yet." }]);
    // A Seed company doesn't get a Series A comparison.
    expect((await benchmarkCompany(other, fig)).comparisons).toEqual([]);
    // Sample companies are never benchmarked against the library.
    expect((await benchmarkCompany({ ...co, isSample: true }, fig)).comparisons).toEqual([]);
  });

  it("doesn't use drafts, or sources whose licence forbids customer display", async () => {
    const d = await dataset();
    await addRecord(admin, d.versionId, REC);
    expect((await benchmarkCompany(co, [{ metric: "nrr", value: 94, period: null, origin: "manual" }])).comparisons).toEqual([]);
    await publishedNrr(undefined, { name: "Restricted", allowCustomerDisplay: false });
    expect((await benchmarkCompany(co, [{ metric: "nrr", value: 94, period: null, origin: "manual" }])).missing[0]!.reason).toMatch(/licence/);
  });

  it("applies an advisor's override for that company only", async () => {
    await publishedNrr();
    expect(await setOverride(advisor, co, "nrr", null, "Definition differs from ours")).toEqual({ ok: true });
    expect((await benchmarkCompany(co, [{ metric: "nrr", value: 94, period: null, origin: "manual" }])).missing[0]!.reason).toMatch(/advisor chose not to benchmark/);
    // Another company is unaffected by this company's override.
    const [third] = (await db().insert(schema.companies).values({ name: "Third", stage: "Series A", arr: 3_000_000 }).returning()) as [Company];
    expect((await benchmarkCompany(third, [{ metric: "nrr", value: 94, period: null, origin: "manual" }])).comparisons).toHaveLength(1);
    expect(await setOverride(advisor, co, "nrr", "00000000-0000-0000-0000-000000000000", "Use this")).toMatchObject({ ok: false });
  });

  it("reproduces an old report's comparison from the version it used after a new version is published", async () => {
    const d = await publishedNrr();
    const before = await benchmarkCompany(co, [{ metric: "nrr", value: 94, period: null, origin: "manual" }]);
    const saved = before.comparisons[0]!;
    const [deliverable] = await db().insert(schema.deliverables).values({ companyId: co.id, type: "baseline", useCase: "growth_leak", version: 1, status: "in_review" }).returning();
    await recordUsage(deliverable!.id, co.id, before.comparisons);

    // Version 2 changes the median.
    const draft = await openDraft(admin, d.id);
    if (!draft.ok) throw new Error();
    const median = (await listRecords(draft.versionId)).find((r) => r.statistic === "median")!;
    await updateRecord(admin, median.id, { ...REC, value: "105" });
    await validateVersion(admin, draft.versionId);
    await publishVersion(admin, draft.versionId, null);

    const after = await benchmarkCompany(co, [{ metric: "nrr", value: 94, period: null, origin: "manual" }]);
    expect(after.comparisons[0]!.derived!.formatted).toBe("11 pts below");
    expect(after.comparisons[0]!.benchmark.dataset.version).toBe(2);
    // The old report still reproduces exactly from version 1 (now archived).
    expect(await reproduceComparison(saved)).toEqual({ ok: true, differences: [] });
    expect(saved.benchmark.dataset.version).toBe(1);
    const usage = (await getDataset(d.id))!.usage;
    expect(usage).toEqual([expect.objectContaining({ company: "Test Co", datasetVersion: 1, metrics: ["nrr"] })]);
    // Records a report used can't be deleted out from under it.
    await expect(db().delete(schema.benchmarkRecords).where(eq(schema.benchmarkRecords.id, saved.benchmark.stats[0]!.recordId))).rejects.toThrow();
  });
});

describe("overview", () => {
  it("counts published coverage, gaps, pending records, validation errors and usage", async () => {
    await publishedNrr();
    const pending = await dataset({ name: "Pending source" });
    await addRecord(admin, pending.versionId, { ...REC, metric: "win_rate", value: "20" });
    await addRecord(admin, pending.versionId, { ...REC, metric: "win_rate", statistic: "percentile", percentile: "75", value: "10" });
    const o = await libraryOverview();
    expect(o).toMatchObject({ publishedDatasets: 1, publishedMetrics: 1, publishedRecords: 2, sources: ["Test Source"], awaitingReview: { records: 2, versions: 1 } });
    expect(o.gaps.find((g) => g.metric === "nrr")!.missingStages).toEqual(["Pre-seed", "Seed", "Series B", "Series C+"]);
    expect(o.gaps.find((g) => g.metric === "win_rate")!.records).toBe(0);
    expect(o.withErrors).toHaveLength(1);
    expect(o.stale).toEqual([]);
  });
});
