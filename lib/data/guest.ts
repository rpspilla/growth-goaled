import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, count, eq, gte, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { GuestMessage, GuestSession, User } from "@/lib/db/schema";
import { chatTurn, ChatError } from "@/lib/ai/chat";
import { isAiConfigError } from "@/lib/ai/config";
import type { ChatContext } from "@/lib/chat/context";
import { CHAT_METHODOLOGY_VERSION, getChatTopic } from "@/lib/chat/topics";
import { track } from "@/lib/events";
import { answerLabel, basicsFrom, checkAnswer, GUEST_STEPS, nextStep, OPENING } from "@/lib/guest/steps";
import { REVENUE_BANDS } from "@/lib/onboarding";
import { getFounderCompany } from "./companies";
import { saveCompanyBasics } from "./intake";

export const GUEST_COOKIE = "gg_guest";
/** AI answers per guest chat before they need to sign in (it's free and anonymous). */
export const GUEST_AI_TURNS = 6;
/** New guest chats per visitor IP per day (GUEST_DAILY_PER_IP, default 20). */
const dailyPerIp = () => {
  const n = Number(process.env.GUEST_DAILY_PER_IP);
  return Number.isInteger(n) && n > 0 ? n : 20;
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const hashIp = (ip: string | null) => (ip ? createHash("sha256").update(`gg-guest:${ip}`).digest("hex") : null);
export const newToken = () => randomBytes(32).toString("base64url");

export type GuestResult = { ok: true } | { ok: false; error: string };

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
    .values({ tokenHash: hashToken(token), ipHash, messages: [{ role: "assistant", content: OPENING }] })
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
    const checked = checkAnswer(step, raw);
    if (!checked.ok) return { ok: false, error: checked.error };
    const profile = { ...g.profile, [step.key]: checked.value };
    messages.push({ role: "user", content: answerLabel(step, checked.value) });
    const following = nextStep(profile);
    if (following) {
      messages.push({ role: "assistant", content: following.ask(profile) });
      await save(g.id, { profile, messages });
      return { ok: true };
    }
    // Profile done: the AI takes over with the founder's challenge.
    await save(g.id, { profile, messages });
    return aiTurn({ ...g, profile, messages });
  }

  const text = raw.trim();
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > 2000) return { ok: false, error: "Please keep it under 2,000 characters." };
  messages.push({ role: "user", content: text, ai: true });
  await save(g.id, { messages });
  return aiTurn({ ...g, messages });
}

async function aiTurn(g: Pick<GuestSession, "id" | "profile" | "messages" | "aiTurns" | "card">): Promise<GuestResult> {
  if (g.aiTurns >= GUEST_AI_TURNS) return { ok: false, error: "Enter your email to keep going: we'll save this conversation to your account." };
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
  await save(g.id, { messages: [...g.messages, { role: "assistant", content: output.reply, ai: true }], card: card ?? g.card, aiTurns: g.aiTurns + 1 });
  if (card && !g.card) await track("guest_recommendation", { props: {} });
  return { ok: true };
}

async function save(id: string, patch: Partial<Pick<GuestSession, "profile" | "messages" | "card" | "aiTurns" | "email">>) {
  await db.update(schema.guestSessions).set({ ...patch, updatedAt: new Date() }).where(eq(schema.guestSessions.id, id));
}

/** The email that unlocks the recommendation; the sign-in link that saves it is sent from the browser. */
export async function guestEmail(g: GuestSession, email: string): Promise<GuestResult> {
  if (!g.card) return { ok: false, error: "There's no recommendation yet." };
  await save(g.id, { email: email.trim().toLowerCase() });
  await track("guest_email_given", { props: {} });
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

/** What the page shows: the transcript, the question being asked, and the (possibly blurred) recommendation. */
export function guestView(g: GuestSession | null) {
  const profile = g?.profile ?? {};
  const step = nextStep(profile);
  return {
    messages: g?.messages ?? [{ role: "assistant" as const, content: OPENING }],
    step: step ? { key: step.key, kind: step.kind, options: step.options ?? null, optional: Boolean(step.optional), placeholder: step.placeholder ?? null } : null,
    card: g?.card ?? null,
    unlocked: Boolean(g?.email),
    email: g?.email ?? null,
    outOfTurns: (g?.aiTurns ?? 0) >= GUEST_AI_TURNS,
    totalSteps: GUEST_STEPS.length,
  };
}
