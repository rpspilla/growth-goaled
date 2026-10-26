/** Choosing between profile and file values, and entering missing figures, against Postgres (PGlite). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { chooseFigure, enterFigure, figureChoices } from "@/lib/data/figures";
import { getIntakeAnswers, saveIntakeAnswer } from "@/lib/data/intake";
import { assembleAssessmentInputs } from "@/lib/data/assessments";
import { saveObjectiveAnswer } from "@/lib/data/use-cases";
import { getUseCase } from "@/lib/use-cases";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User;
let co: Company;
let other: Company;
let fileNrr: string;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.registerItems, schema.intakeResponses, schema.dataPoints, schema.documents, schema.companyUseCases, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder] = (await db().insert(schema.users).values({ email: "f@co.test", authUserId: "f", role: "founder" }).returning()) as [User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Leak Co" }, { name: "Other" }]).returning()) as [Company, Company];
  expect((await saveIntakeAnswer(founder, co, "customers", "nrr", "94")).ok).toBe(true);
  const [doc] = await db().insert(schema.documents).values({ companyId: co.id, docType: "other", blobUrl: "x", filename: "metrics.xlsx", mime: "text/csv", size: 1, status: "done" }).returning();
  const [dp] = await db().insert(schema.dataPoints).values({ companyId: co.id, metric: "nrr", value: 101, unit: "percent", confidence: "medium", status: "proposed", documentId: doc!.id }).returning();
  fileNrr = dp!.id;
  const profileDp = (await db().select().from(schema.dataPoints).where(and(eq(schema.dataPoints.companyId, co.id), eq(schema.dataPoints.value, 94))))[0]!;
  await db().insert(schema.registerItems).values({ companyId: co.id, type: "conflict", title: "Conflicting nrr data", dataPointIds: [profileDp.id, fileNrr], owner: "founder" });
});

describe("check your figures", () => {
  it("shows every value with its source and flags the disagreement, which the assessment reports as a gap", async () => {
    const [nrr, grr] = await figureChoices(co, ["nrr", "grr"]);
    expect(nrr).toMatchObject({ state: "conflict", label: "NRR" });
    expect(nrr!.candidates.map((c) => [c.formatted, c.source, c.status])).toEqual([
      ["94%", "Your company profile", "accepted"],
      ["101%", "metrics.xlsx", "proposed"],
    ]);
    expect(grr).toMatchObject({ state: "missing", candidates: [] });

    await saveObjectiveAnswer(co, "growth_leak", "goal", "Find the leak");
    const inputs = await assembleAssessmentInputs(co, getUseCase("growth_leak")!);
    expect(inputs.input.conflicts).toEqual([{ metric: "nrr", label: "NRR", values: "94% in your company profile vs 101% in metrics.xlsx" }]);
    expect(inputs.input.completeness).not.toBe("complete");
  });

  it("choosing the file's value accepts it, updates the profile to match and closes the conflict question", async () => {
    expect(await chooseFigure(founder, co, "nrr", fileNrr)).toEqual({ ok: true });
    const [nrr] = await figureChoices(co, ["nrr"]);
    expect(nrr!.state).toBe("agreed");
    expect(nrr!.candidates.every((c) => c.formatted === "101%" && c.status === "accepted")).toBe(true);
    expect((await getIntakeAnswers(co))["customers.nrr"]).toBe(101);
    const [item] = await db().select().from(schema.registerItems).where(eq(schema.registerItems.companyId, co.id));
    expect(item).toMatchObject({ status: "resolved", resolution: expect.objectContaining({ kind: "choose", label: "101%", via: "assessment" }) });
  });

  it("choosing the profile value sets the file's value aside", async () => {
    const profile = (await figureChoices(co, ["nrr"]))[0]!.candidates.find((c) => c.source === "Your company profile")!;
    expect(await chooseFigure(founder, co, "nrr", profile.id)).toEqual({ ok: true });
    const [file] = await db().select().from(schema.dataPoints).where(eq(schema.dataPoints.id, fileNrr));
    expect(file!.status).toBe("rejected");
    expect((await figureChoices(co, ["nrr"]))[0]).toMatchObject({ state: "agreed" });
  });

  it("enters missing figures: into the profile when it has a field, otherwise as a figure of their own", async () => {
    expect(await enterFigure(founder, co, "sales_cycle_days", 94)).toEqual({ ok: true });
    expect((await getIntakeAnswers(co))["customers.sales_cycle"]).toBe(94);
    expect(await enterFigure(founder, co, "quota_attainment", 71)).toEqual({ ok: true });
    const [quota] = await figureChoices(co, ["quota_attainment"]);
    expect(quota).toMatchObject({ state: "agreed", candidates: [expect.objectContaining({ formatted: "71%", source: "Entered by you" })] });
    // Typing a correction for a conflicting metric settles it too.
    expect(await enterFigure(founder, co, "nrr", 99)).toEqual({ ok: true });
    expect((await figureChoices(co, ["nrr"]))[0]).toMatchObject({ state: "agreed" });
    expect(await enterFigure(founder, co, "nrr", 5000)).toMatchObject({ ok: false });
  });

  it("never touches another company's figures", async () => {
    expect(await chooseFigure(founder, other, "nrr", fileNrr)).toEqual({ ok: false, error: "That figure wasn't found." });
    expect(await chooseFigure(founder, co, "arr", fileNrr)).toMatchObject({ ok: false });
    const [file] = await db().select().from(schema.dataPoints).where(eq(schema.dataPoints.id, fileNrr));
    expect(file!.status).toBe("proposed");
  });
});
