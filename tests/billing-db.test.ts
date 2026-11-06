/** "Manage billing": Stripe's portal for the company's own Execute & Monitor subscription only (PGlite; Stripe stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { billingPortalUrl } from "@/lib/data/billing";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let mine: Company, theirs: Company;

const fake = () => {
  const retrieve = vi.fn(async (id: string) => ({ id, customer: `cus_for_${id}` }));
  const create = vi.fn(async (p: { customer: string; return_url: string }) => ({ url: `https://billing.stripe.com/p/session/${p.customer}` }));
  return { client: { subscriptions: { retrieve }, billingPortal: { sessions: { create } } } as never, retrieve, create };
};

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.actionPlans, schema.conversations, schema.companies, schema.users]) await db().delete(t);
  const [u] = (await db().insert(schema.users).values({ email: "f@co.test", authUserId: "f", role: "founder" }).returning()) as [User];
  [mine, theirs] = (await db().insert(schema.companies).values([{ name: "Mine" }, { name: "Theirs" }]).returning()) as [Company, Company];
  for (const [c, sub] of [[theirs, "sub_theirs"]] as const) {
    const [conv] = await db().insert(schema.conversations).values({ companyId: c.id, userId: u!.id, topic: "other", title: "x" }).returning();
    await db().insert(schema.actionPlans).values({ companyId: c.id, conversationId: conv!.id, topic: "other", tier: "supported", status: "active", stripeSubscriptionId: sub });
  }
});

describe("billing portal", () => {
  it("needs a subscription of this company's own; never another company's", async () => {
    const { client, create } = fake();
    expect(await billingPortalUrl(mine, "https://app.test/chat/x", client)).toEqual({ ok: false, error: "There's no subscription to manage yet." });
    expect(create).not.toHaveBeenCalled();
  });

  it("opens the portal for the subscription's customer and returns to where they were", async () => {
    const [u] = await db().select().from(schema.users);
    const [conv] = await db().insert(schema.conversations).values({ companyId: mine.id, userId: u!.id, topic: "other", title: "y" }).returning();
    await db().insert(schema.actionPlans).values({ companyId: mine.id, conversationId: conv!.id, topic: "other", tier: "supported", status: "active", stripeSubscriptionId: "sub_mine" });
    const { client, retrieve, create } = fake();
    expect(await billingPortalUrl(mine, "https://app.test/chat/y", client)).toEqual({ ok: true, url: "https://billing.stripe.com/p/session/cus_for_sub_mine" });
    expect(retrieve).toHaveBeenCalledWith("sub_mine");
    expect(create).toHaveBeenCalledWith({ customer: "cus_for_sub_mine", return_url: "https://app.test/chat/y" });
  });
});
