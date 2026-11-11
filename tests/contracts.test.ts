import { beforeAll, describe, expect, it, vi } from "vitest";
import { nextBillingDate } from "@/lib/contracts";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({ head: async (p: string) => ({ url: `https://blob.test/${p}` }), del: async () => {} }));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { createContract, listContracts, removeContract, updateContract } from "@/lib/data/contracts";

describe("nextBillingDate", () => {
  it("rolls forward by the cycle to the first date on or after today, keeping month ends", () => {
    expect(nextBillingDate("2026-01-31", "monthly", "2026-02-10")).toBe("2026-02-28");
    expect(nextBillingDate("2026-01-15", "monthly", "2026-01-10")).toBe("2026-01-15");
    expect(nextBillingDate("2026-01-15", "quarterly", "2026-05-01")).toBe("2026-07-15");
    expect(nextBillingDate("2025-03-01", "annual", "2026-11-11")).toBe("2027-03-01");
  });
  it("stops at the end date, and one-time contracts bill once", () => {
    expect(nextBillingDate("2026-01-01", "monthly", "2026-11-11", "2026-10-31")).toBeNull();
    expect(nextBillingDate("2026-12-01", "one_time", "2026-11-11")).toBe("2026-12-01");
    expect(nextBillingDate("2026-01-01", "one_time", "2026-11-11")).toBeNull();
    expect(nextBillingDate(null, "monthly", "2026-11-11")).toBeNull();
  });
});

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

describe("contracts on a company record", () => {
  it("are added with their file, billed forward a cycle, ended and removed; other companies' files are refused", async () => {
    const [advisor] = (await db().insert(schema.users).values({ email: "a@gg.test", authUserId: "a", role: "advisor" }).returning()) as [User];
    const [co, other] = (await db().insert(schema.companies).values([{ name: "Signed Co" }, { name: "Other" }]).returning()) as [Company, Company];
    const base = { status: "active" as const, billingCycle: "monthly" as const, amountCents: 119_900, startDate: "2026-11-01", endDate: null, nextBillingDate: "2026-12-01", notes: " Net 15 ", filename: "msa.pdf" };
    expect(await createContract(advisor, co, { ...base, title: "", pathname: null })).toEqual({ ok: false, error: "Give the contract a name." });
    expect(await createContract(advisor, co, { ...base, title: "MSA", pathname: `contracts/${other.id}/msa.pdf` })).toEqual({ ok: false, error: "That file doesn't belong to this company." });
    const r = await createContract(advisor, co, { ...base, title: "MSA", pathname: `contracts/${co.id}/msa.pdf` });
    expect(r.ok).toBe(true);
    let [c] = await listContracts(co.id);
    expect(c).toMatchObject({ title: "MSA", billingCycle: "monthly", amountCents: 119_900, nextBillingDate: "2026-12-01", filename: "msa.pdf", notes: "Net 15", blobUrl: `https://blob.test/contracts/${co.id}/msa.pdf` });
    await updateContract(co, c!.id, { billed: true });
    [c] = await listContracts(co.id);
    expect(c!.nextBillingDate).toBe("2027-01-01");
    await updateContract(co, c!.id, { status: "ended" });
    [c] = await listContracts(co.id);
    expect(c).toMatchObject({ status: "ended", nextBillingDate: null });
    expect(await removeContract(other, c!.id)).toBe(false);
    expect(await removeContract(co, c!.id)).toBe(true);
    expect(await listContracts(co.id)).toEqual([]);
  });
});
