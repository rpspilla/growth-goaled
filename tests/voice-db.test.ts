/** CRO voices: only the CRO sets theirs (with consent); answers are read in it only for people who may see them (PGlite; ElevenLabs stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, created: [] as unknown[], deleted: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/ai/voice", async () => {
  const { speakableText } = await import("@/lib/chat/speakable");
  class VoiceError extends Error {}
  return {
    speakableText,
    VoiceError,
    createVoice: async (name: string, files: unknown[]) => {
      h.created.push({ name, files: files.length });
      return `voice${h.created.length}abcdefghij`;
    },
    deleteVoice: async (id: string) => void h.deleted.push(id),
  };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { speakableText } from "@/lib/chat/speakable";
import { getCroProfile, saveCroProfile, setCroProfileAdmin } from "@/lib/data/cro";
import { linkCroVoice, rallyVoice, removeCroVoice, setCroVoice, setRallyVoice, speakableAnswer, speakableGuestMessage } from "@/lib/data/voice";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
const audio = (n = 1000) => ({ filename: "me.mp3", type: "audio/mpeg", bytes: new Uint8Array(n).fill(1) });
let admin: User;
let ryan: User;
let founder: User;
let stranger: User;
let cro: string;
let co: Company;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.guestSessions, schema.conversationMessages, schema.conversations, schema.companyMembers, schema.croProfiles, schema.events, schema.companies, schema.users]) await db().delete(t);
  [admin, ryan, founder, stranger] = (await db()
    .insert(schema.users)
    .values([
      { email: "a@gg.test", authUserId: "a", role: "admin" },
      { email: "r@gg.test", authUserId: "r", role: "admin" },
      { email: "f@co.test", authUserId: "f", role: "founder" },
      { email: "s@other.test", authUserId: "s", role: "founder" },
    ])
    .returning()) as [User, User, User, User];
  const r = await saveCroProfile(admin, null, { name: "Ryan Spillane", bio: "CRO." });
  if (!r.ok) throw new Error("setup");
  cro = r.id;
  await setCroProfileAdmin(admin, cro, { status: "published", inCollective: true, userId: ryan.id });
  [co] = (await db().insert(schema.companies).values([{ name: "Voiceco", advisorId: admin.id }]).returning()) as [Company];
  await db().insert(schema.companyMembers).values({ companyId: co.id, userId: founder.id });
  h.created = [];
  h.deleted = [];
});

async function answer(croId: string | null) {
  const [c] = await db().insert(schema.conversations).values({ companyId: co.id, topic: "other", title: "Q", croId }).returning();
  const [m] = await db().insert(schema.conversationMessages).values({ conversationId: c!.id, role: "assistant", content: "**Fix conversion first.**\n\n1. Split by source.\n\nOne question: where do deals stall?", croId }).returning();
  return m!.id;
}

describe("CRO voices", () => {
  it("reads answers without their formatting", () => {
    expect(speakableText("Test mode (Ryan's AI): **Fix conversion first.**\n\n- Split by source.\n\none question: where?")).toBe("Fix conversion first.\nSplit by source.\nOne question: where?");
  });

  it("are set up only by the CRO themselves, with consent; replacing deletes the old voice", async () => {
    expect(await setCroVoice(admin, cro, { consent: true, files: [audio()] })).toEqual({ ok: false, error: "Only the CRO themselves can set up or change their voice." });
    expect(await setCroVoice(ryan, cro, { consent: false, files: [audio()] })).toMatchObject({ ok: false, error: expect.stringContaining("own voice") });
    expect(await setCroVoice(ryan, cro, { consent: true, files: [] })).toMatchObject({ ok: false });
    expect(await setCroVoice(ryan, cro, { consent: true, files: [audio(5 * 1024 * 1024)] })).toMatchObject({ ok: false, error: expect.stringContaining("4 MB") });
    expect(await setCroVoice(ryan, cro, { consent: true, files: [{ ...audio(), type: "application/pdf", filename: "x.pdf" }] })).toMatchObject({ ok: false, error: expect.stringContaining("audio") });
    expect(await setCroVoice(ryan, cro, { consent: true, files: [audio()] })).toEqual({ ok: true });
    expect(h.created).toEqual([{ name: "Ryan Spillane", files: 1 }]);
    const p = (await getCroProfile(cro))!;
    expect(p.voiceId).toBe("voice1abcdefghij");
    expect(p.voiceConsentAt).toBeInstanceOf(Date);
    expect(await setCroVoice(ryan, cro, { consent: true, files: [audio(), audio()] })).toEqual({ ok: true });
    expect(h.deleted).toEqual(["voice1abcdefghij"]);
    expect(await linkCroVoice(ryan, cro, { consent: true, voiceId: "not a voice!" })).toMatchObject({ ok: false });
    expect(await linkCroVoice(ryan, cro, { consent: true, voiceId: "21m00Tcm4TlvDq8ikWAM" })).toEqual({ ok: true });
    expect(await removeCroVoice(ryan, cro)).toEqual({ ok: true });
    expect(await getCroProfile(cro)).toMatchObject({ voiceId: null, voiceConsentAt: null });
  });

  it("read an answer in its CRO's voice only for people who may see the conversation", async () => {
    const mine = await answer(cro);
    const collective = await answer(null);
    expect(await speakableAnswer(founder, mine)).toEqual({ text: "Fix conversion first.\n1. Split by source.\nOne question: where do deals stall?", voiceId: null, cro: null });
    await setCroVoice(ryan, cro, { consent: true, files: [audio()] });
    expect(await speakableAnswer(founder, mine)).toMatchObject({ voiceId: "voice1abcdefghij", cro: "Ryan Spillane" });
    expect(await speakableAnswer(admin, mine)).toMatchObject({ voiceId: "voice1abcdefghij" });
    expect(await speakableAnswer(founder, collective)).toMatchObject({ voiceId: null });
    expect(await speakableAnswer(stranger, mine)).toBeNull();
    // Unpublished: no voice
    await setCroProfileAdmin(admin, cro, { status: "draft", inCollective: true, userId: ryan.id });
    expect(await speakableAnswer(founder, mine)).toMatchObject({ voiceId: null });
  });

  it("can be Rally's voice too, by the CRO's choice: the Collective and the website chat speak in it", async () => {
    const collective = await answer(null);
    expect(await setRallyVoice(ryan, cro, true)).toEqual({ ok: false, error: "Create your voice first." });
    await setCroVoice(ryan, cro, { consent: true, files: [audio()] });
    expect(await setRallyVoice(admin, cro, true)).toMatchObject({ ok: false });
    expect(await setRallyVoice(ryan, cro, true)).toEqual({ ok: true });
    expect(await rallyVoice()).toEqual({ voiceId: "voice1abcdefghij", name: "Ryan Spillane" });
    expect(await speakableAnswer(founder, collective)).toMatchObject({ voiceId: "voice1abcdefghij", cro: "Ryan Spillane" });
    // The website chat: only the visitor's own chat, only Rally's messages.
    const { createHash } = await import("node:crypto");
    const token = "a".repeat(40);
    await db().insert(schema.guestSessions).values({ tokenHash: createHash("sha256").update(token).digest("hex"), ipHash: "x", messages: [{ role: "assistant", content: "How can we help you grow?", at: "" }, { role: "user", content: "Hi", at: "" }, { role: "assistant", content: "**What's your name?**", at: "" }] } as never);
    expect(await speakableGuestMessage(token, 2)).toEqual({ text: "What's your name?", voiceId: "voice1abcdefghij" });
    expect(await speakableGuestMessage(token, 1)).toBeNull();
    expect(await speakableGuestMessage("b".repeat(40), 2)).toBeNull();
    // Rally's voice speaks for Rally even while the CRO's own profile is a draft.
    await setCroProfileAdmin(admin, cro, { status: "draft", inCollective: true, userId: ryan.id });
    expect(await rallyVoice()).toMatchObject({ name: "Ryan Spillane" });
    expect(await speakableAnswer(founder, collective)).toMatchObject({ voiceId: "voice1abcdefghij" });
    // Removing the voice ends it being Rally's.
    await removeCroVoice(ryan, cro);
    expect(await rallyVoice()).toBeNull();
    expect(await speakableAnswer(founder, collective)).toMatchObject({ voiceId: null });
  });
});
