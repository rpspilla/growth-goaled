/** The company profile fills its empty answers from figures in uploaded documents (PGlite). */
import { beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { documentFilledAnswers, fillProfileFromDocuments, getIntakeAnswers, saveIntakeAnswer } from "@/lib/data/intake";
import { INTAKE_SECTIONS } from "@/lib/intake";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
const keyOf = (metric: string) => {
  for (const s of INTAKE_SECTIONS) for (const f of s.fields) if (f.metric === metric && !f.rangeOf && !f.askAsRange) return [s.id, f.id] as const;
  throw new Error(metric);
};

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

describe("profile from documents", () => {
  it("fills empty answers from the newest file, says which file, and leaves the founder's own answers alone", async () => {
    const [user] = (await db().insert(schema.users).values({ email: "f@co.test", authUserId: "f", role: "founder" }).returning()) as [User];
    const [co] = (await db().insert(schema.companies).values({ name: "Docs Co" }).returning()) as [Company];
    const [doc] = await db().insert(schema.documents).values({ companyId: co.id, docType: "financial_model", blobUrl: "x", filename: "model.xlsx", mime: "x", size: 1, status: "done" }).returning();
    const [s, f] = keyOf("customers");
    await saveIntakeAnswer(user, co, s, f, "40");
    await db().insert(schema.dataPoints).values([
      { companyId: co.id, metric: "arr", value: 2_400_000, unit: "usd", documentId: doc!.id, confidence: "high", status: "proposed", origin: "extracted" },
      { companyId: co.id, metric: "nrr", value: 108, unit: "percent", documentId: doc!.id, confidence: "high", status: "accepted", origin: "calculated" },
      { companyId: co.id, metric: "customers", value: 55, unit: "count", documentId: doc!.id, confidence: "high", status: "accepted", origin: "extracted" },
    ]);
    expect(await fillProfileFromDocuments(user, co)).toBe(2);
    const answers = await getIntakeAnswers(co);
    expect(answers[keyOf("arr").join(".")]).toBe(2_400_000);
    expect(answers[keyOf("nrr").join(".")]).toBe(108);
    expect(answers[`${s}.${f}`]).toBe(40);
    expect(await documentFilledAnswers(co)).toEqual({ [keyOf("arr").join(".")]: "model.xlsx", [keyOf("nrr").join(".")]: "model.xlsx" });
    // Nothing left to fill: running again changes nothing.
    expect(await fillProfileFromDocuments(user, co)).toBe(0);
  });
});
