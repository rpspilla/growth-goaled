/** Advisor-owned growth projects, their documents and results, and weekly priorities (PGlite). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { addProjectDocument, approveResult, companyProjects, createProject, currentPriorities, savePriorities, saveResult, updateProject } from "@/lib/data/projects";
import { weekStart, weekLabel } from "@/lib/weeks";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
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
  for (const t of [schema.weeklyPriorities, schema.projectResults, schema.projectDocuments, schema.growthProjects, schema.events, schema.companies, schema.users]) await db().delete(t);
  [advisor] = (await db().insert(schema.users).values({ email: "a@gg.test", authUserId: "a", role: "advisor" }).returning()) as [User];
  [co, other] = (await db().insert(schema.companies).values([{ name: "Co" }, { name: "Other" }]).returning()) as [Company, Company];
});

describe("weeks", () => {
  it("start on Monday", () => {
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // a Monday
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // the Sunday after
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekLabel("2026-11-16")).toBe("Nov 16 – Nov 22, 2026");
  });
});

describe("growth projects", () => {
  it("are created and completed by the advisor; founders see only approved results", async () => {
    expect(await createProject(advisor, co, { name: " ", startedOn: "2026-11-11" })).toEqual({ ok: false, error: "Name the project." });
    const created = await createProject(advisor, co, { name: "Growth Hiring Plan", startedOn: "2026-11-11" });
    if (!created.ok) throw new Error(created.error);
    // Documents: an https link (Google Doc) or a file in the company's folder; nothing else.
    expect(await addProjectDocument(advisor, co, created.id, { kind: "action_plan", title: "", url: "http://insecure.test/doc" })).toEqual({ ok: false, error: "Use an https:// link." });
    expect(await addProjectDocument(advisor, other, created.id, { kind: "action_plan", title: "", url: "https://docs.google.com/x" })).toEqual({ ok: false, error: "That project wasn't found." });
    expect(await addProjectDocument(advisor, co, created.id, { kind: "action_plan", title: "", url: "https://docs.google.com/document/d/1" })).toEqual({ ok: true });
    expect(await addProjectDocument(advisor, co, created.id, { kind: "document", title: "Comp plan", blobUrl: "https://blob.test/x", pathname: `projects/${other.id}/comp.pdf`, filename: "comp.pdf", mime: "application/pdf" })).toEqual({ ok: false, error: "That file doesn't belong to this company." });
    expect(await addProjectDocument(advisor, co, created.id, { kind: "document", title: "Comp plan", blobUrl: "https://blob.test/x", pathname: `projects/${co.id}/comp.pdf`, filename: "comp.pdf", mime: "application/pdf" })).toEqual({ ok: true });
    // Results: drafts until approved; editing an approved one takes it back to draft.
    expect(await saveResult(advisor, co, created.id, null, { label: "Pipeline created by the new hire", value: "$240,000", note: "" })).toEqual({ ok: true });
    let [founderView] = await companyProjects(co);
    expect(founderView).toMatchObject({ name: "Growth Hiring Plan", status: "open", startedOn: "2026-11-11", actionPlan: { title: "Action plan", url: "https://docs.google.com/document/d/1" }, documents: [{ title: "Comp plan" }], results: [] });
    const [advisorView] = await companyProjects(co, { allResults: true });
    const result = advisorView!.results[0]!;
    expect(await approveResult(advisor, co, result.id, true)).toEqual({ ok: true });
    [founderView] = await companyProjects(co);
    expect(founderView!.results.map((r) => r.value)).toEqual(["$240,000"]);
    await saveResult(advisor, co, created.id, result.id, { label: "Pipeline created by the new hire", value: "$260,000", note: "" });
    expect((await companyProjects(co))[0]!.results).toEqual([]);
    // Completing: the date defaults to today and can't be before the start.
    expect(await updateProject(co, created.id, { name: "Growth Hiring Plan", startedOn: "2026-11-11", status: "completed", completedOn: "2026-11-01" })).toEqual({ ok: false, error: "It can't be completed before it started." });
    expect(await updateProject(co, created.id, { name: "Growth Hiring Plan", startedOn: "2026-11-11", status: "completed", completedOn: "2026-11-11" })).toEqual({ ok: true });
    expect((await companyProjects(co))[0]).toMatchObject({ status: "completed", completedOn: "2026-11-11" });
    expect(await companyProjects(other)).toEqual([]);
  });
});

describe("weekly priorities", () => {
  it("are up to five a week, each with an action and a due date within the week; last week's show until this week's are set", async () => {
    const mon = "2026-11-16";
    expect(await savePriorities(advisor, co, "2026-11-17", [])).toEqual({ ok: false, error: "Pick the week." });
    expect(await savePriorities(advisor, co, mon, [{ title: "Close the AE hire", action: "", dueOn: null }])).toEqual({ ok: false, error: "Priority 1: add the action for the next seven days." });
    expect(await savePriorities(advisor, co, mon, [{ title: "Close the AE hire", action: "Send the offer", dueOn: "2026-11-30" }])).toEqual({ ok: false, error: "Priority 1: the due date should fall within the week." });
    expect(await savePriorities(advisor, co, mon, Array.from({ length: 6 }, (_, n) => ({ title: `P${n}`, action: "Do it", dueOn: null })))).toEqual({ ok: false, error: "At most 5 priorities a week." });
    expect(await savePriorities(advisor, co, mon, [{ title: "Close the AE hire", action: "Send the offer to the final candidate", dueOn: "2026-11-20" }, { title: "", action: "", dueOn: null }])).toEqual({ ok: true });
    expect(await currentPriorities(co, "2026-11-18")).toMatchObject({ weekStart: mon, current: true, items: [{ title: "Close the AE hire", action: "Send the offer to the final candidate", dueOn: "2026-11-20", position: 1 }] });
    // The next week, before the advisor sets it: last week's, marked as last week's.
    expect(await currentPriorities(co, "2026-11-24")).toMatchObject({ weekStart: mon, current: false });
    // Saving a week replaces it.
    await savePriorities(advisor, co, mon, [{ title: "Ramp plan", action: "Write the 30-day ramp", dueOn: null }]);
    expect((await currentPriorities(co, "2026-11-18"))!.items.map((i) => i.title)).toEqual(["Ramp plan"]);
    expect(await currentPriorities(other, "2026-11-18")).toBeNull();
  });
});
