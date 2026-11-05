/** Custom-project payment links in the database: who can make and cancel them, paying, and what counts as paid (PGlite; Stripe and email stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, emails: [] as { to: string; subject: string; text: string }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/email", () => ({ sendEmail: async (m: { to: string; subject: string; text: string }) => (h.emails.push(m), { sent: true }) }));

import { schema } from "@/lib/db";
import type { Company, User } from "@/lib/db/schema";
import { paymentLinkInput } from "@/lib/payment-links";
import { cancelPaymentLink, createPaymentLink, linkByToken, listPaymentLinks, recordPaidLink, startLinkCheckout } from "@/lib/data/payment-links";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let founder: User, advisor: User, other: User, admin: User;
let mine: Company, theirs: Company;
const input = (o: Record<string, unknown> = {}) => paymentLinkInput.parse({ title: "Sales process redesign", amount: "5000", description: "Six weeks.", clientName: "Pat", clientEmail: "pat@acme.test", ...o });
const fakeStripe = () => {
  const create = vi.fn(async (params: Record<string, unknown>) => ({ id: `cs_test_${Math.random().toString(36).slice(2)}`, url: "https://checkout.stripe.com/c/pay/x", params }));
  return { client: { checkout: { sessions: { create } } } as never, create };
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
  for (const t of [schema.paymentLinks, schema.events, schema.companies, schema.users]) await db().delete(t);
  [founder, advisor, other, admin] = (await db()
    .insert(schema.users)
    .values([
      { email: "f@co.test", authUserId: "f", role: "founder" },
      { email: "a@gg.test", authUserId: "a", role: "advisor", name: "Ada" },
      { email: "b@gg.test", authUserId: "b", role: "advisor", name: "Ben" },
      { email: "r@gg.test", authUserId: "r", role: "admin", name: "Ray" },
    ])
    .returning()) as [User, User, User, User];
  [mine, theirs] = (await db().insert(schema.companies).values([{ name: "Mine Co", advisorId: advisor.id }, { name: "Theirs Co", advisorId: other.id }]).returning()) as [Company, Company];
  h.emails.length = 0;
  delete process.env.OWNER_NOTIFY_EMAIL;
});

describe("making links", () => {
  it("advisors and admins create links; founders can't; companies must be ones the advisor can see", async () => {
    expect(await createPaymentLink(founder, input(), "https://app.test")).toEqual({ ok: false, error: "Only advisors can create payment links." });
    expect((await createPaymentLink(advisor, input({ companyId: theirs.id }), "https://app.test")).ok).toBe(false);
    const r = await createPaymentLink(advisor, input({ companyId: mine.id }), "https://app.test");
    if (!r.ok) throw new Error(r.error);
    expect(r.url).toMatch(/^https:\/\/app\.test\/pay\/[A-Za-z0-9_-]{24}$/);
    const [row] = await db().select().from(schema.paymentLinks);
    expect(row).toMatchObject({ amountCents: 500_000, status: "open", createdBy: advisor.id, companyId: mine.id, clientEmail: "pat@acme.test" });
    expect(r.emailed).toBeNull();
  });

  it("emails the link when asked (needs the client's email)", async () => {
    expect((await createPaymentLink(advisor, input({ clientEmail: "", sendEmail: true }), "https://app.test")).ok).toBe(false);
    const r = await createPaymentLink(advisor, input({ sendEmail: true }), "https://app.test");
    if (!r.ok) throw new Error(r.error);
    expect(r.emailed).toBe(true);
    expect(h.emails[0]).toMatchObject({ to: "pat@acme.test", subject: "Sales process redesign: payment from Growth Goaled" });
    expect(h.emails[0]!.text).toContain(r.url);
  });

  it("advisors see their own links; admins see everyone's; only the creator or an admin cancels", async () => {
    const a = await createPaymentLink(advisor, input(), "https://app.test");
    await createPaymentLink(other, input({ title: "Other project" }), "https://app.test");
    if (!a.ok) throw new Error(a.error);
    expect((await listPaymentLinks(advisor)).map((l) => l.title)).toEqual(["Sales process redesign"]);
    expect(await listPaymentLinks(admin)).toHaveLength(2);
    expect((await cancelPaymentLink(other, a.id)).ok).toBe(false);
    expect((await cancelPaymentLink(founder, a.id)).ok).toBe(false);
    expect(await cancelPaymentLink(advisor, a.id)).toEqual({ ok: true });
    expect((await cancelPaymentLink(advisor, a.id)).ok).toBe(false);
  });
});

describe("paying", () => {
  async function link(o: Record<string, unknown> = {}) {
    const r = await createPaymentLink(advisor, input(o), "https://app.test");
    if (!r.ok) throw new Error(r.error);
    return (await linkByToken(r.url.split("/").at(-1)!))!;
  }

  it("Pay opens a one-time Checkout for the link's amount and title", async () => {
    const l = await link();
    const { client, create } = fakeStripe();
    const r = await startLinkCheckout(l.token, "https://app.test", client);
    expect(r).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/x" });
    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params).toMatchObject({ mode: "payment", customer_email: "pat@acme.test", client_reference_id: l.id, metadata: { purpose: "payment_link", paymentLinkId: l.id }, success_url: `https://app.test/pay/${l.token}?session_id={CHECKOUT_SESSION_ID}` });
    expect((params.line_items as { price_data: { unit_amount: number; product_data: { name: string } } }[])[0]!.price_data).toMatchObject({ unit_amount: 500_000, product_data: { name: "Sales process redesign" } });
    expect((await linkByToken(l.token))!.stripeSessionId).toMatch(/^cs_test_/);
    expect((await startLinkCheckout("not-a-real-token-at-all", "https://app.test", client)).ok).toBe(false);
  });

  it("a cancelled link can't be paid", async () => {
    const l = await link();
    await cancelPaymentLink(advisor, l.id);
    expect(await startLinkCheckout(l.token, "https://app.test", fakeStripe().client)).toEqual({ ok: false, error: "This payment link is no longer active." });
  });

  it("only a paid session for this link and its full amount marks it paid, once, and tells the advisor and owner", async () => {
    process.env.OWNER_NOTIFY_EMAIL = "owner@gg.test";
    const l = await link();
    const session = { id: "cs_test_1", payment_status: "paid" as const, amount_total: 500_000, client_reference_id: l.id, metadata: { purpose: "payment_link", paymentLinkId: l.id }, customer_details: { email: "pat@acme.test" } };
    expect(await recordPaidLink({ ...session, metadata: { purpose: "action_plan" } })).toBe(false);
    await recordPaidLink({ ...session, amount_total: 100 });
    await recordPaidLink({ ...session, payment_status: "unpaid" });
    await recordPaidLink({ ...session, client_reference_id: "someone-else" });
    expect((await linkByToken(l.token))!.status).toBe("open");
    expect(await recordPaidLink(session)).toBe(true);
    expect(await recordPaidLink(session)).toBe(true);
    expect(await linkByToken(l.token)).toMatchObject({ status: "paid", paidEmail: "pat@acme.test", stripeSessionId: "cs_test_1" });
    expect(h.emails.map((e) => e.to).sort()).toEqual(["a@gg.test", "owner@gg.test"]);
    expect(await db().select().from(schema.events).where(eq(schema.events.name, "payment_link_paid"))).toHaveLength(1);
  });
});
