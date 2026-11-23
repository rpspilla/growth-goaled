/** CRO profile photos: type sniffing, who may change them, and who may see a draft's (PGlite). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { croPhoto, getCroProfile, removeCroPhoto, saveCroProfile, setCroPhoto, setCroProfileAdmin, sniffImage } from "@/lib/data/cro";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
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
  for (const t of [schema.croPhotos, schema.croProfiles, schema.events, schema.users]) await db().delete(t);
  [admin, own, other] = (await db()
    .insert(schema.users)
    .values([
      { email: "a@gg.test", authUserId: "a", role: "admin" },
      { email: "o@gg.test", authUserId: "o", role: "advisor" },
      { email: "x@gg.test", authUserId: "x", role: "advisor" },
    ])
    .returning()) as [User, User, User];
  const r = await saveCroProfile(admin, null, { name: "Pia Photo", bio: "CRO." });
  if (!r.ok) throw new Error("setup");
  cro = r.id;
  await setCroProfileAdmin(admin, cro, { status: "draft", inCollective: false, userId: own.id });
});

describe("CRO photos", () => {
  it("knows images by their bytes, not their name", () => {
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("lets the CRO or an admin set it, survives a profile save, and can be removed", async () => {
    expect(await setCroPhoto(other, cro, JPEG)).toEqual({ ok: false, error: "Only an admin or the CRO can change this photo." });
    expect(await setCroPhoto(own, cro, new TextEncoder().encode("hello"))).toEqual({ ok: false, error: "Use a JPG, PNG or WebP image." });
    expect(await setCroPhoto(own, cro, new Uint8Array(600 * 1024).fill(0xff))).toMatchObject({ ok: false });
    const r = await setCroPhoto(own, cro, JPEG);
    if (!r.ok) throw new Error(r.error);
    expect(r.url).toMatch(new RegExp(`^/api/cro-photo/${cro}\\?v=\\d+$`));
    await saveCroProfile(own, cro, { name: "Pia Photo", bio: "Updated." });
    expect((await getCroProfile(cro))!.photoUrl).toBe(r.url);
    expect(await setCroPhoto(admin, cro, PNG)).toMatchObject({ ok: true });
    expect(await removeCroPhoto(own, cro)).toEqual({ ok: true });
    expect((await getCroProfile(cro))!.photoUrl).toBeNull();
    expect(await croPhoto(cro, admin)).toBeNull();
  });

  it("shows a draft's photo only to staff, and a published CRO's to anyone", async () => {
    await setCroPhoto(admin, cro, JPEG);
    expect(await croPhoto(cro, null)).toBeNull();
    expect(await croPhoto(cro, { role: "founder" })).toBeNull();
    expect((await croPhoto(cro, { role: "advisor" }))!.mime).toBe("image/jpeg");
    await setCroProfileAdmin(admin, cro, { status: "published", inCollective: true, userId: own.id });
    const p = await croPhoto(cro, null);
    expect(p!.mime).toBe("image/jpeg");
    expect(new Uint8Array(p!.bytes)).toEqual(JPEG);
  });
});
