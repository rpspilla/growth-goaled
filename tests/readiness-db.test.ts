/**
 * Founder data-readiness workflow against a real Postgres (PGlite, in memory)
 * with the committed migrations applied. Blob storage and the model are
 * stubbed; everything else (persistence, scoping, dedupe, profiling,
 * assessment) runs for real.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({
  db: null as unknown as Record<string | symbol, unknown>,
  blobs: new Map<string, { contentType: string; body: string }>(),
  extract: vi.fn(),
  del: vi.fn(async (url: string) => void url),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@vercel/blob", () => ({
  head: async (pathname: string) => {
    const b = h.blobs.get(pathname);
    if (!b) throw new Error("not found");
    return { url: `https://blob.test/${pathname}`, size: b.body.length, contentType: b.contentType };
  },
  get: async (url: string) => {
    const b = h.blobs.get(url.replace("https://blob.test/", ""));
    return b ? { stream: new Response(b.body).body } : null;
  },
  del: h.del,
  put: async (pathname: string, body: Buffer, opts: { contentType: string }) => {
    const finalPath = pathname.replace(/(\.[a-z0-9]+)?$/i, (ext) => `-x1y2z3${ext}`);
    h.blobs.set(finalPath, { contentType: opts.contentType, body: body.toString() });
    return { url: `https://blob.test/${finalPath}`, pathname: finalPath };
  },
}));
vi.mock("@/lib/ai/extract", async () => {
  class ExtractionError extends Error {}
  return { ExtractionError, extractMetrics: h.extract };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { getReadiness, markReadyForBenchmark, updateDataItem } from "@/lib/data/readiness";
import { applySuggestions, companyBlobPrefix, importGoogleLink, listDocuments, processDocument, processInboxDocument, registerDocument, removeDocument, sortDocument } from "@/lib/data/documents";
import { AiConfigError } from "@/lib/ai/config";
import { ALL_ITEM_KEYS, getItem } from "@/lib/readiness";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;

let acme: Company;
let globex: Company;
let founder: User;
let otherFounder: User;
let advisor: User;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schemaMod = await import("@/lib/db/schema");
  const instance = drizzle(new PGlite(), { schema: schemaMod });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  h.blobs.clear();
  h.extract.mockReset();
  h.del.mockClear();
  await db().delete(schema.companies);
  await db().delete(schema.users);
  [acme, globex] = await db()
    .insert(schema.companies)
    .values([{ name: "Acme Analytics" }, { name: "Globex" }])
    .returning() as [Company, Company];
  [founder, otherFounder, advisor] = await db()
    .insert(schema.users)
    .values([
      { email: "maya@acme.test", authUserId: "a1", role: "founder" },
      { email: "hank@globex.test", authUserId: "a2", role: "founder" },
      { email: "advisor@growthgoaled.test", authUserId: "a3", role: "advisor" },
    ])
    .returning() as [User, User, User];
});

const put = (company: Company, name: string, contentType: string, body: string) => {
  const pathname = `${companyBlobPrefix(company.id)}customers/${name}`;
  h.blobs.set(pathname, { contentType, body });
  return pathname;
};
const hash = (c: string) => c.repeat(64);

describe("data item records", () => {
  it("creates every requirement for a company as not reviewed", async () => {
    const r = await getReadiness(acme);
    expect(r.items).toHaveLength(ALL_ITEM_KEYS.length);
    expect(r.items.every((i) => i.status === "not_reviewed" && i.quality === "unverified")).toBe(true);
    await getReadiness(acme); // idempotent
    expect((await getReadiness(acme)).items).toHaveLength(ALL_ITEM_KEYS.length);
  });

  it("persists status and details", async () => {
    const r = await updateDataItem(founder, acme, "monthly_revenue", {
      status: "partial",
      collectionMethod: "file_upload",
      sourceSystem: "QuickBooks",
      coverageStart: "2025-10",
      coverageEnd: "2026-09",
      limitations: "No recurring/one-off split before March",
      notes: "Board deck numbers differ slightly",
    });
    expect(r.ok).toBe(true);
    const row = (await getReadiness(acme)).items.find((i) => i.itemKey === "monthly_revenue")!;
    expect(row).toMatchObject({
      status: "partial",
      collectionMethod: "file_upload",
      sourceSystem: "QuickBooks",
      coverageStart: "2025-10-01",
      coverageEnd: "2026-09-01",
      limitations: "No recurring/one-off split before March",
      quality: "unverified",
      reviewedBy: founder.id,
    });
    expect(row.lastReviewedAt).toBeInstanceOf(Date);
  });

  it("rejects unknown items, bad dates and reversed coverage", async () => {
    expect((await updateDataItem(founder, acme, "made_up", { status: "available" })).ok).toBe(false);
    expect((await updateDataItem(founder, acme, "monthly_revenue", { coverageStart: "Oct 2025" })).ok).toBe(false);
    expect((await updateDataItem(founder, acme, "monthly_revenue", { coverageStart: "2026-09", coverageEnd: "2025-10" })).ok).toBe(false);
  });

  it("never lets a founder mark data validated or set follow-ups", async () => {
    const v = await updateDataItem(founder, acme, "monthly_revenue", { status: "available", quality: "validated" });
    expect(v).toEqual({ ok: false, error: expect.stringMatching(/advisor/) });
    expect((await updateDataItem(founder, acme, "monthly_revenue", { followUp: "x" })).ok).toBe(false);
    expect((await getReadiness(acme)).items.find((i) => i.itemKey === "monthly_revenue")!.quality).toBe("unverified");
  });

  it("resets an advisor's validation when the founder changes the substance", async () => {
    await updateDataItem(founder, acme, "current_cash", { status: "available" });
    expect((await updateDataItem(advisor, acme, "current_cash", { quality: "validated", followUp: "Confirm with Sep bank statement" })).ok).toBe(true);
    await updateDataItem(founder, acme, "current_cash", { notes: "From Mercury" });
    let row = (await getReadiness(acme)).items.find((i) => i.itemKey === "current_cash")!;
    expect(row.quality).toBe("validated"); // notes alone don't invalidate
    await updateDataItem(founder, acme, "current_cash", { coverageEnd: "2026-10" });
    row = (await getReadiness(acme)).items.find((i) => i.itemKey === "current_cash")!;
    expect(row.quality).toBe("unverified");
    expect(row.followUp).toBe("Confirm with Sep bank statement");
  });

  it("keeps each company's records separate", async () => {
    await updateDataItem(founder, acme, "monthly_revenue", { status: "available", sourceSystem: "Xero" });
    const g = await getReadiness(globex);
    expect(g.items.find((i) => i.itemKey === "monthly_revenue")).toMatchObject({ status: "not_reviewed", sourceSystem: null });
    expect(g.items.every((i) => i.companyId === globex.id)).toBe(true);
    // Updating Globex (even by a key Acme also has) leaves Acme alone.
    await updateDataItem(otherFounder, globex, "monthly_revenue", { status: "missing" });
    expect((await getReadiness(acme)).items.find((i) => i.itemKey === "monthly_revenue")!.status).toBe("available");
  });
});

describe("uploads", () => {
  const CSV = "text/csv";
  const customers = "Customer,Industry,Employees,Start date\nNorthwind,Logistics,420,2024-11-01\nInitech,Fintech,85,2026-02-15\n";

  it("links an upload to its items and marks them available but unverified", async () => {
    const pathname = put(acme, "customers.csv", CSV, customers);
    const { duplicate } = await registerDocument(founder, acme, { pathname, filename: "customers.csv", docType: "customer_list", category: "customers", itemKeys: ["customer_list", "industry"], contentHash: hash("a") });
    expect(duplicate).toBe(false);
    const r = await getReadiness(acme);
    expect(r.files).toHaveLength(1);
    expect(r.files[0]).toMatchObject({ status: "uploaded", category: "customers", itemKeys: ["customer_list", "industry"] });
    for (const key of ["customer_list", "industry"]) {
      expect(r.items.find((i) => i.itemKey === key)).toMatchObject({ status: "available", collectionMethod: "file_upload", quality: "unverified" });
    }
  });

  it("ignores item links from another category", async () => {
    const pathname = put(acme, "c.csv", CSV, customers);
    const { doc } = await registerDocument(founder, acme, { pathname, filename: "c.csv", docType: "customer_list", category: "customers", itemKeys: ["industry", "monthly_revenue"] });
    expect(doc.dataItemKeys).toEqual(["industry"]);
  });

  it("re-uploading the same file reuses the record instead of duplicating it", async () => {
    const first = put(acme, "customers.csv", CSV, customers);
    await registerDocument(founder, acme, { pathname: first, filename: "customers.csv", docType: "customer_list", category: "customers", itemKeys: ["customer_list"], contentHash: hash("b") });
    const second = put(acme, "customers-copy.csv", CSV, customers);
    const again = await registerDocument(founder, acme, { pathname: second, filename: "customers-copy.csv", docType: "customer_list", category: "customers", itemKeys: ["company_size"], contentHash: hash("b") });
    expect(again.duplicate).toBe(true);
    expect(h.del).toHaveBeenCalledWith(`https://blob.test/${second}`);
    const files = (await getReadiness(acme)).files;
    expect(files).toHaveLength(1);
    expect(files[0]!.itemKeys.sort()).toEqual(["company_size", "customer_list"]);
    // The same content for another company is a separate record.
    const g = put(globex, "customers.csv", CSV, customers);
    expect((await registerDocument(otherFounder, globex, { pathname: g, filename: "customers.csv", docType: "customer_list", category: "customers", contentHash: hash("b") })).duplicate).toBe(false);
  });

  it("refuses files outside the company's folder", async () => {
    const pathname = put(globex, "theirs.csv", CSV, customers);
    await expect(registerDocument(founder, acme, { pathname, filename: "theirs.csv", docType: "customer_list", category: "customers" })).rejects.toThrow(/belong/);
  });

  it("profiles a CSV, proposes extracted values and flags missing columns", async () => {
    h.extract.mockResolvedValue({ points: [{ metric: "arr", value: 4_200_000, period: "Sep 2026", page: null, raw_text: "Total ARR 4.2M", confidence: "high", inferred: false }], tokensIn: 10, tokensOut: 5, model: "test" });
    const pathname = put(acme, "customers.csv", CSV, customers);
    const { doc } = await registerDocument(founder, acme, { pathname, filename: "customers.csv", docType: "customer_list", category: "customers", itemKeys: ["revenue_by_customer"] });
    await processDocument(doc.id);
    const r = await getReadiness(acme);
    expect(r.files[0]).toMatchObject({ status: "done", columns: ["Customer", "Industry", "Employees", "Start date"], dateRange: { start: "2024-11-01", end: "2026-02-15" }, dataPointsFound: 1 });
    // A revenue-by-customer file with no revenue column is flagged, not assumed.
    expect(r.missingFields.revenue_by_customer?.length).toBeGreaterThan(0);
    const points = await db().select().from(schema.dataPoints).where(eq(schema.dataPoints.documentId, doc.id));
    expect(points).toHaveLength(1);
    expect(points[0]!.status).toBe("proposed"); // never accepted automatically
  });

  it("stores Word files without claiming to analyse them", async () => {
    const pathname = put(acme, "notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "PK…");
    const { doc } = await registerDocument(founder, acme, { pathname, filename: "notes.docx", docType: "other", category: "customers", itemKeys: ["use_case"] });
    await processDocument(doc.id);
    const f = (await getReadiness(acme)).files[0]!;
    expect(f.status).toBe("stored");
    expect(h.extract).not.toHaveBeenCalled();
    expect(f.dataPointsFound).toBe(0);
  });

  it("records a failure with its reason", async () => {
    const { ExtractionError } = await import("@/lib/ai/extract");
    h.extract.mockRejectedValue(new ExtractionError("The analysis returned invalid data twice."));
    const pathname = put(acme, "pipeline.csv", CSV, "Opportunity,Amount\nA,100\n");
    const { doc } = await registerDocument(founder, acme, { pathname, filename: "pipeline.csv", docType: "other", category: "customers" });
    await processDocument(doc.id);
    expect((await getReadiness(acme)).files[0]).toMatchObject({ status: "failed", error: "The analysis returned invalid data twice." });
  });
});

describe("readiness dashboard with realistic data", () => {
  /** A Series A company that has its finance and CRM in order but little product or churn data. */
  async function seedAcme() {
    const avail = (key: string, extra: Parameters<typeof updateDataItem>[3] = {}) => updateDataItem(founder, acme, key, { status: "available", ...extra });
    const year = { coverageStart: "2025-10", coverageEnd: "2026-09" };
    await avail("monthly_revenue", { sourceSystem: "QuickBooks", ...year });
    await avail("monthly_expenses", { sourceSystem: "QuickBooks", ...year });
    await avail("monthly_burn", year);
    await avail("current_cash", { sourceSystem: "Mercury", coverageStart: "2026-09", coverageEnd: "2026-09" });
    await avail("customer_list", { sourceSystem: "HubSpot" });
    await avail("revenue_by_customer", { sourceSystem: "Stripe", ...year });
    await updateDataItem(founder, acme, "industry", { status: "partial", limitations: "Industry only tagged for ~60% of accounts" });
    await avail("start_term");
    await avail("opportunities", { sourceSystem: "HubSpot", ...year });
    await avail("opp_value_dates", year);
    await avail("win_loss", { quality: "estimated" });
    await avail("marketing_spend", { coverageStart: "2025-01", coverageEnd: "2025-06" }); // stale
    await updateDataItem(founder, acme, "churned_revenue", { status: "missing", notes: "We don't track churn by dollar yet" });
    await updateDataItem(founder, acme, "ai_costs", { status: "not_applicable" });
  }

  it("separates completeness, quality and what can be calculated", async () => {
    await seedAcme();
    const { assessment: a } = await getReadiness(acme, new Date("2026-10-23T00:00:00Z"));

    expect(a.collection.requiredPercent).toBeGreaterThan(0);
    expect(a.collection.requiredPercent).toBeLessThan(100);
    expect(a.quality.validated).toBe(0); // founder marking ≠ validation
    expect(a.quality.estimated).toBe(1);
    const issue = (key: string) => a.quality.issues.filter((i) => i.key === key).map((i) => i.kind);
    expect(issue("marketing_spend")).toEqual(expect.arrayContaining(["outdated", "short_history"]));
    expect(issue("industry")).toContain("limitations");

    const metric = (key: string) => a.analytical.find((m) => m.key === key)!;
    expect(metric("revenue_growth").state).toBe("ready");
    expect(metric("net_revenue_retention")).toMatchObject({ state: "blocked", blockedBy: ["churned_revenue"] });
    expect(metric("blended_cac").state).toBe("limited");
    expect(a.gaps.missing).toContain("churned_revenue");
    expect(a.nextRequest).not.toBeNull();
    expect(a.readyForBenchmark).toBe(false);
    expect(a.benchmarkBlockers.join(" ")).toMatch(/retention/i);
  });

  it("only hands off to the benchmark once critical inputs are supplied", async () => {
    await seedAcme();
    expect((await markReadyForBenchmark(acme)).ok).toBe(false);
    // Founder reviews every remaining required item.
    for (const key of ALL_ITEM_KEYS.filter((k) => getItem(k)!.required)) {
      const row = (await getReadiness(acme)).items.find((i) => i.itemKey === key)!;
      if (row.status === "not_reviewed" || row.status === "missing") await updateDataItem(founder, acme, key, { status: "partial" });
    }
    const [company] = await db().update(schema.companies).set({ phase: "upload" }).where(eq(schema.companies.id, acme.id)).returning();
    expect(await markReadyForBenchmark(company!)).toEqual({ ok: true });
    const [after] = await db().select().from(schema.companies).where(eq(schema.companies.id, acme.id));
    expect(after!.phase).toBe("benchmark");
    // Globex was untouched.
    const [g] = await db().select().from(schema.companies).where(eq(schema.companies.id, globex.id));
    expect(g!.phase).toBe("intake");
  });
});

describe("upload whatever you have (inbox)", () => {
  const inboxPut = (company: Company, name: string, contentType: string, body: string) => {
    const pathname = `${companyBlobPrefix(company.id)}inbox/${name}`;
    h.blobs.set(pathname, { contentType, body });
    return pathname;
  };
  const messy = "Month,Revenue,COGS,Customer,ARR,Industry\n2026-01,100000,20000,Acme,50000,Fintech\n2026-02,110000,21000,Globex,60000,Health\n";

  it("accepts any file type in the inbox, but not in checklist uploads", async () => {
    const pptx = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const inbox = inboxPut(acme, "board.pptx", pptx, "PK...");
    const { doc } = await registerDocument(founder, acme, { pathname: inbox, filename: "board.pptx", docType: "other" });
    expect(doc.inbox).toBe(true);
    const outside = put(acme, "board.pptx", pptx, "PK...");
    await expect(registerDocument(founder, acme, { pathname: outside, filename: "board.pptx", docType: "other" })).rejects.toThrow(/isn't supported/);
  });

  it("reads, extracts and suggests items for a messy spreadsheet; nothing is marked until confirmed", async () => {
    h.extract.mockResolvedValue({ points: [], tokensIn: 1, tokensOut: 1, model: "test" });
    const pathname = inboxPut(acme, "everything.csv", "text/csv", messy);
    const { doc } = await registerDocument(founder, acme, { pathname, filename: "everything.csv", docType: "other", contentHash: hash("c") });
    await processDocument(doc.id);
    const classify = vi.fn(async () => ({
      result: { summary: "Monthly P&L plus a customer list.", sections: [{ sheet: null, items: [{ key: "monthly_revenue", confidence: "high" as const, reason: "Revenue by month" }, { key: "revenue_by_customer", confidence: "medium" as const, reason: "ARR per customer" }] }] },
      model: "m",
      tokensIn: 1,
      tokensOut: 1,
    }));
    await sortDocument(doc.id, classify);

    const [view] = (await listDocuments(acme)).filter((d) => d.id === doc.id);
    expect(view).toMatchObject({ sortStatus: "sorted", sortSummary: "Monthly P&L plus a customer list.", sortReviewed: false });
    const byKey = Object.fromEntries(view!.suggestions.map((x) => [x.itemKey, x]));
    expect(byKey.monthly_revenue).toMatchObject({ source: "ai", confidence: "high", status: "suggested" });
    expect(byKey.revenue_by_customer).toBeDefined();
    expect((await getReadiness(acme)).items.find((i) => i.itemKey === "monthly_revenue")!.status).toBe("not_reviewed");

    const r = await applySuggestions(founder, acme, doc.id, ["monthly_revenue", "industry"]);
    expect(r).toEqual({ ok: true, linked: 2 });
    const after = await getReadiness(acme);
    expect(after.items.find((i) => i.itemKey === "monthly_revenue")).toMatchObject({ status: "available", quality: "unverified", collectionMethod: "file_upload" });
    expect(after.items.find((i) => i.itemKey === "revenue_by_customer")!.status).toBe("not_reviewed");
    const [confirmed] = (await listDocuments(acme)).filter((d) => d.id === doc.id);
    expect(confirmed!.sortReviewed).toBe(true);
    expect(confirmed!.itemKeys.sort()).toEqual(["industry", "monthly_revenue"]);
    expect(Object.fromEntries(confirmed!.suggestions.map((x) => [x.itemKey, x.status]))).toMatchObject({ monthly_revenue: "accepted", revenue_by_customer: "dismissed", industry: "accepted" });
  });

  it("stores unreadable formats and suggests from the file name only", async () => {
    const pathname = inboxPut(acme, "hubspot_pipeline.xls", "application/vnd.ms-excel", "binary");
    const { doc } = await registerDocument(founder, acme, { pathname, filename: "hubspot_pipeline.xls", docType: "other" });
    await processInboxDocument(doc.id);
    const [view] = await listDocuments(acme);
    expect(view).toMatchObject({ status: "stored", sortStatus: "sorted" });
    expect(view!.sortSummary).toMatch(/can't read this format/);
    expect(view!.suggestions.map((x) => x.itemKey)).toEqual(["opportunities"]);
    expect(h.extract).not.toHaveBeenCalled();
  });

  it("falls back to column matches when the model fails", async () => {
    h.extract.mockResolvedValue({ points: [], tokensIn: 1, tokensOut: 1, model: "test" });
    const pathname = inboxPut(acme, "data.csv", "text/csv", messy);
    const { doc } = await registerDocument(founder, acme, { pathname, filename: "data.csv", docType: "other" });
    await processDocument(doc.id);
    await sortDocument(doc.id, async () => {
      throw new Error("boom");
    });
    const [view] = await listDocuments(acme);
    expect(view!.sortStatus).toBe("failed");
    expect(view!.suggestions.some((x) => x.itemKey === "monthly_revenue" && x.source === "columns")).toBe(true);
  });

  it("won't apply suggestions to another company's file", async () => {
    const pathname = inboxPut(globex, "g.csv", "text/csv", messy);
    const { doc } = await registerDocument(otherFounder, globex, { pathname, filename: "g.csv", docType: "other" });
    expect((await applySuggestions(founder, acme, doc.id, ["monthly_revenue"])).ok).toBe(false);
  });
});

describe("removing a file", () => {
  it("removes the file and undoes what it added", async () => {
    const a = put(acme, "wrong.csv", "text/csv", "Customer,Industry\nA,B\n");
    const { doc } = await registerDocument(founder, acme, { pathname: a, filename: "wrong.csv", docType: "customer_list", category: "customers", itemKeys: ["customer_list", "industry", "company_size"] });
    const b = put(acme, "right.csv", "text/csv", "Customer,Employees\nA,10\n");
    await registerDocument(founder, acme, { pathname: b, filename: "right.csv", docType: "customer_list", category: "customers", itemKeys: ["company_size"] });
    await updateDataItem(founder, acme, "industry", { notes: "Tagged by hand in HubSpot" });

    const [proposed, accepted, intake] = await db()
      .insert(schema.dataPoints)
      .values([
        { companyId: acme.id, metric: "customers", value: 90, unit: "count", confidence: "high", status: "proposed", documentId: doc.id },
        { companyId: acme.id, metric: "acv", value: 40000, unit: "usd", confidence: "high", status: "accepted", documentId: doc.id },
        { companyId: acme.id, metric: "customers", value: 87, unit: "count", confidence: "high", status: "accepted" },
      ])
      .returning();
    await db().insert(schema.registerItems).values({ companyId: acme.id, type: "conflict", title: "Conflicting customers", dataPointIds: [intake!.id, proposed!.id], owner: "founder" });

    const r = await removeDocument(founder, acme, doc.id);
    expect(r).toEqual({ ok: true, itemsReset: 1, valuesRemoved: 2 });
    expect(h.del).toHaveBeenCalledWith(`https://blob.test/${a}`);
    expect((await listDocuments(acme)).map((d) => d.filename)).toEqual(["right.csv"]);

    const points = await db().select().from(schema.dataPoints).where(eq(schema.dataPoints.companyId, acme.id));
    expect(points.find((p) => p.id === proposed!.id)).toBeUndefined();
    expect(points.find((p) => p.id === accepted!.id)).toMatchObject({ status: "rejected", documentId: null });
    expect(points.find((p) => p.id === intake!.id)!.status).toBe("accepted");
    const [conflict] = await db().select().from(schema.registerItems).where(eq(schema.registerItems.companyId, acme.id));
    expect(conflict).toMatchObject({ status: "resolved" });

    const items = Object.fromEntries((await getReadiness(acme)).items.map((i) => [i.itemKey, i.status]));
    expect(items.customer_list).toBe("not_reviewed"); // only this file supported it
    expect(items.industry).toBe("available"); // founder added notes
    expect(items.company_size).toBe("available"); // another file supports it
  });

  it("only removes the company's own files", async () => {
    const g = put(globex, "g.csv", "text/csv", "a\n1\n");
    const { doc } = await registerDocument(otherFounder, globex, { pathname: g, filename: "g.csv", docType: "other" });
    expect((await removeDocument(founder, acme, doc.id)).ok).toBe(false);
    expect(await listDocuments(globex)).toHaveLength(1);
  });
});

describe("Google links and AI availability", () => {
  const SHEET = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0";
  const csvFetch = (async () =>
    new Response("Month,Revenue\n2026-01,100\n", { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="Everything.csv"' } })) as unknown as typeof fetch;

  it("imports a shared Google file into the inbox with its source link", async () => {
    const r = await importGoogleLink(founder, acme, SHEET, csvFetch);
    expect(r).toMatchObject({ ok: true, duplicate: false, filename: "Everything.csv" });
    const [doc] = await listDocuments(acme);
    expect(doc).toMatchObject({ inbox: true, sourceUrl: SHEET, mime: "text/csv", filename: "Everything.csv" });
    // Same content again reuses the record.
    expect(await importGoogleLink(founder, acme, SHEET, csvFetch)).toMatchObject({ ok: true, duplicate: true });
    expect(await listDocuments(acme)).toHaveLength(1);
  });

  it("refuses non-Google links and explains unshared files", async () => {
    expect(await importGoogleLink(founder, acme, "https://example.com/file.xlsx", csvFetch)).toMatchObject({ ok: false, error: expect.stringMatching(/Google Sheets, Docs, Slides or Drive/) });
    const forbidden = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
    expect(await importGoogleLink(founder, acme, SHEET, forbidden)).toMatchObject({ ok: false, error: expect.stringMatching(/Anyone with the link/) });
    expect(await listDocuments(acme)).toHaveLength(0);
  });

  it("tells the founder plainly when the AI isn't available, and still offers column matches", async () => {
    h.extract.mockRejectedValue(new AiConfigError("ANTHROPIC_API_KEY contains characters a real key can't"));
    const pathname = `${companyBlobPrefix(acme.id)}inbox/p.csv`;
    h.blobs.set(pathname, { contentType: "text/csv", body: "Month,Revenue,COGS\n2026-01,100,20\n" });
    const { doc } = await registerDocument(founder, acme, { pathname, filename: "p.csv", docType: "other" });
    await processDocument(doc.id);
    await sortDocument(doc.id, async () => {
      throw new AiConfigError("bad key");
    });
    const [view] = await listDocuments(acme);
    expect(view!.status).toBe("failed");
    expect(view!.error).toMatch(/Automatic reading isn't available right now/);
    expect(view!.error).not.toMatch(/ANTHROPIC_API_KEY/); // config details stay out of the founder's view
    expect(view!.sortStatus).toBe("failed");
    expect(view!.suggestions.some((x) => x.itemKey === "monthly_revenue")).toBe(true);
  });
});
