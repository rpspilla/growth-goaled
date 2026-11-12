import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { GuestMessage, GuestSession, User } from "@/lib/db/schema";
import { chatTurn, ChatError } from "@/lib/ai/chat";
import { isAiConfigError } from "@/lib/ai/config";
import type { ChatContext } from "@/lib/chat/context";
import { CHAT_METHODOLOGY_VERSION, getChatTopic } from "@/lib/chat/topics";
import { track } from "@/lib/events";
import { basicsFrom, GUEST_STEPS, interpretAnswer, nextStep, OPENING, SPIN_UP } from "@/lib/guest/steps";
import { capReached, FREE_QUESTIONS, questionsLeft, type CapScope, type QuestionCounts } from "@/lib/guest/limits";
import { REVENUE_BANDS } from "@/lib/onboarding";
import { leadFromChat } from "./crm";
import { getFounderCompany } from "./companies";
import { saveCompanyBasics } from "./intake";

export const GUEST_COOKIE = "gg_guest";
/** New guest chats per visitor IP per day (GUEST_DAILY_PER_IP, default 20). */
const dailyPerIp = () => {
  const n = Number(process.env.GUEST_DAILY_PER_IP);
  return Number.isInteger(n) && n > 0 ? n : 20;
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const hashIp = (ip: string | null) => (ip ? createHash("sha256").update(`gg-guest:${ip}`).digest("hex") : null);
export const newToken = () => randomBytes(32).toString("base64url");

export type GuestResult = { ok: true } | { ok: false; error: string; capped?: CapScope };
const now = () => new Date().toISOString();

export async function guestByToken(token: string | undefined | null): Promise<GuestSession | null> {
  if (!token || token.length < 20) return null;
  const [g] = await db.select().from(schema.guestSessions).where(eq(schema.guestSessions.tokenHash, hashToken(token))).limit(1);
  return g ?? null;
}

/** Starts a guest chat for a new cookie token, within the per-IP daily cap. */
export async function startGuest(token: string, ip: string | null): Promise<GuestSession | { error: string }> {
  const ipHash = hashIp(ip);
  if (ipHash) {
    const [row] = await db
      .select({ n: count() })
      .from(schema.guestSessions)
      .where(and(eq(schema.guestSessions.ipHash, ipHash), gte(schema.guestSessions.createdAt, new Date(Date.now() - 24 * 3600 * 1000))));
    if ((row?.n ?? 0) >= dailyPerIp()) return { error: "Too many new conversations from your network today. Sign in, or try again tomorrow." };
  }
  const [g] = await db
    .insert(schema.guestSessions)
    .values({ tokenHash: hashToken(token), ipHash, messages: [{ role: "assistant", content: OPENING, at: now() }] })
    .returning();
  await track("guest_chat_started", { props: {} });
  return g!;
}

/** The context the AI sees for a guest: only what they've told us in this chat. */
function guestContext(profile: Record<string, string>): ChatContext {
  const band = REVENUE_BANDS.find((b) => b.value === profile.revenueBand)?.label ?? null;
  const team = [profile.aes ? `${profile.aes} AEs` : null, profile.bdrs ? `${profile.bdrs} BDRs` : null, profile.cs ? `${profile.cs} in customer success` : null].filter(Boolean).join(", ");
  return {
    company: { name: profile.companyName ?? null, stage: profile.stage ?? null, industry: profile.vertical === "Other" ? (profile.verticalOther ?? null) : (profile.vertical ?? null), revenue_band: band, founded: profile.foundedYear ?? null, gtm_team: team || null },
    answers: [],
    figures: [],
    facts: [],
    plan: [],
    pastRecommendations: [],
    compensationData: [],
  };
}

/**
 * Questions asked in this chat, and over the record's lifetime: every chat of its CRM contact, or
 * of its company's contacts once the contact has a company (whichever is more). Read from the
 * stored counts on each chat, never from the browser.
 */
export async function questionCounts(g: Pick<GuestSession, "id" | "questions" | "crmContactId">): Promise<QuestionCounts> {
  if (!g.crmContactId) return { session: g.questions, lifetime: g.questions };
  const sum = sql<number>`coalesce(sum(${schema.guestSessions.questions}), 0)::int`;
  const [[contact], [link]] = await Promise.all([
    db.select({ n: sum }).from(schema.guestSessions).where(eq(schema.guestSessions.crmContactId, g.crmContactId)),
    db.select({ companyId: schema.crmContacts.companyId }).from(schema.crmContacts).where(eq(schema.crmContacts.id, g.crmContactId)).limit(1),
  ]);
  const [company] = link?.companyId
    ? await db.select({ n: sum }).from(schema.guestSessions).innerJoin(schema.crmContacts, eq(schema.crmContacts.id, schema.guestSessions.crmContactId)).where(eq(schema.crmContacts.companyId, link.companyId))
    : [];
  return { session: g.questions, lifetime: Math.max(contact?.n ?? 0, company?.n ?? 0, g.questions) };
}

const capMessage = (scope: CapScope) =>
  scope === "session"
    ? `You've used the ${FREE_QUESTIONS.perSession} free questions for this conversation. To keep going, talk to an advisor or diagnose your growth.`
    : `You've used all ${FREE_QUESTIONS.perLifetime} of your free questions. To keep going, talk to an advisor or diagnose your growth.`;

const aiHistory = (g: Pick<GuestSession, "profile" | "messages">) => [
  { role: "user" as const, content: g.profile.challenge ?? "" },
  ...g.messages.filter((m) => m.ai).map((m) => ({ role: m.role, content: m.content })),
];

/**
 * One reply from the visitor: the next sign-up answer while those are being asked, then the
 * conversation with the AI until it gives a recommendation (shown blurred until they give an email).
 */
export async function guestReply(g: GuestSession, raw: string): Promise<GuestResult> {
  if (g.claimedAt) return { ok: false, error: "This conversation is saved to your account. Sign in to continue it." };
  const step = nextStep(g.profile);
  const messages: GuestMessage[] = [...g.messages];

  if (step) {
    const typed = raw.trim();
    if (typed.length > 2000) return { ok: false, error: "Please keep it under 2,000 characters." };
    if (!typed && !step.optional) return { ok: false, error: "Type a message first." };
    // Every answer is typed, as in any chat; when it isn't clear, the reply asks again in the conversation.
    const read = interpretAnswer(step, typed);
    messages.push({ role: "user", content: typed || "Skip", at: now() });
    if (!read.ok) {
      messages.push({ role: "assistant", content: read.reply, at: now() });
      await save(g.id, { messages });
      return { ok: true };
    }
    const profile = { ...g.profile, ...read.values };
    const following = nextStep(profile);
    if (following) {
      messages.push({ role: "assistant", content: following.ask(profile), at: now() });
      await save(g.id, { profile, messages });
      return { ok: true };
    }
    // Profile done: the AI takes over with the founder's challenge (and says it's on it).
    messages.push({ role: "assistant", content: SPIN_UP, at: now() });
    await save(g.id, { profile, messages });
    // Their challenge is the first question the AI answers.
    return ask({ ...g, profile, messages });
  }

  const text = raw.trim();
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > 2000) return { ok: false, error: "Please keep it under 2,000 characters." };
  return ask(g, { role: "user", content: text, ai: true, at: now() });
}

/**
 * One question for the AI, within the free-question cap (checked here on the server). The count
 * goes up before the answer, so a question that fails to answer still counts once it was asked.
 */
async function ask(g: GuestSession, question?: GuestMessage): Promise<GuestResult> {
  const counts = await questionCounts(g);
  const blocked = capReached(counts);
  if (blocked) {
    await track("guest_question_blocked", { props: { scope: blocked, session: counts.session, lifetime: counts.lifetime } });
    return { ok: false, error: capMessage(blocked), capped: blocked };
  }
  const [bumped] = await db
    .update(schema.guestSessions)
    .set({ questions: sql`${schema.guestSessions.questions} + 1`, ...(question ? { messages: [...g.messages, question] } : {}), updatedAt: new Date() })
    .where(and(eq(schema.guestSessions.id, g.id), eq(schema.guestSessions.questions, g.questions)))
    .returning();
  // Another tab asked at the same moment: ask them to try again rather than go over the cap.
  if (!bumped) return { ok: false, error: "Something changed in another tab. Please try again." };
  const after = { session: counts.session + 1, lifetime: counts.lifetime + 1 };
  await track("guest_question_asked", { props: { session: after.session, lifetime: after.lifetime, linked: Boolean(g.crmContactId) } });
  const reached = capReached(after);
  if (reached) await track("guest_question_cap_reached", { props: { scope: reached, session: after.session, lifetime: after.lifetime } });
  return aiTurn(bumped);
}

async function aiTurn(g: Pick<GuestSession, "id" | "profile" | "messages" | "aiTurns" | "card">): Promise<GuestResult> {
  let result;
  try {
    result = await chatTurn({ topic: getChatTopic("other")!, context: guestContext(g.profile), history: aiHistory(g), guest: true });
  } catch (err) {
    console.error("[guest] Turn failed", err);
    return { ok: false, error: err instanceof ChatError ? err.message : isAiConfigError(err) ? "Answers aren't available right now. Please try again shortly." : "Something went wrong. Please try again." };
  }
  const { output } = result;
  const card = output.recommendation
    ? {
        takeaway: output.recommendation.takeaway,
        diagnosis: output.recommendation.diagnosis,
        evidence: output.recommendation.evidence,
        confidence: output.recommendation.confidence,
        priority: output.recommendation.priority,
        recommendation: output.recommendation.recommendation,
        nextSteps: output.recommendation.next_steps,
        successMeasures: output.recommendation.success_measures,
        plan: { days30: output.recommendation.plan_30, days60: output.recommendation.plan_60, days90: output.recommendation.plan_90 },
        missing: output.recommendation.missing,
      }
    : null;
  // Answering the follow-up questions refines the recommendation; an answer without a new card keeps the last one.
  await save(g.id, { messages: [...g.messages, { role: "assistant", content: output.reply, ai: true, at: now() }], card: card ?? g.card, aiTurns: g.aiTurns + 1 });
  if (card && !g.card) await track("guest_recommendation", { props: {} });
  return { ok: true };
}

async function save(id: string, patch: Partial<Pick<GuestSession, "profile" | "messages" | "card" | "aiTurns" | "email">>) {
  await db.update(schema.guestSessions).set({ ...patch, updatedAt: new Date() }).where(eq(schema.guestSessions.id, id));
}

/**
 * The email that unlocks the recommendation (or, at the cap, the sign-in link to diagnose their
 * growth). The chat, before and after, joins that email's CRM contact and its company. The sign-in
 * link that saves it to an account is sent from the browser.
 */
export async function guestEmail(g: GuestSession, email: string): Promise<GuestResult> {
  const address = email.trim().toLowerCase();
  let contactId = g.crmContactId;
  if (address !== g.email || !contactId) {
    try {
      contactId = (await leadFromChat({ email: address, name: g.profile.name, title: g.profile.title, companyName: g.profile.companyName })).contactId;
    } catch (err) {
      // The prospect still gets their link; the advisor side is fixed up the next time they give it.
      console.error("[guest] Couldn't attach the chat to a contact", err);
    }
  }
  await db.update(schema.guestSessions).set({ email: address, crmContactId: contactId, updatedAt: new Date() }).where(eq(schema.guestSessions.id, g.id));
  await track("guest_email_given", { props: { linked: Boolean(contactId) } });
  // A record that already used its free questions in an earlier chat stays at the cap.
  const counts = await questionCounts({ ...g, crmContactId: contactId });
  if (capReached(counts) === "lifetime" && counts.lifetime > g.questions && g.questions < FREE_QUESTIONS.perLifetime) {
    await track("guest_question_cap_reached", { props: { scope: "lifetime", session: counts.session, lifetime: counts.lifetime, at: "email" } });
  }
  return { ok: true };
}

/**
 * After the sign-in link: the guest chat becomes the founder's company (from the sign-up answers),
 * their profile, and a saved conversation with its recommendation. Only for the email they gave.
 */
export async function claimGuest(user: User, token: string | undefined | null): Promise<{ conversationId: string } | null> {
  const g = await guestByToken(token);
  if (!g || g.claimedAt || !g.email || g.email !== user.email.trim().toLowerCase() || user.role !== "founder") return null;
  const won = await db
    .update(schema.guestSessions)
    .set({ claimedBy: user.id, claimedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.guestSessions.id, g.id), isNull(schema.guestSessions.claimedAt)))
    .returning({ id: schema.guestSessions.id });
  if (!won.length) return null;

  let company = await getFounderCompany(user);
  if (!company) {
    const basics = basicsFrom(g.profile);
    if (!basics) return null;
    const companyId = randomUUID();
    await db.insert(schema.companies).values({ id: companyId, name: basics.companyName, revenueBand: basics.revenueBand, advisorId: null });
    await db.insert(schema.companyMembers).values({ companyId, userId: user.id, memberRole: "owner" });
    await saveCompanyBasics(user, companyId, basics);
    company = (await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)))[0] ?? null;
    await track("onboarding_completed", { userId: user.id, companyId, props: { revenue_band: basics.revenueBand, stage: basics.stage, vertical: basics.vertical, via: "guest_chat" } });
  }
  if (user.onboardedAt === null) {
    await db.update(schema.users).set({ name: user.name ?? g.profile.name ?? null, onboardedAt: new Date() }).where(eq(schema.users.id, user.id));
  }

  const challenge = g.profile.challenge ?? "Something else";
  const [conversation] = await db.insert(schema.conversations).values({ companyId: company!.id, userId: user.id, topic: "other", title: challenge.slice(0, 120) }).returning({ id: schema.conversations.id });
  const conversationId = conversation!.id;
  let recommendationId: string | null = null;
  if (g.card) {
    const [rec] = await db
      .insert(schema.recommendations)
      .values({ companyId: company!.id, conversationId, topic: "other", question: challenge.slice(0, 120), context: { ...g.profile, challenge: null }, card: g.card, confidence: g.card.confidence.level, methodologyVersion: CHAT_METHODOLOGY_VERSION })
      .returning({ id: schema.recommendations.id });
    recommendationId = rec!.id;
  }
  // The conversation as the AI had it: the challenge, then the exchanges after the sign-up questions.
  const turns = aiHistory(g);
  const lastAssistant = turns.map((t) => t.role).lastIndexOf("assistant");
  const base = Date.now() - turns.length * 1000;
  for (const [i, t] of turns.entries()) {
    await db.insert(schema.conversationMessages).values({ conversationId, role: t.role, content: t.content, recommendationId: i === lastAssistant ? recommendationId : null, createdAt: new Date(base + i * 1000) });
  }
  await track("guest_chat_claimed", { userId: user.id, companyId: company!.id, props: { recommendation: Boolean(g.card) } });
  return { conversationId };
}

/** What the page shows: the transcript, the question being asked, the (possibly blurred) recommendation and the questions left. */
export async function guestView(g: GuestSession | null) {
  const counts = g ? await questionCounts(g) : { session: 0, lifetime: 0 };
  const profile = g?.profile ?? {};
  const step = nextStep(profile);
  return {
    messages: g?.messages ?? [{ role: "assistant" as const, content: OPENING }],
    step: step ? { key: step.key, kind: step.kind, options: step.options ?? null, optional: Boolean(step.optional), placeholder: step.placeholder ?? null } : null,
    card: g?.card ?? null,
    emailed: Boolean(g?.email),
    email: g?.email ?? null,
    companyName: profile.companyName?.trim() || null,
    capped: capReached(counts),
    questionsLeft: questionsLeft(counts),
    totalSteps: GUEST_STEPS.length,
  };
}

// ---------------------------------------------------------------------------
// The advisor's side: website chats on a CRM contact or company
// ---------------------------------------------------------------------------

export type LeadChat = { id: string; startedAt: Date; updatedAt: Date; email: string | null; contactId: string | null; questions: number; profile: Record<string, string>; messages: GuestMessage[]; claimed: boolean };

async function chatsWhere(contactIds: string[]): Promise<LeadChat[]> {
  if (!contactIds.length) return [];
  const rows = await db.select().from(schema.guestSessions).where(inArray(schema.guestSessions.crmContactId, contactIds)).orderBy(asc(schema.guestSessions.createdAt));
  return rows.map((r) => ({ id: r.id, startedAt: r.createdAt, updatedAt: r.updatedAt, email: r.email, contactId: r.crmContactId, questions: r.questions, profile: r.profile, messages: r.messages, claimed: Boolean(r.claimedAt) }));
}

/** A contact's website chats, oldest first, and their question counts against the free cap. */
export async function contactChats(contactId: string) {
  const chats = await chatsWhere([contactId]);
  return { chats, ...chatTotals(chats) };
}

/** Every website chat of a company's contacts, oldest first, with the company's question counts. */
export async function companyChats(companyId: string) {
  const contacts = await db.select({ id: schema.crmContacts.id }).from(schema.crmContacts).where(eq(schema.crmContacts.companyId, companyId));
  const chats = await chatsWhere(contacts.map((c) => c.id));
  return { chats, ...chatTotals(chats) };
}

/** Pure: total questions, the busiest single chat, and what's left of the lifetime cap. */
export function chatTotals(chats: Pick<LeadChat, "questions">[]) {
  const lifetime = chats.reduce((n, c) => n + c.questions, 0);
  return { lifetime, sessions: chats.length, mostInOneSession: Math.max(0, ...chats.map((c) => c.questions)), lifetimeLeft: Math.max(0, FREE_QUESTIONS.perLifetime - lifetime) };
}
