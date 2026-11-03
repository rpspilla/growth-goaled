/** The sign-in page's guest chat: sign-up questions, the AI's recommendation behind an email, and claiming it after sign-in (PGlite; model stubbed). */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const h = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown>, inputs: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db, p) }), schema };
});
vi.mock("@/lib/ai/chat", async (original) => {
  const actual = await original<typeof import("@/lib/ai/chat")>();
  return { ...actual, chatTurn: async (input: import("@/lib/ai/chat").ChatInput) => (h.inputs.push(input), { output: actual.fakeChat(input), model: "test", tokensIn: 1, tokensOut: 1 }) };
});

import { schema } from "@/lib/db";
import type { ChatInput } from "@/lib/ai/chat";
import type { GuestSession, User } from "@/lib/db/schema";
import { claimGuest, guestByToken, guestEmail, guestReply, guestView, newToken, startGuest } from "@/lib/data/guest";
import { OPENING, SPIN_UP } from "@/lib/guest/steps";

type DB = typeof import("@/lib/db").db;
const db = () => h.db as unknown as DB;
let token: string;

beforeAll(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const instance = drizzle(new PGlite(), { schema: await import("@/lib/db/schema") });
  await migrate(instance, { migrationsFolder: "drizzle" });
  h.db = instance as unknown as Record<string | symbol, unknown>;
}, 60_000);

beforeEach(async () => {
  for (const t of [schema.guestSessions, schema.recommendations, schema.conversationMessages, schema.conversations, schema.dataPoints, schema.intakeResponses, schema.companyMembers, schema.events, schema.companies, schema.users]) await db().delete(t);
  h.inputs.length = 0;
  delete process.env.GUEST_DAILY_PER_IP;
  token = newToken();
});

const current = async () => (await guestByToken(token)) as GuestSession;
const say = async (text: string) => guestReply(await current(), text);

async function answerAll() {
  for (const a of ["Our pipeline isn't converting.", "Sam Founder", "Acme", "1m_3m", "2021", "Seed", "Fintech", "3", "", "1"]) {
    const r = await say(a);
    if (!r.ok) throw new Error(`${a}: ${r.error}`);
  }
}

describe("guest chat", () => {
  it("asks how we can help, then the sign-up questions one at a time, all answered by typing", async () => {
    expect(guestView(null).messages).toEqual([{ role: "assistant", content: OPENING }]);
    await startGuest(token, "1.2.3.4");
    expect(guestView(await current()).step).toMatchObject({ key: "challenge", kind: "text" });
    expect(await say("Our pipeline isn't converting.")).toEqual({ ok: true });
    expect(await say("Sam Founder")).toEqual({ ok: true });
    expect(await say("Acme")).toEqual({ ok: true });
    expect(guestView(await current()).step).toMatchObject({ key: "revenueBand" });
    expect(await say("   ")).toEqual({ ok: false, error: "Type a message first." });
    // Unclear answers get a follow-up in the chat, not a form error, and the question stays open.
    expect(await say("a lot")).toEqual({ ok: true });
    let g = await current();
    expect(g.messages.at(-2)).toEqual({ role: "user", content: "a lot" });
    expect(g.messages.at(-1)?.content).toMatch(/didn't catch a revenue figure/);
    expect(guestView(g).step?.key).toBe("revenueBand");
    await say("about $2M ARR");
    await say("we started in 2021");
    await say("we just closed our seed round");
    await say("we help support teams with customer experience");
    await say("three");
    expect(guestView(await current()).step).toMatchObject({ key: "bdrs", optional: true });
    await say("skip");
    g = await current();
    expect(g.profile).toMatchObject({ challenge: "Our pipeline isn't converting.", name: "Sam Founder", companyName: "Acme", revenueBand: "1m_3m", foundedYear: "2021", stage: "Seed", vertical: "Other", verticalOther: "we help support teams with customer experience", aes: "3", bdrs: "" });
    // The founder's words appear as typed; the next question is asked by name.
    expect(g.messages.map((m) => m.content)).toContain("about $2M ARR");
    expect(g.messages.map((m) => m.content)).toContain("Thanks, Sam. What's your company called?");
    expect(g.messages.at(-1)?.content).toBe("Last one: how many in customer success?");
  });

  it("hands the challenge and profile to the AI, which recommends; the recommendation stays locked until an email is given", async () => {
    await startGuest(token, null);
    await answerAll();
    let g = await current();
    const input = h.inputs[0] as ChatInput;
    expect(input.guest).toBe(true);
    expect(input.history).toEqual([{ role: "user", content: "Our pipeline isn't converting." }]);
    expect(input.context.company).toMatchObject({ name: "Acme", stage: "Seed", industry: "Fintech", revenue_band: "$1M–$3M", gtm_team: "3 AEs, 1 in customer success" });
    expect(guestView(g).step).toBeNull();
    expect(g.card).toBeNull();
    // After the last answer the chat says it's on it, then the AI's first reply follows.
    const contents = g.messages.map((m) => m.content);
    expect(contents.indexOf(SPIN_UP)).toBe(contents.indexOf("1") + 1);
    expect(g.messages.at(-1)?.content).toMatch(/Test mode: let's work through/);
    expect(await guestReply(g, "We close $20k deals.")).toEqual({ ok: true });
    g = await current();
    expect(g.card?.takeaway).toMatch(/Test mode takeaway/);
    expect(guestView(g)).toMatchObject({ emailed: false });
    // The chat stays open after the recommendation: answering its questions refines it (still locked).
    expect(await guestReply(g, "Mostly referrals.")).toEqual({ ok: true });
    g = await current();
    expect(g.card?.takeaway).toMatch(/Test mode takeaway/);
    expect(guestView(g)).toMatchObject({ emailed: false });
    expect(await guestEmail(g, "  Sam@Acme.test ")).toEqual({ ok: true });
    expect(guestView(await current())).toMatchObject({ emailed: true, email: "sam@acme.test" });
  });

  it("after the sign-in link, becomes the founder's company, profile and conversation, for that email only and once", async () => {
    await startGuest(token, null);
    await answerAll();
    await say("We close $20k deals.");
    await guestEmail(await current(), "sam@acme.test");
    const [stranger, sam] = (await db()
      .insert(schema.users)
      .values([
        { email: "other@x.test", authUserId: "o", role: "founder" },
        { email: "Sam@Acme.test", authUserId: "s", role: "founder" },
      ])
      .returning()) as [User, User];
    expect(await claimGuest(stranger, token)).toBeNull();
    const claimed = await claimGuest(sam, token);
    expect(claimed).not.toBeNull();
    expect(await claimGuest(sam, token)).toBeNull();

    const [user] = await db().select().from(schema.users).where(eq(schema.users.id, sam.id));
    expect(user!.name).toBe("Sam Founder");
    expect(user!.onboardedAt).not.toBeNull();
    const [member] = await db().select().from(schema.companyMembers).where(eq(schema.companyMembers.userId, sam.id));
    const [company] = await db().select().from(schema.companies).where(eq(schema.companies.id, member!.companyId));
    expect(company).toMatchObject({ name: "Acme", revenueBand: "1m_3m", advisorId: null });
    const messages = await db().select().from(schema.conversationMessages).where(eq(schema.conversationMessages.conversationId, claimed!.conversationId)).orderBy(schema.conversationMessages.createdAt);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(messages[0]!.content).toBe("Our pipeline isn't converting.");
    expect(messages.at(-1)!.recommendationId).not.toBeNull();
    const [rec] = await db().select().from(schema.recommendations).where(eq(schema.recommendations.id, messages.at(-1)!.recommendationId!));
    expect(rec!.companyId).toBe(company!.id);
  });

  it("caps new guest chats per network per day", async () => {
    process.env.GUEST_DAILY_PER_IP = "2";
    expect("error" in (await startGuest(newToken(), "9.9.9.9"))).toBe(false);
    expect("error" in (await startGuest(newToken(), "9.9.9.9"))).toBe(false);
    expect(await startGuest(newToken(), "9.9.9.9")).toEqual({ error: "Too many new conversations from your network today. Sign in, or try again tomorrow." });
    expect("error" in (await startGuest(newToken(), "8.8.8.8"))).toBe(false);
  });
});
