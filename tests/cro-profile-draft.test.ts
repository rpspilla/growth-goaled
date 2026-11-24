/** Drafting a CRO's profile: the biography from a LinkedIn PDF, philosophy and style from two answers (PGlite; AI stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, bioCalls: [] as unknown[], voiceCalls: [] as unknown[], failVoice: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/ai/cro-profile", () => ({
  draftBio: async (input: unknown) => {
    h.bioCalls.push(input);
    return { bio: "Pia has led revenue at three Seed companies.", headline: "Former CRO at Acme" };
  },
  draftVoice: async (input: unknown) => {
    h.voiceCalls.push(input);
    if (h.failVoice) throw new Error("overloaded");
    return { philosophy: { hiring: "I hire a senior AE before a VP." }, style: { directness: "Very direct.", exampleInTheirWords: "Not yet." } };
  },
}));

import { schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { generateCroBio, generateCroVoice, getCroProfile, saveCroProfile, setCroProfileAdmin } from "@/lib/data/cro";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
const PDF = new TextEncoder().encode("%PDF-1.7 a linkedin profile");
const ANSWER = "Not yet. Keep selling yourself and hire one senior AE who can repeat what you do.";
let admin: User;
let own: User;
let other: User;
let cro: string;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.croProfiles, schema.events, schema.users]) await db().delete(t);
  [admin, own, other] = (await db()
    .insert(schema.users)
    .values([
      { email: "a@gg.test", authUserId: "a", role: "admin" },
      { email: "o@gg.test", authUserId: "o", role: "advisor" },
      { email: "x@gg.test", authUserId: "x", role: "advisor" },
    ])
    .returning()) as [User, User, User];
  const r = await saveCroProfile(admin, null, { name: "Pia Draft", linkedinUrl: "https://www.linkedin.com/in/pia" });
  if (!r.ok) throw new Error("setup");
  cro = r.id;
  await setCroProfileAdmin(admin, cro, { status: "draft", inCollective: false, userId: own.id });
  h.bioCalls = [];
  h.voiceCalls = [];
  h.failVoice = false;
});

describe("drafting a CRO profile", () => {
  it("writes and saves the biography from a LinkedIn PDF, filling an empty headline", async () => {
    expect(await generateCroBio(other, cro, PDF)).toEqual({ ok: false, error: "Only an admin or the CRO can change this profile." });
    expect(await generateCroBio(own, cro, new TextEncoder().encode("not a pdf"))).toMatchObject({ ok: false, error: expect.stringContaining("Save to PDF") });
    expect(h.bioCalls).toHaveLength(0);
    expect(await generateCroBio(own, cro, PDF)).toEqual({ ok: true, bio: "Pia has led revenue at three Seed companies." });
    expect(h.bioCalls[0]).toMatchObject({ name: "Pia Draft", linkedinUrl: "https://www.linkedin.com/in/pia" });
    expect(await getCroProfile(cro)).toMatchObject({ bio: "Pia has led revenue at three Seed companies.", headline: "Former CRO at Acme" });
  });

  it("fills philosophy and style from both answers, and keeps the answers when drafting fails", async () => {
    expect(await generateCroVoice(own, cro, { q1: ANSWER, q2: "Too short." })).toEqual({ ok: false, error: "Answer both questions in a few sentences first." });
    expect(await generateCroVoice(own, cro, { q1: ANSWER, q2: ANSWER })).toEqual({ ok: true });
    expect(h.voiceCalls[0]).toMatchObject({ name: "Pia Draft", answers: { q1: ANSWER, q2: ANSWER } });
    expect(await getCroProfile(cro)).toMatchObject({ voiceAnswers: { q1: ANSWER, q2: ANSWER }, philosophy: { hiring: "I hire a senior AE before a VP." }, style: { directness: "Very direct." } });
    h.failVoice = true;
    const changed = `${ANSWER} Then revisit in a quarter.`;
    expect(await generateCroVoice(own, cro, { q1: changed, q2: ANSWER })).toMatchObject({ ok: false, error: expect.stringContaining("answers are saved") });
    expect((await getCroProfile(cro))!.voiceAnswers.q1).toBe(changed);
  });

  it("saves the answers with the rest of the profile", async () => {
    await saveCroProfile(own, cro, { name: "Pia Draft", voiceAnswers: { q1: ANSWER, q2: "" } });
    expect((await getCroProfile(cro))!.voiceAnswers).toEqual({ q1: ANSWER });
  });
});
